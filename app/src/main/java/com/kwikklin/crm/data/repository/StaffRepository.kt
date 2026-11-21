package com.kwikklin.crm.data.repository

import android.content.Context
import com.kwikklin.crm.data.crm.CrmConnectionPrefs
import com.kwikklin.crm.data.crm.CrmHealthChecker
import com.kwikklin.crm.data.crm.CrmHealthResult
import com.kwikklin.crm.data.network.ApiErrorDto
import com.kwikklin.crm.data.network.BillsListResponse
import com.kwikklin.crm.data.network.BootResponse
import com.kwikklin.crm.data.network.CashHandoverRequest
import com.kwikklin.crm.data.network.CashSummaryDto
import com.kwikklin.crm.data.network.ChangePasswordRequest
import com.kwikklin.crm.data.network.CollectPaymentRequest
import com.kwikklin.crm.data.network.CreateBillRequest
import com.kwikklin.crm.data.network.CreateBillResponse
import com.kwikklin.crm.data.network.CreateExpenseRequest
import com.kwikklin.crm.data.network.CustomerRewardsResponse
import com.kwikklin.crm.data.network.CustomerSearchHitDto
import com.kwikklin.crm.data.network.DeliverOrderRequest
import com.kwikklin.crm.data.network.ExpensesResponse
import com.kwikklin.crm.data.network.GenericActionResponse
import com.kwikklin.crm.data.network.LoginRequest
import com.kwikklin.crm.data.network.OtpSendRequest
import com.kwikklin.crm.data.network.OtpSendResponse
import com.kwikklin.crm.data.network.OtpShopChoiceDto
import com.kwikklin.crm.data.network.OtpVerifyErrorDto
import com.kwikklin.crm.data.network.OtpVerifyRequest
import com.kwikklin.crm.data.network.NetworkMonitor
import com.kwikklin.crm.data.network.NotHomeRequest
import com.kwikklin.crm.data.network.NotificationsResponse
import com.kwikklin.crm.data.network.OrderCallResponse
import com.kwikklin.crm.data.network.OrderDetailDto
import com.kwikklin.crm.data.network.OrderDuesResponse
import com.kwikklin.crm.data.network.OrderReceiptDto
import com.kwikklin.crm.data.network.PickupBillContextDto
import com.kwikklin.crm.data.network.PointsDto
import com.kwikklin.crm.data.network.RateCardItemDto
import com.kwikklin.crm.data.network.RouteResponse
import com.kwikklin.crm.data.network.StaffApiClientFactory
import com.kwikklin.crm.data.network.StaffApiService
import com.kwikklin.crm.data.network.StartWashingRequest
import com.kwikklin.crm.data.network.StatusUpdateRequest
import com.kwikklin.crm.data.network.TaskAskRequest
import com.kwikklin.crm.data.network.TaskCancelRequestBody
import com.kwikklin.crm.data.network.TaskDoneRequest
import com.kwikklin.crm.data.network.TaskMessagesResponse
import com.kwikklin.crm.data.network.TasksResponse
import com.kwikklin.crm.data.network.UsualItemsResponse
import com.kwikklin.crm.data.outbox.OfflineActionDao
import com.kwikklin.crm.data.outbox.OfflineActionEntity
import com.kwikklin.crm.data.outbox.OfflineOutboxWorker
import com.kwikklin.crm.data.outbox.OutboxReplayer
import com.kwikklin.crm.data.outbox.OutboxSyncSummary
import com.kwikklin.crm.data.security.SecureCookieJar
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.encodeToString
import retrofit2.Response
import java.io.IOException
import java.util.UUID

sealed interface ApiOutcome<out T> {
    data class Success<T>(val data: T) : ApiOutcome<T>
    data class QueuedOffline(val actionLabel: String) : ApiOutcome<Nothing>
    data class Unauthorized(val message: String) : ApiOutcome<Nothing>
    data class MustChangePassword(val message: String) : ApiOutcome<Nothing>
    data class SubscriptionOrLimitError(val code: Int, val message: String) : ApiOutcome<Nothing>
    data class ConflictResolved(val message: String) : ApiOutcome<Nothing>
    data class NetworkError(val message: String) : ApiOutcome<Nothing>
    data class ServerError(val code: Int, val message: String) : ApiOutcome<Nothing>
}

/**
 * Outcome of the WhatsApp OTP verify step. Kept separate from [ApiOutcome] because
 * "choose your shop" (HTTP 409) must not be confused with the order-conflict 409.
 */
sealed interface OtpVerifyResult {
    data class Success(val boot: BootResponse) : OtpVerifyResult
    /** Same phone works at several laundries: ask which one, then verify again with shopId. */
    data class ChooseShop(val shops: List<OtpShopChoiceDto>) : OtpVerifyResult
    data class WrongCode(val message: String, val attemptsLeft: Int?) : OtpVerifyResult
    /** Code expired or was used up: the staff must request a fresh one. */
    data class Expired(val message: String) : OtpVerifyResult
    data class SubscriptionError(val message: String) : OtpVerifyResult
    data class NetworkError(val message: String) : OtpVerifyResult
    data class Failed(val message: String) : OtpVerifyResult
}

/**
 * Single source of truth for Kwik Klin staff operations.
 * Connects directly to FastAPI /staff/api endpoints with Keystore-encrypted cookies
 * and uses Room ONLY for safe offline status-only action queueing.
 */
class StaffRepository(
    private val context: Context,
    private val api: StaffApiService,
    private val cookieJar: SecureCookieJar,
    private val outboxDao: OfflineActionDao,
    private val outboxReplayer: OutboxReplayer,
    val connectionPrefs: CrmConnectionPrefs,
    val networkMonitor: NetworkMonitor
) {
    private val json = StaffApiClientFactory.json

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnline

    fun hasSavedSessionCookie(): Boolean = cookieJar.hasActiveSessionCookie()

    fun observeOutboxForStaff(staffPhone: String): Flow<List<OfflineActionEntity>> =
        outboxDao.observeForStaff(staffPhone)

    suspend fun pingServer(baseUrl: String): CrmHealthResult =
        CrmHealthChecker.pingHealth(baseUrl)

    // ─── Auth & Session ─────────────────────────────────────────────────────
    suspend fun login(phone: String, password: String): ApiOutcome<BootResponse> {
        val cleanPhone = normalizePhone(phone)
        val loginOutcome = executeOnline { api.login(LoginRequest(cleanPhone, password)) }
        return when (loginOutcome) {
            is ApiOutcome.Success, is ApiOutcome.ConflictResolved -> bootSession()
            is ApiOutcome.QueuedOffline -> ApiOutcome.NetworkError("Login requires an internet connection.")
            is ApiOutcome.MustChangePassword,
            is ApiOutcome.SubscriptionOrLimitError,
            is ApiOutcome.Unauthorized,
            is ApiOutcome.NetworkError,
            is ApiOutcome.ServerError -> loginOutcome
        }
    }

    /**
     * WhatsApp OTP login, step 1. The code is sent by the Kwik Klin platform WhatsApp
     * number (not the shop's own number), so login works even when a shop's WhatsApp
     * link is down.
     */
    suspend fun requestLoginOtp(phone: String): ApiOutcome<OtpSendResponse> {
        val cleanPhone = normalizePhone(phone)
        if (!networkMonitor.checkCurrentlyOnline()) {
            return ApiOutcome.NetworkError("Sending a WhatsApp code requires an internet connection.")
        }
        return executeOnline { api.sendLoginOtp(OtpSendRequest(cleanPhone)) }
    }

    /** WhatsApp OTP login, step 2. On success the kk_staff cookie is stored and the session is booted. */
    suspend fun loginWithOtp(phone: String, code: String, shopId: String? = null): OtpVerifyResult {
        val cleanPhone = normalizePhone(phone)
        val cleanCode = code.filter { it.isDigit() }
        val response = try {
            api.verifyLoginOtp(OtpVerifyRequest(cleanPhone, cleanCode, shopId))
        } catch (_: IOException) {
            return OtpVerifyResult.NetworkError("No internet connection or Kwik Klin server is unreachable.")
        } catch (e: Exception) {
            return OtpVerifyResult.Failed(e.localizedMessage ?: "Unexpected network error.")
        }

        if (response.isSuccessful) {
            return when (val boot = bootSession()) {
                is ApiOutcome.Success -> OtpVerifyResult.Success(boot.data)
                is ApiOutcome.SubscriptionOrLimitError -> OtpVerifyResult.SubscriptionError(boot.message)
                is ApiOutcome.NetworkError -> OtpVerifyResult.NetworkError(boot.message)
                is ApiOutcome.Unauthorized -> OtpVerifyResult.Failed(boot.message)
                is ApiOutcome.MustChangePassword -> OtpVerifyResult.Failed(boot.message)
                is ApiOutcome.ServerError -> OtpVerifyResult.Failed(boot.message)
                is ApiOutcome.ConflictResolved -> OtpVerifyResult.Failed(boot.message)
                is ApiOutcome.QueuedOffline -> OtpVerifyResult.NetworkError("Login requires an internet connection.")
            }
        }

        val raw = runCatching { response.errorBody()?.string().orEmpty() }.getOrDefault("")
        val parsed = runCatching { json.decodeFromString<OtpVerifyErrorDto>(raw) }.getOrNull()
        val detail = parsed?.detail?.takeIf { it.isNotBlank() } ?: raw.take(180)
        return when (response.code()) {
            409 -> if (parsed?.shops?.isNotEmpty() == true) {
                OtpVerifyResult.ChooseShop(parsed.shops)
            } else {
                OtpVerifyResult.Failed(detail.ifBlank { "Could not complete sign in." })
            }
            401 -> OtpVerifyResult.WrongCode(
                detail.ifBlank { "Wrong code. Check the WhatsApp message and try again." },
                parsed?.attemptsLeft
            )
            410 -> OtpVerifyResult.Expired(detail.ifBlank { "This code has expired. Request a new one." })
            402, 403 -> OtpVerifyResult.SubscriptionError(
                detail.ifBlank { "Shop subscription requires renewal. Please contact your shop owner." }
            )
            429 -> OtpVerifyResult.Expired(detail.ifBlank { "Too many wrong attempts. Request a new code." })
            else -> OtpVerifyResult.Failed(detail.ifBlank { "Request failed (HTTP ${response.code()})." })
        }
    }

    private fun normalizePhone(phone: String): String = phone.filter { it.isDigit() || it == '+' }.trim()

    suspend fun bootSession(): ApiOutcome<BootResponse> {
        val outcome = executeOnline { api.boot() }
        if (outcome is ApiOutcome.Success) {
            // Keep outbox strictly scoped to the currently logged-in staff phone
            val phone = outcome.data.me.phone
            if (phone.isNotBlank()) {
                outboxDao.deleteNotOwnedBy(phone)
            }
        }
        return outcome
    }

    suspend fun changePassword(oldPassword: String, newPassword: String): ApiOutcome<GenericActionResponse> =
        executeOnline { api.changePassword(ChangePasswordRequest(oldPassword, newPassword)) }

    suspend fun logoutAndWipeLocalState() {
        runCatching { api.logout() }
        wipeLocalSessionOnly()
    }

    suspend fun wipeLocalSessionOnly() {
        cookieJar.clearAll()
        outboxDao.clearAll()
    }

    // ─── Live Server Reads (Never cached stale in Room) ─────────────────────
    suspend fun fetchRoute(tab: String = "todo", limit: Int = 50, offset: Int = 0): ApiOutcome<RouteResponse> =
        executeOnline { api.getRoute(tab = tab, limit = limit, offset = offset) }

    suspend fun fetchTasks(tab: String = "mine", limit: Int = 100, offset: Int = 0): ApiOutcome<TasksResponse> =
        executeOnline { api.getTasks(tab = tab, limit = limit, offset = offset) }

    suspend fun fetchOrderDetail(number: String): ApiOutcome<OrderDetailDto> =
        executeOnline { api.getOrderDetail(number) }

    suspend fun fetchNotifications(): ApiOutcome<NotificationsResponse> =
        executeOnline { api.getNotifications() }

    suspend fun fetchPoints(): ApiOutcome<PointsDto> =
        executeOnline { api.getPoints() }

    suspend fun fetchMyCash(): ApiOutcome<CashSummaryDto> =
        executeOnline { api.getMyCash() }

    suspend fun fetchCustomerPhone(orderNumber: String): ApiOutcome<OrderCallResponse> =
        executeOnline { api.getCustomerCallPhone(orderNumber) }

    suspend fun fetchOrderDues(orderNumber: String): ApiOutcome<OrderDuesResponse> =
        executeOnline { api.getOrderDues(orderNumber) }

    suspend fun fetchTaskMessages(code: String): ApiOutcome<TaskMessagesResponse> =
        executeOnline { api.getTaskMessages(code) }

    // ─── Strictly Online-Only Mutations ─────────────────────────────────────
    suspend fun collectPaymentOnlineOnly(
        orderNumber: String,
        amount: Double,
        method: String,
        settlePrevious: Boolean,
        clientRef: String = UUID.randomUUID().toString()
    ): ApiOutcome<GenericActionResponse> =
        executeOnlineOnly("Payment recording requires live internet. Never record cash or UPI offline.") {
            api.collectPayment(
                number = orderNumber,
                body = CollectPaymentRequest(
                    amount = amount,
                    method = method,
                    settlePrevious = settlePrevious,
                    clientRef = clientRef
                )
            )
        }

    suspend fun submitCashHandoverOnlineOnly(
        handedCash: Double,
        note: String
    ): ApiOutcome<GenericActionResponse> =
        executeOnlineOnly("Cash handover requires an active internet connection.") {
            api.submitCashHandover(CashHandoverRequest(handedCash, note))
        }

    suspend fun markTaskDone(code: String, note: String): ApiOutcome<GenericActionResponse> =
        executeOnline { api.markTaskDone(code, TaskDoneRequest(note)) }

    suspend fun sendTaskMessage(code: String, text: String): ApiOutcome<GenericActionResponse> =
        executeOnline { api.sendTaskMessage(code, TaskAskRequest(text)) }

    suspend fun requestTaskCancel(code: String, reason: String): ApiOutcome<GenericActionResponse> =
        executeOnline { api.requestTaskCancel(code, TaskCancelRequestBody(reason)) }

    // ─── Web-Parity Billing, Rate Card, Customer Search, Receipts, Expenses ─
    suspend fun fetchRates(): ApiOutcome<List<RateCardItemDto>> =
        executeOnline { api.getRates() }

    suspend fun searchCustomers(query: String): ApiOutcome<List<CustomerSearchHitDto>> =
        executeOnline { api.searchCustomers(query) }

    suspend fun fetchCustomerRewards(ref: String): ApiOutcome<CustomerRewardsResponse> =
        executeOnline { api.getCustomerRewards(ref) }

    suspend fun fetchCustomerUsualItems(ref: String): ApiOutcome<UsualItemsResponse> =
        executeOnline { api.getCustomerUsualItems(ref) }

    suspend fun fetchPickupBillContext(code: String): ApiOutcome<PickupBillContextDto> =
        executeOnline { api.getPickupBillContext(code) }

    suspend fun createBillOnlineOnly(request: CreateBillRequest): ApiOutcome<CreateBillResponse> =
        executeOnlineOnly("Creating a bill requires an active internet connection.") {
            api.createBill(request)
        }

    suspend fun fetchBills(
        query: String? = null,
        payFilter: String? = null,
        mineOnly: Boolean = false,
        limit: Int = 30,
        offset: Int = 0
    ): ApiOutcome<BillsListResponse> = executeOnline {
        api.getBills(
            query = query?.takeIf { it.isNotBlank() },
            pay = payFilter?.takeIf { it == "due" || it == "paid" },
            mine = if (mineOnly) 1 else null,
            limit = limit,
            offset = offset
        )
    }

    suspend fun fetchOrderReceipt(orderNumber: String): ApiOutcome<OrderReceiptDto> =
        executeOnline { api.getOrderReceipt(orderNumber) }

    suspend fun fetchExpenses(): ApiOutcome<ExpensesResponse> =
        executeOnline { api.getExpenses() }

    suspend fun createExpenseOnlineOnly(request: CreateExpenseRequest): ApiOutcome<GenericActionResponse> =
        executeOnlineOnly("Saving an expense requires an active internet connection.") {
            api.createExpense(request)
        }

    // ─── Safe Status-Only Actions (Live-first, Queueable Offline) ───────────
    suspend fun markOrderPickedUp(staffPhone: String, orderNumber: String) =
        statusAction(staffPhone, orderNumber, "picked-up", "Mark Picked Up", "{}") { key ->
            api.markPickedUp(orderNumber, key)
        }

    suspend fun startOrderWashing(
        staffPhone: String,
        orderNumber: String,
        request: StartWashingRequest = StartWashingRequest()
    ) = statusAction(staffPhone, orderNumber, "washing", "Start Washing", json.encodeToString(request)) { key ->
        api.startWashing(orderNumber, request, key)
    }

    suspend fun markOrderReady(staffPhone: String, orderNumber: String) =
        statusAction(staffPhone, orderNumber, "ready", "Mark Ready", "{}") { key ->
            api.markReady(orderNumber, key)
        }

    suspend fun updateOrderStatus(
        staffPhone: String,
        orderNumber: String,
        targetStageWire: String,
        actionLabel: String
    ): ApiOutcome<GenericActionResponse> {
        val body = StatusUpdateRequest(status = targetStageWire)
        return statusAction(staffPhone, orderNumber, "status", actionLabel, json.encodeToString(body)) { key ->
            api.updateOrderStatus(orderNumber, body, key)
        }
    }

    suspend fun deliverOrder(
        staffPhone: String,
        orderNumber: String,
        request: DeliverOrderRequest = DeliverOrderRequest(items = null)
    ) = statusAction(staffPhone, orderNumber, "deliver", "Mark Delivered", json.encodeToString(request)) { key ->
        api.deliverOrder(orderNumber, request, key)
    }

    suspend fun markCustomerNotHome(
        staffPhone: String,
        orderNumber: String,
        note: String
    ): ApiOutcome<GenericActionResponse> {
        val body = NotHomeRequest(note = note.trim())
        return statusAction(staffPhone, orderNumber, "not-home", "Customer Not Home", json.encodeToString(body)) { key ->
            api.markNotHome(orderNumber, body, key)
        }
    }

    // ─── Outbox Manual Sync & Management ────────────────────────────────────
    suspend fun syncOutboxNow(): OutboxSyncSummary = outboxReplayer.replayAll()

    suspend fun removeOutboxItem(id: Long) {
        outboxDao.deleteById(id)
    }

    // ─── Internal Helpers ───────────────────────────────────────────────────
    /**
     * Live-first status update. If the device is offline, or the request fails with an
     * IOException, the exact same request (same idempotency key) is queued for replay.
     */
    private suspend fun statusAction(
        staffPhone: String,
        orderNumber: String,
        pathSuffix: String,
        actionLabel: String,
        payloadJson: String,
        call: suspend (idempotencyKey: String) -> Response<GenericActionResponse>
    ): ApiOutcome<GenericActionResponse> {
        val key = UUID.randomUUID().toString()
        val queue: suspend () -> ApiOutcome<GenericActionResponse> = {
            outboxDao.insert(
                OfflineActionEntity(
                    staffPhone = staffPhone,
                    orderNumber = orderNumber,
                    endpointPath = "staff/api/orders/$orderNumber/$pathSuffix",
                    payloadJson = payloadJson,
                    actionLabel = actionLabel,
                    idempotencyKey = key
                )
            )
            OfflineOutboxWorker.enqueue(context)
            ApiOutcome.QueuedOffline(actionLabel)
        }
        if (!networkMonitor.checkCurrentlyOnline()) return queue()
        return try {
            parseResponse(call(key))
        } catch (_: IOException) {
            queue()
        } catch (e: Exception) {
            ApiOutcome.ServerError(0, e.localizedMessage ?: "Action failed.")
        }
    }

    /** For money/billing calls that must never be queued or retried offline. */
    private suspend fun <T> executeOnlineOnly(
        offlineMessage: String,
        call: suspend () -> Response<T>
    ): ApiOutcome<T> {
        if (!networkMonitor.checkCurrentlyOnline()) return ApiOutcome.NetworkError(offlineMessage)
        return executeOnline(call)
    }

    private suspend fun <T> executeOnline(call: suspend () -> Response<T>): ApiOutcome<T> {
        return try {
            val response = call()
            parseResponse(response)
        } catch (_: IOException) {
            ApiOutcome.NetworkError("No internet connection or Kwik Klin server is unreachable.")
        } catch (e: Exception) {
            ApiOutcome.ServerError(0, e.localizedMessage ?: "Unexpected network error.")
        }
    }

    private fun <T> parseResponse(response: Response<T>): ApiOutcome<T> {
        val code = response.code()
        if (response.isSuccessful) {
            val body = response.body()
            if (body != null) return ApiOutcome.Success(body)
            @Suppress("UNCHECKED_CAST")
            return ApiOutcome.Success(GenericActionResponse(ok = true) as T)
        }

        val errMsg = extractErrorMessage(response)
        return when (code) {
            401 -> ApiOutcome.Unauthorized(errMsg.ifBlank { "Your session expired. Please sign in again." })
            402 -> ApiOutcome.SubscriptionOrLimitError(
                code = 402,
                message = errMsg.ifBlank { "Shop subscription requires renewal. Please contact your shop owner." }
            )
            403 -> {
                if (errMsg.startsWith("Change your password first", ignoreCase = true) ||
                    errMsg.contains("must_change_password", ignoreCase = true)
                ) {
                    ApiOutcome.MustChangePassword(errMsg)
                } else if (errMsg.contains("plan", ignoreCase = true) ||
                    errMsg.contains("subscription", ignoreCase = true) ||
                    errMsg.contains("limit", ignoreCase = true) ||
                    errMsg.contains("upgrade", ignoreCase = true)
                ) {
                    ApiOutcome.SubscriptionOrLimitError(403, errMsg)
                } else {
                    ApiOutcome.ServerError(403, errMsg.ifBlank { "You do not have permission for this action." })
                }
            }
            409 -> ApiOutcome.ConflictResolved(
                errMsg.ifBlank { "This order was already updated on the server." }
            )
            else -> ApiOutcome.ServerError(
                code = code,
                message = errMsg.ifBlank { "Request failed (HTTP $code)." }
            )
        }
    }

    private fun <T> extractErrorMessage(response: Response<T>): String {
        val raw = runCatching { response.errorBody()?.string().orEmpty() }.getOrDefault("")
        if (raw.isBlank()) return ""
        val parsed = runCatching { json.decodeFromString<ApiErrorDto>(raw) }.getOrNull()
        return parsed?.detail ?: parsed?.message ?: parsed?.error ?: raw.take(180)
    }
}
