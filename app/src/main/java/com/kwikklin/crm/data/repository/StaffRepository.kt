package com.kwikklin.crm.data.repository

import android.content.Context
import com.kwikklin.crm.data.crm.CrmConnectionPrefs
import com.kwikklin.crm.data.crm.CrmHealthChecker
import com.kwikklin.crm.data.crm.CrmHealthResult
import com.kwikklin.crm.data.network.AdvanceStageRequest
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
import com.kwikklin.crm.data.network.SaveLocationRequest
import com.kwikklin.crm.data.network.StaffApiClientFactory
import com.kwikklin.crm.data.network.StaffApiService
import com.kwikklin.crm.data.network.StartWashingRequest
import com.kwikklin.crm.data.network.StatusUpdateRequest
import com.kwikklin.crm.data.network.TaskAskRequest
import com.kwikklin.crm.data.network.TaskCancelRequestBody
import com.kwikklin.crm.data.network.TaskDoneRequest
import com.kwikklin.crm.data.network.TaskMessagesResponse
import com.kwikklin.crm.data.network.TasksResponse
import com.kwikklin.crm.data.network.TodayDto
import com.kwikklin.crm.data.network.UsualItemsResponse
import com.kwikklin.crm.data.outbox.OfflineActionDao
import com.kwikklin.crm.data.outbox.OfflineActionEntity
import com.kwikklin.crm.data.outbox.OfflineOutboxWorker
import com.kwikklin.crm.data.security.SecureCookieJar
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.encodeToString
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
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

data class OutboxSyncSummary(
    val syncedCount: Int,
    val droppedCount: Int,
    val remainingCount: Int,
    val unauthorized: Boolean
)

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
    val connectionPrefs: CrmConnectionPrefs,
    val networkMonitor: NetworkMonitor
) {
    private val json = StaffApiClientFactory.json

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnline

    fun hasSavedSessionCookie(): Boolean = cookieJar.hasActiveSessionCookie()

    fun observeOutboxForStaff(staffPhone: String): Flow<List<OfflineActionEntity>> =
        outboxDao.observeForStaff(staffPhone)

    fun observeOutboxCount(staffPhone: String): Flow<Int> =
        outboxDao.observeCountForStaff(staffPhone)

    suspend fun pingServer(baseUrl: String): CrmHealthResult =
        CrmHealthChecker.pingHealth(baseUrl)

    // ─── Auth & Session ─────────────────────────────────────────────────────
    suspend fun login(phone: String, password: String): ApiOutcome<BootResponse> {
        val cleanPhone = phone.filter { it.isDigit() || it == '+' }.trim()
        val loginOutcome = executeOnline { api.login(LoginRequest(cleanPhone, password)) }
        return when (loginOutcome) {
            is ApiOutcome.Success -> bootSession()
            is ApiOutcome.MustChangePassword -> loginOutcome
            is ApiOutcome.SubscriptionOrLimitError -> loginOutcome
            is ApiOutcome.Unauthorized -> loginOutcome
            is ApiOutcome.NetworkError -> loginOutcome
            is ApiOutcome.ServerError -> loginOutcome
            is ApiOutcome.ConflictResolved -> bootSession()
            is ApiOutcome.QueuedOffline -> ApiOutcome.NetworkError("Login requires an internet connection.")
        }
    }

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
        cookieJar.clearAll()
        outboxDao.clearAll()
    }

    suspend fun wipeLocalSessionOnly() {
        cookieJar.clearAll()
        outboxDao.clearAll()
    }

    // ─── Live Server Reads (Never cached stale in Room) ─────────────────────
    suspend fun fetchToday(): ApiOutcome<TodayDto> = executeOnline { api.today() }

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
    ): ApiOutcome<GenericActionResponse> {
        if (!networkMonitor.checkCurrentlyOnline()) {
            return ApiOutcome.NetworkError(
                "Payment recording requires live internet. Never record cash or UPI offline."
            )
        }
        return executeOnline {
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
    }

    suspend fun submitCashHandoverOnlineOnly(
        handedCash: Double,
        note: String
    ): ApiOutcome<GenericActionResponse> {
        if (!networkMonitor.checkCurrentlyOnline()) {
            return ApiOutcome.NetworkError("Cash handover requires an active internet connection.")
        }
        return executeOnline { api.submitCashHandover(CashHandoverRequest(handedCash, note)) }
    }

    suspend fun saveCustomerLocation(
        customerRef: String,
        lat: Double,
        lng: Double,
        accuracyM: Double?
    ): ApiOutcome<GenericActionResponse> = executeOnline {
        api.saveCustomerLocation(customerRef, SaveLocationRequest(lat, lng, accuracyM))
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

    suspend fun createBillOnlineOnly(request: CreateBillRequest): ApiOutcome<CreateBillResponse> {
        if (!networkMonitor.checkCurrentlyOnline()) {
            return ApiOutcome.NetworkError("Creating a bill requires an active internet connection.")
        }
        return executeOnline { api.createBill(request) }
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

    suspend fun createExpenseOnlineOnly(request: CreateExpenseRequest): ApiOutcome<GenericActionResponse> {
        if (!networkMonitor.checkCurrentlyOnline()) {
            return ApiOutcome.NetworkError("Saving an expense requires an active internet connection.")
        }
        return executeOnline { api.createExpense(request) }
    }

    // ─── Safe Status-Only Actions (Live-first, Queueable Offline) ───────────
    suspend fun markOrderPickedUp(staffPhone: String, orderNumber: String): ApiOutcome<GenericActionResponse> {
        val key = UUID.randomUUID().toString()
        return executeStatusActionOrQueue(
            staffPhone = staffPhone,
            orderNumber = orderNumber,
            endpointPath = "staff/api/orders/$orderNumber/picked-up",
            payloadJson = "{}",
            actionLabel = "Mark Picked Up",
            idempotencyKey = key
        ) { api.markPickedUp(orderNumber, key) }
    }

    suspend fun startOrderWashing(
        staffPhone: String,
        orderNumber: String,
        request: StartWashingRequest = StartWashingRequest()
    ): ApiOutcome<GenericActionResponse> {
        val key = UUID.randomUUID().toString()
        val payload = json.encodeToString(request)
        return executeStatusActionOrQueue(
            staffPhone = staffPhone,
            orderNumber = orderNumber,
            endpointPath = "staff/api/orders/$orderNumber/washing",
            payloadJson = payload,
            actionLabel = "Start Washing",
            idempotencyKey = key
        ) { api.startWashing(orderNumber, request, key) }
    }

    suspend fun markOrderReady(staffPhone: String, orderNumber: String): ApiOutcome<GenericActionResponse> {
        val key = UUID.randomUUID().toString()
        return executeStatusActionOrQueue(
            staffPhone = staffPhone,
            orderNumber = orderNumber,
            endpointPath = "staff/api/orders/$orderNumber/ready",
            payloadJson = "{}",
            actionLabel = "Mark Ready",
            idempotencyKey = key
        ) { api.markReady(orderNumber, key) }
    }

    suspend fun updateOrderStatus(
        staffPhone: String,
        orderNumber: String,
        targetStageWire: String,
        actionLabel: String
    ): ApiOutcome<GenericActionResponse> {
        val key = UUID.randomUUID().toString()
        val body = StatusUpdateRequest(status = targetStageWire)
        val payload = json.encodeToString(body)
        return executeStatusActionOrQueue(
            staffPhone = staffPhone,
            orderNumber = orderNumber,
            endpointPath = "staff/api/orders/$orderNumber/status",
            payloadJson = payload,
            actionLabel = actionLabel,
            idempotencyKey = key
        ) { api.updateOrderStatus(orderNumber, body, key) }
    }

    suspend fun advanceOrderStage(
        staffPhone: String,
        orderNumber: String,
        targetStageWire: String,
        actionLabel: String
    ): ApiOutcome<GenericActionResponse> {
        val key = UUID.randomUUID().toString()
        val body = AdvanceStageRequest(to = targetStageWire)
        val payload = json.encodeToString(body)
        return executeStatusActionOrQueue(
            staffPhone = staffPhone,
            orderNumber = orderNumber,
            endpointPath = "staff/api/orders/$orderNumber/advance",
            payloadJson = payload,
            actionLabel = actionLabel,
            idempotencyKey = key
        ) { api.advanceOrderStage(orderNumber, body, key) }
    }

    suspend fun deliverOrder(
        staffPhone: String,
        orderNumber: String,
        request: DeliverOrderRequest = DeliverOrderRequest(items = null),
        actionLabel: String = "Mark Delivered"
    ): ApiOutcome<GenericActionResponse> {
        val key = UUID.randomUUID().toString()
        val payload = json.encodeToString(request)
        return executeStatusActionOrQueue(
            staffPhone = staffPhone,
            orderNumber = orderNumber,
            endpointPath = "staff/api/orders/$orderNumber/deliver",
            payloadJson = payload,
            actionLabel = actionLabel,
            idempotencyKey = key
        ) { api.deliverOrder(orderNumber, request, key) }
    }

    suspend fun markCustomerNotHome(
        staffPhone: String,
        orderNumber: String,
        note: String
    ): ApiOutcome<GenericActionResponse> {
        val key = UUID.randomUUID().toString()
        val body = NotHomeRequest(note = note.trim())
        val payload = json.encodeToString(body)
        return executeStatusActionOrQueue(
            staffPhone = staffPhone,
            orderNumber = orderNumber,
            endpointPath = "staff/api/orders/$orderNumber/not-home",
            payloadJson = payload,
            actionLabel = "Customer Not Home",
            idempotencyKey = key
        ) { api.markNotHome(orderNumber, body, key) }
    }

    // ─── Outbox Manual Sync & Management ────────────────────────────────────
    suspend fun syncOutboxNow(): OutboxSyncSummary {
        val pending = outboxDao.getAllPending()
        if (pending.isEmpty()) return OutboxSyncSummary(0, 0, 0, false)

        var synced = 0
        var dropped = 0
        var remaining = 0
        var unauthorized = false

        for (item in pending) {
            try {
                val body = item.payloadJson.toRequestBody("application/json; charset=utf-8".toMediaType())
                val resp = api.replayRawPost(
                    relativePath = item.endpointPath,
                    body = body,
                    idempotencyKey = item.idempotencyKey
                )
                when (val code = resp.code()) {
                    in 200..299, 409 -> {
                        outboxDao.deleteById(item.id)
                        synced++
                    }
                    401 -> {
                        unauthorized = true
                        remaining++
                        break
                    }
                    in 400..499 -> {
                        outboxDao.deleteById(item.id)
                        dropped++
                    }
                    else -> {
                        outboxDao.recordFailure(item.id, "Server HTTP $code")
                        remaining++
                    }
                }
            } catch (e: IOException) {
                outboxDao.recordFailure(item.id, e.localizedMessage ?: "No internet connection")
                remaining += (pending.size - synced - dropped)
                break
            }
        }
        return OutboxSyncSummary(synced, dropped, remaining, unauthorized)
    }

    suspend fun removeOutboxItem(id: Long) {
        outboxDao.deleteById(id)
    }

    // ─── Internal Helpers ───────────────────────────────────────────────────
    private suspend fun executeStatusActionOrQueue(
        staffPhone: String,
        orderNumber: String,
        endpointPath: String,
        payloadJson: String,
        actionLabel: String,
        idempotencyKey: String,
        call: suspend () -> Response<GenericActionResponse>
    ): ApiOutcome<GenericActionResponse> {
        if (!networkMonitor.checkCurrentlyOnline()) {
            enqueueOfflineStatus(staffPhone, orderNumber, endpointPath, payloadJson, actionLabel, idempotencyKey)
            return ApiOutcome.QueuedOffline(actionLabel)
        }
        return try {
            val response = call()
            parseResponse(response)
        } catch (_: IOException) {
            enqueueOfflineStatus(staffPhone, orderNumber, endpointPath, payloadJson, actionLabel, idempotencyKey)
            ApiOutcome.QueuedOffline(actionLabel)
        } catch (e: Exception) {
            ApiOutcome.ServerError(0, e.localizedMessage ?: "Action failed.")
        }
    }

    private suspend fun enqueueOfflineStatus(
        staffPhone: String,
        orderNumber: String,
        endpointPath: String,
        payloadJson: String,
        actionLabel: String,
        idempotencyKey: String
    ) {
        outboxDao.insert(
            OfflineActionEntity(
                staffPhone = staffPhone,
                orderNumber = orderNumber,
                endpointPath = endpointPath,
                payloadJson = payloadJson,
                actionLabel = actionLabel,
                idempotencyKey = idempotencyKey
            )
        )
        OfflineOutboxWorker.enqueue(context)
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
