package com.kwikklin.crm.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.kwikklin.crm.data.crm.CrmHealthResult
import com.kwikklin.crm.data.network.BillListItemDto
import com.kwikklin.crm.data.network.BootResponse
import com.kwikklin.crm.data.network.CashSummaryDto
import com.kwikklin.crm.data.network.CreateBillRequest
import com.kwikklin.crm.data.network.CreateBillResponse
import com.kwikklin.crm.data.network.CreateExpenseRequest
import com.kwikklin.crm.data.network.CustomerRewardDto
import com.kwikklin.crm.data.network.CustomerSearchHitDto
import com.kwikklin.crm.data.network.DeliverOrderRequest
import com.kwikklin.crm.data.network.ExpensesResponse
import com.kwikklin.crm.data.network.NotificationItemDto
import com.kwikklin.crm.data.network.OrderDetailDto
import com.kwikklin.crm.data.network.OrderDuesResponse
import com.kwikklin.crm.data.network.OrderReceiptDto
import com.kwikklin.crm.data.network.PickupBillContextDto
import com.kwikklin.crm.data.network.PointsDto
import com.kwikklin.crm.data.network.RateCardItemDto
import com.kwikklin.crm.data.network.RouteStopDto
import com.kwikklin.crm.data.network.StaffMeDto
import com.kwikklin.crm.data.network.StartWashingRequest
import com.kwikklin.crm.data.network.TaskDto
import com.kwikklin.crm.data.network.TaskMessagesResponse
import com.kwikklin.crm.data.network.TodayDto
import com.kwikklin.crm.data.network.UsualItemDto
import com.kwikklin.crm.data.notifications.StaffNotificationHelper
import com.kwikklin.crm.data.outbox.OfflineActionEntity
import com.kwikklin.crm.data.repository.ApiOutcome
import com.kwikklin.crm.data.repository.StaffRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

sealed interface SessionState {
    data object Splash : SessionState
    data class LoggedOut(val reason: String? = null) : SessionState
    data class Authenticated(val me: StaffMeDto) : SessionState
    data class NetworkFailure(val message: String, val hadSession: Boolean) : SessionState
}

data class StaffUiState(
    val session: SessionState = SessionState.Splash,
    val isRefreshing: Boolean = false,
    val isSubmitting: Boolean = false,
    val isOnline: Boolean = true,
    val serverBaseUrl: String = "",
    val healthCheck: CrmHealthResult? = null,
    val isCheckingHealth: Boolean = false,
    val loginError: String? = null,
    val subscriptionBanner: String? = null,
    val mustChangePassword: Boolean = false,
    val today: TodayDto = TodayDto(),
    val workStops: List<RouteStopDto> = emptyList(),
    val historyStops: List<RouteStopDto> = emptyList(),
    val myTasks: List<TaskDto> = emptyList(),
    val doneTasks: List<TaskDto> = emptyList(),
    val notifications: List<NotificationItemDto> = emptyList(),
    val unreadNotifications: Int = 0,
    val points: PointsDto? = null,
    val cashSummary: CashSummaryDto? = null,
    val isLoadingCash: Boolean = false,
    val outboxItems: List<OfflineActionEntity> = emptyList(),
    val selectedOrder: OrderDetailDto? = null,
    val isLoadingOrder: Boolean = false,
    val orderLoadError: String? = null,
    val activeOrderDues: OrderDuesResponse? = null,
    val activeTaskThread: TaskMessagesResponse? = null,
    val isLoadingThread: Boolean = false,
    // Web-parity Billing, Bills Register, Receipt & Expenses state
    val rates: List<RateCardItemDto> = emptyList(),
    val isLoadingRates: Boolean = false,
    val customerSearchHits: List<CustomerSearchHitDto> = emptyList(),
    val customerRewards: List<CustomerRewardDto> = emptyList(),
    val customerUsualItems: List<UsualItemDto> = emptyList(),
    val pickupBillContext: PickupBillContextDto? = null,
    val bills: List<BillListItemDto> = emptyList(),
    val billsTotal: Int = 0,
    val isLoadingBills: Boolean = false,
    val activeReceipt: OrderReceiptDto? = null,
    val isLoadingReceipt: Boolean = false,
    val expenses: ExpensesResponse? = null,
    val isLoadingExpenses: Boolean = false
)

sealed interface UiEvent {
    data class Toast(val message: String, val isError: Boolean = false) : UiEvent
    data class DialPhone(val phone: String) : UiEvent
    data class OpenNewBillTab(val fromPickupTask: Boolean = false) : UiEvent
    data class BillCreated(val response: CreateBillResponse) : UiEvent
    data object PasswordChanged : UiEvent
    data object CashHandoverDone : UiEvent
}

class StaffViewModel(
    private val appContext: Context,
    private val repository: StaffRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        StaffUiState(
            isOnline = repository.isOnline.value,
            serverBaseUrl = repository.connectionPrefs.getBaseUrl()
        )
    )
    val uiState: StateFlow<StaffUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<UiEvent>(extraBufferCapacity = 16)
    val events: SharedFlow<UiEvent> = _events.asSharedFlow()

    private var outboxCollectorJob: Job? = null
    private var livePollerJob: Job? = null
    private val seenNotificationCodes = mutableSetOf<String>()

    init {
        observeConnectivity()
        bootstrap()
    }

    private fun observeConnectivity() {
        viewModelScope.launch {
            var previouslyOffline = !repository.isOnline.value
            repository.isOnline.collectLatest { online ->
                _uiState.update { it.copy(isOnline = online) }
                if (online && previouslyOffline && _uiState.value.session is SessionState.Authenticated) {
                    syncOutbox(quiet = true)
                    refreshAll(quiet = true)
                }
                previouslyOffline = !online
            }
        }
    }

    // ─── Bootstrap & Auth ───────────────────────────────────────────────────
    fun bootstrap() {
        viewModelScope.launch {
            _uiState.update { it.copy(session = SessionState.Splash, loginError = null) }
            if (!repository.hasSavedSessionCookie()) {
                _uiState.update { it.copy(session = SessionState.LoggedOut()) }
                return@launch
            }
            when (val res = repository.bootSession()) {
                is ApiOutcome.Success -> applyBootSuccess(res.data, isInitial = true)
                is ApiOutcome.Unauthorized -> {
                    repository.wipeLocalSessionOnly()
                    stopAuthenticatedJobs()
                    _uiState.update { it.copy(session = SessionState.LoggedOut(res.message)) }
                }
                is ApiOutcome.MustChangePassword -> {
                    _uiState.update { it.copy(mustChangePassword = true) }
                }
                is ApiOutcome.SubscriptionOrLimitError -> {
                    _uiState.update {
                        it.copy(
                            session = SessionState.LoggedOut(res.message),
                            subscriptionBanner = res.message
                        )
                    }
                }
                is ApiOutcome.NetworkError -> {
                    _uiState.update {
                        it.copy(session = SessionState.NetworkFailure(res.message, hadSession = true))
                    }
                }
                is ApiOutcome.ServerError -> {
                    _uiState.update {
                        it.copy(session = SessionState.NetworkFailure(res.message, hadSession = true))
                    }
                }
                else -> _uiState.update { it.copy(session = SessionState.LoggedOut()) }
            }
        }
    }

    fun login(phone: String, password: String) {
        if (phone.filter { it.isDigit() }.length < 6 || password.isBlank()) {
            _uiState.update { it.copy(loginError = "Enter a valid phone number and password.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, loginError = null, subscriptionBanner = null) }
            when (val res = repository.login(phone, password)) {
                is ApiOutcome.Success -> {
                    _uiState.update { it.copy(isSubmitting = false, loginError = null) }
                    applyBootSuccess(res.data, isInitial = true)
                }
                is ApiOutcome.Unauthorized -> {
                    _uiState.update { it.copy(isSubmitting = false, loginError = res.message) }
                }
                is ApiOutcome.MustChangePassword -> {
                    _uiState.update { it.copy(isSubmitting = false, mustChangePassword = true) }
                }
                is ApiOutcome.SubscriptionOrLimitError -> {
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            loginError = res.message,
                            subscriptionBanner = res.message
                        )
                    }
                }
                is ApiOutcome.NetworkError -> {
                    _uiState.update { it.copy(isSubmitting = false, loginError = res.message) }
                }
                is ApiOutcome.ServerError -> {
                    _uiState.update { it.copy(isSubmitting = false, loginError = res.message) }
                }
                else -> _uiState.update { it.copy(isSubmitting = false) }
            }
        }
    }

    fun changePassword(oldPassword: String, newPassword: String) {
        if (oldPassword.isBlank() || newPassword.length < 6) {
            emitToast("New password must be at least 6 characters.", isError = true)
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            when (val res = repository.changePassword(oldPassword, newPassword)) {
                is ApiOutcome.Success -> {
                    _uiState.update { it.copy(isSubmitting = false, mustChangePassword = false) }
                    _events.tryEmit(UiEvent.PasswordChanged)
                    emitToast("Password updated successfully.")
                    refreshAll(quiet = true)
                }
                else -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            stopAuthenticatedJobs()
            repository.logoutAndWipeLocalState()
            seenNotificationCodes.clear()
            _uiState.value = StaffUiState(
                session = SessionState.LoggedOut(),
                isOnline = repository.isOnline.value,
                serverBaseUrl = repository.connectionPrefs.getBaseUrl()
            )
            emitToast("Signed out securely.")
        }
    }

    // ─── Server URL & Health Check ──────────────────────────────────────────
    fun updateServerBaseUrl(rawUrl: String) {
        val normalized = repository.connectionPrefs.setBaseUrl(rawUrl)
        _uiState.update { it.copy(serverBaseUrl = normalized, healthCheck = null) }
        checkServerHealth(normalized)
    }

    fun checkServerHealth(url: String = _uiState.value.serverBaseUrl) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCheckingHealth = true) }
            val result = repository.pingServer(url)
            _uiState.update { it.copy(isCheckingHealth = false, healthCheck = result) }
        }
    }

    // ─── Live Data Refresh ──────────────────────────────────────────────────
    fun refreshAll(quiet: Boolean = false) {
        viewModelScope.launch {
            if (!quiet) _uiState.update { it.copy(isRefreshing = true) }
            when (val res = repository.bootSession()) {
                is ApiOutcome.Success -> applyBootSuccess(res.data, isInitial = false)
                else -> handleCommonFailure(res, silentNetwork = quiet)
            }
            if (!quiet) _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    fun loadHistory() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            val routeRes = repository.fetchRoute(tab = "done", limit = 60)
            val tasksRes = repository.fetchTasks(tab = "done", limit = 100)
            if (routeRes is ApiOutcome.Success) {
                _uiState.update { it.copy(historyStops = routeRes.data.stops) }
            } else {
                handleCommonFailure(routeRes)
            }
            if (tasksRes is ApiOutcome.Success) {
                _uiState.update { it.copy(doneTasks = tasksRes.data.tasks) }
            }
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    fun loadNotifications() {
        viewModelScope.launch {
            when (val res = repository.fetchNotifications()) {
                is ApiOutcome.Success -> {
                    detectAndAlertUrgent(res.data.items, suppressAlerts = false)
                    _uiState.update {
                        it.copy(
                            notifications = res.data.items,
                            unreadNotifications = res.data.unread
                        )
                    }
                }
                else -> handleCommonFailure(res, silentNetwork = true)
            }
        }
    }

    fun loadPoints() {
        viewModelScope.launch {
            when (val res = repository.fetchPoints()) {
                is ApiOutcome.Success -> _uiState.update { it.copy(points = res.data) }
                else -> Unit // Points may be hidden on some plans/roles
            }
        }
    }

    fun loadMyCash() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingCash = true) }
            when (val res = repository.fetchMyCash()) {
                is ApiOutcome.Success -> _uiState.update { it.copy(isLoadingCash = false, cashSummary = res.data) }
                else -> {
                    _uiState.update { it.copy(isLoadingCash = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    fun submitCashHandover(handedCash: Double, note: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            when (val res = repository.submitCashHandoverOnlineOnly(handedCash, note)) {
                is ApiOutcome.Success -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    _events.tryEmit(UiEvent.CashHandoverDone)
                    emitToast("Cash handover recorded. Waiting for manager confirmation.")
                    loadMyCash()
                    refreshAll(quiet = true)
                }
                else -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    // ─── Order Details & Strict Status Transitions ──────────────────────────
    fun openOrderDetail(orderNumber: String) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoadingOrder = true,
                    orderLoadError = null,
                    activeOrderDues = null
                )
            }
            when (val res = repository.fetchOrderDetail(orderNumber)) {
                is ApiOutcome.Success -> {
                    _uiState.update { it.copy(isLoadingOrder = false, selectedOrder = res.data) }
                }
                is ApiOutcome.NetworkError -> {
                    _uiState.update { it.copy(isLoadingOrder = false, orderLoadError = res.message) }
                }
                is ApiOutcome.ServerError -> {
                    _uiState.update { it.copy(isLoadingOrder = false, orderLoadError = res.message) }
                }
                else -> {
                    _uiState.update { it.copy(isLoadingOrder = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    fun closeOrderDetail() {
        _uiState.update { it.copy(selectedOrder = null, orderLoadError = null, activeOrderDues = null) }
    }

    fun requestCustomerCall(orderNumber: String) {
        val me = currentMe() ?: return
        if (!me.allowCustomerCall) {
            emitToast("Customer phone calls are restricted for your role.", isError = true)
            return
        }
        viewModelScope.launch {
            when (val res = repository.fetchCustomerPhone(orderNumber)) {
                is ApiOutcome.Success -> {
                    if (res.data.phone.isNotBlank()) {
                        _events.tryEmit(UiEvent.DialPhone(res.data.phone))
                    } else {
                        emitToast("No phone number available for this order.", isError = true)
                    }
                }
                else -> handleCommonFailure(res)
            }
        }
    }

    fun loadOrderDuesForCollect(orderNumber: String) {
        viewModelScope.launch {
            when (val res = repository.fetchOrderDues(orderNumber)) {
                is ApiOutcome.Success -> _uiState.update { it.copy(activeOrderDues = res.data) }
                else -> Unit
            }
        }
    }

    fun collectPayment(orderNumber: String, amount: Double, method: String, settlePrevious: Boolean) {
        val me = currentMe() ?: return
        if (!me.allowFinancialVisibility) {
            emitToast("Payment collection is not permitted for your role.", isError = true)
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            when (val res = repository.collectPaymentOnlineOnly(orderNumber, amount, method, settlePrevious)) {
                is ApiOutcome.Success -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    emitToast("Payment recorded (${method.uppercase()}).")
                    refreshAll(quiet = true)
                    if (_uiState.value.selectedOrder?.number == orderNumber) {
                        openOrderDetail(orderNumber)
                    }
                }
                else -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    fun markPickedUp(orderNumber: String) {
        val phone = currentMe()?.phone ?: return
        executeOrderMutation(orderNumber, "Marked as picked up.") {
            repository.markOrderPickedUp(phone, orderNumber)
        }
    }

    fun startWashing(orderNumber: String, request: StartWashingRequest = StartWashingRequest()) {
        val phone = currentMe()?.phone ?: return
        executeOrderMutation(orderNumber, "Washing started.") {
            repository.startOrderWashing(phone, orderNumber, request)
        }
    }

    fun advanceOrUpdateStage(orderNumber: String, targetStageWire: String, actionLabel: String) {
        val phone = currentMe()?.phone ?: return
        executeOrderMutation(orderNumber, "$orderNumber updated to $actionLabel.") {
            if (targetStageWire == "READY") {
                repository.markOrderReady(phone, orderNumber)
            } else {
                repository.updateOrderStatus(phone, orderNumber, targetStageWire, actionLabel)
            }
        }
    }

    fun deliverOrder(orderNumber: String, request: DeliverOrderRequest = DeliverOrderRequest(items = null)) {
        val phone = currentMe()?.phone ?: return
        executeOrderMutation(orderNumber, "$orderNumber marked delivered.") {
            repository.deliverOrder(phone, orderNumber, request)
        }
    }

    fun markNotHome(orderNumber: String, note: String) {
        val phone = currentMe()?.phone ?: return
        executeOrderMutation(orderNumber, "Noted: Customer not home. Shop owner notified.") {
            repository.markCustomerNotHome(phone, orderNumber, note)
        }
    }

    // ─── Tasks & Messages ───────────────────────────────────────────────────
    fun markTaskDone(code: String, note: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            when (val res = repository.markTaskDone(code, note)) {
                is ApiOutcome.Success -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    emitToast("Task completed.")
                    refreshAll(quiet = true)
                }
                else -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    fun openTaskThread(code: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingThread = true) }
            when (val res = repository.fetchTaskMessages(code)) {
                is ApiOutcome.Success -> {
                    _uiState.update { it.copy(isLoadingThread = false, activeTaskThread = res.data) }
                }
                else -> {
                    _uiState.update { it.copy(isLoadingThread = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    fun closeTaskThread() {
        _uiState.update { it.copy(activeTaskThread = null) }
    }

    fun sendTaskMessage(code: String, text: String) {
        if (text.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            when (val res = repository.sendTaskMessage(code, text.trim())) {
                is ApiOutcome.Success -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    openTaskThread(code)
                    refreshAll(quiet = true)
                }
                else -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    fun requestTaskCancel(code: String, reason: String) {
        if (reason.trim().length < 3) {
            emitToast("Please write a short reason for cancellation.", isError = true)
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            when (val res = repository.requestTaskCancel(code, reason.trim())) {
                is ApiOutcome.Success -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    emitToast("Cancellation request sent to shop owner.")
                    refreshAll(quiet = true)
                }
                else -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    // ─── Web-Parity Billing, Bills Register, Receipt & Expenses ─────────────
    fun loadRates(force: Boolean = false) {
        if (!force && _uiState.value.rates.isNotEmpty()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingRates = true) }
            when (val res = repository.fetchRates()) {
                is ApiOutcome.Success -> {
                    val sorted = res.data.sortedByDescending { it.uses }
                    _uiState.update { it.copy(isLoadingRates = false, rates = sorted) }
                }
                else -> {
                    _uiState.update { it.copy(isLoadingRates = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    fun searchCustomers(query: String) {
        val trimmed = query.trim()
        if (trimmed.length < 2) {
            _uiState.update { it.copy(customerSearchHits = emptyList()) }
            return
        }
        viewModelScope.launch {
            when (val res = repository.searchCustomers(trimmed)) {
                is ApiOutcome.Success -> _uiState.update { it.copy(customerSearchHits = res.data) }
                else -> _uiState.update { it.copy(customerSearchHits = emptyList()) }
            }
        }
    }

    fun clearCustomerSearch() {
        _uiState.update {
            it.copy(
                customerSearchHits = emptyList(),
                customerRewards = emptyList(),
                customerUsualItems = emptyList()
            )
        }
    }

    fun loadCustomerExtras(customerRef: String) {
        if (customerRef.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(customerRewards = emptyList(), customerUsualItems = emptyList()) }
            val rewardsRes = repository.fetchCustomerRewards(customerRef)
            val usualRes = repository.fetchCustomerUsualItems(customerRef)
            _uiState.update {
                it.copy(
                    customerRewards = (rewardsRes as? ApiOutcome.Success)?.data?.available.orEmpty(),
                    customerUsualItems = (usualRes as? ApiOutcome.Success)?.data?.items.orEmpty()
                )
            }
        }
    }

    fun openPickupBillFromTask(taskCode: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            when (val res = repository.fetchPickupBillContext(taskCode)) {
                is ApiOutcome.Success -> {
                    _uiState.update { it.copy(isSubmitting = false, pickupBillContext = res.data) }
                    if (res.data.customerRef.isNotBlank()) {
                        loadCustomerExtras(res.data.customerRef)
                    }
                    loadRates(force = true)
                    _events.tryEmit(UiEvent.OpenNewBillTab(fromPickupTask = true))
                }
                else -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    fun clearPickupBillContext() {
        _uiState.update { it.copy(pickupBillContext = null) }
    }

    fun createBill(request: CreateBillRequest) {
        val me = currentMe() ?: return
        if (!me.canCreateBill) {
            emitToast("Billing is not enabled for your role or plan.", isError = true)
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            when (val res = repository.createBillOnlineOnly(request)) {
                is ApiOutcome.Success -> {
                    val created = res.data
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            pickupBillContext = null,
                            customerSearchHits = emptyList(),
                            customerRewards = emptyList(),
                            customerUsualItems = emptyList()
                        )
                    }
                    val msg = if (created.pickupCompleted) {
                        "${created.orderNumber} — bill created & pickup completed"
                    } else {
                        "${created.orderNumber} created"
                    }
                    emitToast(msg)
                    _events.tryEmit(UiEvent.BillCreated(created))
                    refreshAll(quiet = true)
                    loadBills(reset = true)
                    if (created.orderNumber.isNotBlank()) {
                        openReceipt(created.orderNumber, fallbackBillUrl = created.billUrl)
                    }
                }
                else -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    fun loadBills(
        query: String = "",
        payFilter: String = "all",
        mineOnly: Boolean = false,
        reset: Boolean = true
    ) {
        viewModelScope.launch {
            val offset = if (reset) 0 else _uiState.value.bills.size
            _uiState.update { it.copy(isLoadingBills = true) }
            when (val res = repository.fetchBills(
                query = query,
                payFilter = payFilter,
                mineOnly = mineOnly,
                limit = 30,
                offset = offset
            )) {
                is ApiOutcome.Success -> {
                    _uiState.update { state ->
                        val merged = if (reset) res.data.bills else state.bills + res.data.bills
                        state.copy(
                            isLoadingBills = false,
                            bills = merged,
                            billsTotal = res.data.total
                        )
                    }
                }
                else -> {
                    _uiState.update { it.copy(isLoadingBills = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    fun openReceipt(orderNumber: String, fallbackBillUrl: String = "") {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingReceipt = true) }
            when (val res = repository.fetchOrderReceipt(orderNumber)) {
                is ApiOutcome.Success -> {
                    val dto = res.data
                    val finalUrl = dto.billUrl.ifBlank { fallbackBillUrl }
                    val finalText = if (finalUrl.isNotBlank() && !dto.text.contains("/b/")) {
                        "${dto.text}\n\nView bill & pay online:\n$finalUrl"
                    } else {
                        dto.text
                    }
                    _uiState.update {
                        it.copy(
                            isLoadingReceipt = false,
                            activeReceipt = dto.copy(billUrl = finalUrl, text = finalText)
                        )
                    }
                }
                else -> {
                    _uiState.update { it.copy(isLoadingReceipt = false) }
                    if (fallbackBillUrl.isNotBlank()) {
                        _uiState.update {
                            it.copy(
                                activeReceipt = OrderReceiptDto(
                                    number = orderNumber,
                                    name = "Customer",
                                    text = "View your Kwik Klin bill $orderNumber & pay online:\n$fallbackBillUrl",
                                    billUrl = fallbackBillUrl
                                )
                            )
                        }
                    } else {
                        handleCommonFailure(res)
                    }
                }
            }
        }
    }

    fun closeReceipt() {
        _uiState.update { it.copy(activeReceipt = null) }
    }

    fun loadExpenses() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingExpenses = true) }
            when (val res = repository.fetchExpenses()) {
                is ApiOutcome.Success -> _uiState.update { it.copy(isLoadingExpenses = false, expenses = res.data) }
                else -> {
                    _uiState.update { it.copy(isLoadingExpenses = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    fun addExpense(category: String, amount: Double, spentOn: String?, description: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            when (val res = repository.createExpenseOnlineOnly(
                CreateExpenseRequest(
                    category = category,
                    amount = amount,
                    spentOn = spentOn?.takeIf { it.isNotBlank() },
                    description = description.trim()
                )
            )) {
                is ApiOutcome.Success -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    emitToast("Expense saved.")
                    loadExpenses()
                }
                else -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    // ─── Outbox Sync ────────────────────────────────────────────────────────
    fun syncOutbox(quiet: Boolean = false) {
        viewModelScope.launch {
            val summary = repository.syncOutboxNow()
            if (summary.unauthorized) {
                forceLocalLogout("Your session expired while syncing. Please sign in again.")
                return@launch
            }
            if (!quiet) {
                val msg = when {
                    summary.syncedCount > 0 && summary.remainingCount == 0 ->
                        "Synced ${summary.syncedCount} queued update(s)."
                    summary.syncedCount > 0 ->
                        "Synced ${summary.syncedCount}, ${summary.remainingCount} still pending."
                    summary.droppedCount > 0 ->
                        "${summary.droppedCount} outdated update(s) resolved by server."
                    summary.remainingCount > 0 ->
                        "Could not sync right now. Will retry automatically when online."
                    else -> "All status updates are already synced."
                }
                emitToast(msg, isError = summary.remainingCount > 0 && summary.syncedCount == 0)
            }
            if (summary.syncedCount > 0) refreshAll(quiet = true)
        }
    }

    fun discardOutboxItem(id: Long) {
        viewModelScope.launch {
            repository.removeOutboxItem(id)
            emitToast("Removed queued update.")
        }
    }

    fun dismissSubscriptionBanner() {
        _uiState.update { it.copy(subscriptionBanner = null) }
    }

    // ─── Internals ──────────────────────────────────────────────────────────
    private fun executeOrderMutation(
        orderNumber: String,
        successMsg: String,
        block: suspend () -> ApiOutcome<*>
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            when (val res = block()) {
                is ApiOutcome.Success -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    emitToast(successMsg)
                    refreshAll(quiet = true)
                    if (_uiState.value.selectedOrder?.number == orderNumber) {
                        openOrderDetail(orderNumber)
                    }
                }
                is ApiOutcome.QueuedOffline -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    emitToast("Offline: '${res.actionLabel}' queued and will sync automatically.")
                }
                is ApiOutcome.ConflictResolved -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    emitToast(res.message)
                    refreshAll(quiet = true)
                    if (_uiState.value.selectedOrder?.number == orderNumber) {
                        openOrderDetail(orderNumber)
                    }
                }
                else -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    handleCommonFailure(res)
                }
            }
        }
    }

    private fun applyBootSuccess(boot: BootResponse, isInitial: Boolean) {
        detectAndAlertUrgent(boot.notifications.items, suppressAlerts = isInitial)
        _uiState.update {
            it.copy(
                session = SessionState.Authenticated(boot.me),
                mustChangePassword = boot.me.mustChangePassword,
                today = boot.today,
                workStops = boot.route.stops,
                myTasks = boot.tasks.tasks,
                notifications = boot.notifications.items,
                unreadNotifications = boot.notifications.unread,
                loginError = null
            )
        }
        if (isInitial) {
            startOutboxObserver(boot.me.phone)
            startBackgroundPoller()
            loadPoints()
        }
    }

    private fun startOutboxObserver(staffPhone: String) {
        outboxCollectorJob?.cancel()
        outboxCollectorJob = viewModelScope.launch {
            repository.observeOutboxForStaff(staffPhone).collectLatest { list ->
                _uiState.update { it.copy(outboxItems = list) }
            }
        }
    }

    private fun startBackgroundPoller() {
        livePollerJob?.cancel()
        livePollerJob = viewModelScope.launch {
            while (isActive) {
                delay(45_000L)
                if (_uiState.value.isOnline && _uiState.value.session is SessionState.Authenticated) {
                    when (val res = repository.bootSession()) {
                        is ApiOutcome.Success -> applyBootSuccess(res.data, isInitial = false)
                        is ApiOutcome.Unauthorized -> forceLocalLogout(res.message)
                        else -> Unit
                    }
                }
            }
        }
    }

    private fun stopAuthenticatedJobs() {
        outboxCollectorJob?.cancel()
        livePollerJob?.cancel()
        outboxCollectorJob = null
        livePollerJob = null
    }

    private fun detectAndAlertUrgent(items: List<NotificationItemDto>, suppressAlerts: Boolean) {
        for (item in items) {
            val key = item.code.ifBlank { "${item.title}|${item.at}" }
            val isNew = seenNotificationCodes.add(key)
            if (isNew && !suppressAlerts) {
                val isUrgent = item.urgent ||
                    item.title.contains("urgent", ignoreCase = true) ||
                    item.text.contains("urgent", ignoreCase = true)
                // Privacy safe: strip any phone-like strings before posting lock-screen notification
                val safeBody = item.text.replace(Regex("\\+?\\d[\\d\\s-]{7,}\\d"), "[redacted]")
                StaffNotificationHelper.postStaffAlert(
                    context = appContext,
                    notificationId = key.hashCode(),
                    title = item.title.ifBlank { "New Work Assigned" },
                    body = safeBody.ifBlank { "Open Kwik Klin to view your updated queue." },
                    urgent = isUrgent
                )
            }
        }
    }

    private fun handleCommonFailure(outcome: ApiOutcome<*>, silentNetwork: Boolean = false) {
        when (outcome) {
            is ApiOutcome.Unauthorized -> forceLocalLogout(outcome.message)
            is ApiOutcome.MustChangePassword -> _uiState.update { it.copy(mustChangePassword = true) }
            is ApiOutcome.SubscriptionOrLimitError -> {
                _uiState.update { it.copy(subscriptionBanner = outcome.message) }
                emitToast(outcome.message, isError = true)
            }
            is ApiOutcome.NetworkError -> {
                if (!silentNetwork) emitToast(outcome.message, isError = true)
            }
            is ApiOutcome.ServerError -> {
                emitToast(outcome.message, isError = true)
            }
            else -> Unit
        }
    }

    private fun forceLocalLogout(reason: String) {
        viewModelScope.launch {
            stopAuthenticatedJobs()
            repository.wipeLocalSessionOnly()
            seenNotificationCodes.clear()
            _uiState.update {
                it.copy(
                    session = SessionState.LoggedOut(reason),
                    mustChangePassword = false,
                    selectedOrder = null,
                    activeTaskThread = null,
                    outboxItems = emptyList()
                )
            }
        }
    }

    private fun currentMe(): StaffMeDto? = (_uiState.value.session as? SessionState.Authenticated)?.me

    private fun emitToast(message: String, isError: Boolean = false) {
        _events.tryEmit(UiEvent.Toast(message, isError))
    }

    class Factory(
        private val appContext: Context,
        private val repository: StaffRepository
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return StaffViewModel(appContext.applicationContext, repository) as T
        }
    }
}
