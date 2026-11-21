package com.kwikklin.crm.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Iron
import androidx.compose.material.icons.filled.LocalLaundryService
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.TaskAlt
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Iron
import androidx.compose.material.icons.outlined.LocalLaundryService
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.kwikklin.crm.data.network.StaffMeDto
import com.kwikklin.crm.data.network.StaffRole
import com.kwikklin.crm.ui.StaffUiState
import com.kwikklin.crm.ui.StaffViewModel
import com.kwikklin.crm.ui.UiEvent
import com.kwikklin.crm.ui.theme.BrandBlue
import com.kwikklin.crm.ui.theme.BrandSoft
import com.kwikklin.crm.ui.theme.InkMuted
import com.kwikklin.crm.ui.theme.PageCanvas
import com.kwikklin.crm.ui.theme.StatusError
import com.kwikklin.crm.ui.theme.SurfaceWhite

private enum class StaffTab { HOME, WORK, TASKS, NEW_BILL, BILLS, HISTORY, PROFILE }
private enum class SecondaryOverlay { NONE, NOTIFICATIONS, SETTINGS, EXPENSES, HISTORY_MODAL }

private data class NavTabSpec(
    val tab: StaffTab,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
    val badgeCount: Int = 0
)

/**
 * Exact Kwik Klin Web Staff App navigation parity:
 * - Delivery Boy / Manager / Admin / Solo Owner (me.canCreateBill == true):
 *     Work · Tasks · + New · Bills · You  (plus Home summary & History accessible cleanly)
 * - Washerman / Iron Boy (me.canCreateBill == false):
 *     Home · Washing/Ironing · Tasks · History · You  (zero billing/money tabs!)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StaffAppShell(
    me: StaffMeDto,
    state: StaffUiState,
    viewModel: StaffViewModel,
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier
) {
    val defaultTab = if (me.canCreateBill) StaffTab.WORK else StaffTab.HOME
    var currentTab by rememberSaveable(me.phone, me.canCreateBill) { mutableStateOf(defaultTab) }
    var overlay by rememberSaveable { mutableStateOf(SecondaryOverlay.NONE) }
    var showVoluntaryPasswordDialog by rememberSaveable { mutableStateOf(false) }

    // Switch straight to New Bill tab when Delivery Boy taps "Make Pickup Bill" on a task
    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            if (event is UiEvent.OpenNewBillTab && me.canCreateBill) {
                overlay = SecondaryOverlay.NONE
                currentTab = StaffTab.NEW_BILL
            }
        }
    }

    // Order Detail screen takes full-screen precedence when an order is opened
    if (state.selectedOrder != null || state.isLoadingOrder || state.orderLoadError != null) {
        OrderDetailScreen(
            me = me,
            order = state.selectedOrder,
            isLoading = state.isLoadingOrder,
            error = state.orderLoadError,
            isOnline = state.isOnline,
            isSubmitting = state.isSubmitting,
            orderDues = state.activeOrderDues,
            onBack = { viewModel.closeOrderDetail() },
            onRefresh = { viewModel.openOrderDetail(it) },
            onCallCustomer = { viewModel.requestCustomerCall(it) },
            onLoadDues = { viewModel.loadOrderDuesForCollect(it) },
            onCollectPayment = { num, amt, method, settlePrev ->
                viewModel.collectPayment(num, amt, method, settlePrev)
            },
            onMarkPickedUp = { viewModel.markPickedUp(it) },
            onStartWashing = { viewModel.startWashing(it) },
            onUpdateStage = { num, wire, label -> viewModel.advanceOrUpdateStage(num, wire, label) },
            onDeliverOrder = { viewModel.deliverOrder(it) },
            onMarkNotHome = { num, note -> viewModel.markNotHome(num, note) },
            modifier = modifier
        )
        return
    }

    when (overlay) {
        SecondaryOverlay.NOTIFICATIONS -> {
            NotificationsScreen(
                items = state.notifications,
                onBack = { overlay = SecondaryOverlay.NONE },
                onRefresh = { viewModel.loadNotifications() },
                onOpenOrder = { orderNum ->
                    overlay = SecondaryOverlay.NONE
                    viewModel.openOrderDetail(orderNum)
                },
                modifier = modifier
            )
            return
        }

        SecondaryOverlay.SETTINGS -> {
            AppSettingsScreen(
                serverBaseUrl = state.serverBaseUrl,
                isOnline = state.isOnline,
                isCheckingHealth = state.isCheckingHealth,
                healthCheck = state.healthCheck,
                outboxItems = state.outboxItems,
                onBack = { overlay = SecondaryOverlay.NONE },
                onSaveServerUrl = { viewModel.updateServerBaseUrl(it) },
                onCheckHealth = { viewModel.checkServerHealth(it) },
                onSyncOutbox = { viewModel.syncOutbox(quiet = false) },
                onDiscardOutboxItem = { viewModel.discardOutboxItem(it) },
                modifier = modifier
            )
            return
        }

        SecondaryOverlay.EXPENSES -> {
            ExpensesScreen(
                expenses = state.expenses,
                isLoading = state.isLoadingExpenses,
                isOnline = state.isOnline,
                isSubmitting = state.isSubmitting,
                onBack = { overlay = SecondaryOverlay.NONE },
                onLoadExpenses = { viewModel.loadExpenses() },
                onSaveExpense = { cat, amt, desc -> viewModel.addExpense(cat, amt, null, desc) },
                modifier = modifier
            )
            return
        }

        SecondaryOverlay.HISTORY_MODAL -> {
            BackHandler { overlay = SecondaryOverlay.NONE }
            Scaffold(
                containerColor = PageCanvas,
                topBar = {
                    TopAppBar(
                        title = { Text("Work History", fontWeight = FontWeight.Bold) },
                        navigationIcon = {
                            IconButton(onClick = { overlay = SecondaryOverlay.NONE }) {
                                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = SurfaceWhite)
                    )
                },
                modifier = modifier
            ) { inner ->
                HistoryScreen(
                    me = me,
                    completedOrders = state.historyStops,
                    completedTasks = state.doneTasks,
                    isRefreshing = state.isRefreshing,
                    onLoadHistory = { viewModel.loadHistory() },
                    onOpenOrder = {
                        overlay = SecondaryOverlay.NONE
                        viewModel.openOrderDetail(it)
                    },
                    modifier = Modifier.padding(inner)
                )
            }
            return
        }

        SecondaryOverlay.NONE -> Unit
    }

    val workTabLabel = when (me.staffRole) {
        StaffRole.DELIVERY -> "Work"
        StaffRole.WASHER -> "Washing"
        StaffRole.IRONER -> "Ironing"
        else -> "Work"
    }
    val workSelectedIcon = when (me.staffRole) {
        StaffRole.DELIVERY -> Icons.Filled.LocalShipping
        StaffRole.WASHER -> Icons.Filled.LocalLaundryService
        StaffRole.IRONER -> Icons.Filled.Iron
        else -> Icons.Filled.LocalLaundryService
    }
    val workUnselectedIcon = when (me.staffRole) {
        StaffRole.DELIVERY -> Icons.Outlined.LocalShipping
        StaffRole.WASHER -> Icons.Outlined.LocalLaundryService
        StaffRole.IRONER -> Icons.Outlined.Iron
        else -> Icons.Outlined.LocalLaundryService
    }

    // Exact Web Staff App 5-tab layout for Delivery/Manager/Owner vs non-billing Washer/Ironer
    val tabs = if (me.canCreateBill) {
        listOf(
            NavTabSpec(StaffTab.WORK, workTabLabel, workSelectedIcon, workUnselectedIcon, state.workStops.size),
            NavTabSpec(StaffTab.TASKS, "Tasks", Icons.Filled.TaskAlt, Icons.Outlined.TaskAlt, state.myTasks.size),
            NavTabSpec(StaffTab.NEW_BILL, "New", Icons.Filled.AddCircle, Icons.Outlined.AddCircleOutline),
            NavTabSpec(StaffTab.BILLS, "Bills", Icons.AutoMirrored.Filled.ReceiptLong, Icons.AutoMirrored.Outlined.ReceiptLong),
            NavTabSpec(StaffTab.PROFILE, "You", Icons.Filled.Person, Icons.Outlined.Person)
        )
    } else {
        listOf(
            NavTabSpec(StaffTab.HOME, "Home", Icons.Filled.Home, Icons.Outlined.Home),
            NavTabSpec(StaffTab.WORK, workTabLabel, workSelectedIcon, workUnselectedIcon, state.workStops.size),
            NavTabSpec(StaffTab.TASKS, "Tasks", Icons.Filled.TaskAlt, Icons.Outlined.TaskAlt, state.myTasks.size),
            NavTabSpec(StaffTab.HISTORY, "History", Icons.Filled.History, Icons.Outlined.History),
            NavTabSpec(StaffTab.PROFILE, "You", Icons.Filled.Person, Icons.Outlined.Person)
        )
    }

    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val useNavRail = maxWidth >= 640.dp

        Scaffold(
            containerColor = PageCanvas,
            contentWindowInsets = WindowInsets.safeDrawing,
            snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
            bottomBar = {
                if (!useNavRail) {
                    NavigationBar(containerColor = SurfaceWhite, tonalElevation = 2.dp) {
                        tabs.forEach { spec ->
                            val selected = currentTab == spec.tab
                            NavigationBarItem(
                                selected = selected,
                                onClick = { currentTab = spec.tab },
                                icon = {
                                    TabIconWithBadge(
                                        icon = if (selected) spec.selectedIcon else spec.unselectedIcon,
                                        label = spec.label,
                                        badgeCount = spec.badgeCount
                                    )
                                },
                                label = {
                                    Text(
                                        text = spec.label,
                                        fontWeight = if (selected || spec.tab == StaffTab.NEW_BILL) FontWeight.Bold else FontWeight.Medium,
                                        maxLines = 1
                                    )
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = BrandBlue,
                                    selectedTextColor = BrandBlue,
                                    indicatorColor = BrandSoft,
                                    unselectedIconColor = if (spec.tab == StaffTab.NEW_BILL) BrandBlue else InkMuted,
                                    unselectedTextColor = if (spec.tab == StaffTab.NEW_BILL) BrandBlue else InkMuted
                                ),
                                modifier = Modifier.testTag("nav_tab_${spec.tab.name.lowercase()}")
                            )
                        }
                    }
                }
            }
        ) { innerPadding ->
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                if (useNavRail) {
                    NavigationRail(containerColor = SurfaceWhite) {
                        tabs.forEach { spec ->
                            val selected = currentTab == spec.tab
                            NavigationRailItem(
                                selected = selected,
                                onClick = { currentTab = spec.tab },
                                icon = {
                                    TabIconWithBadge(
                                        icon = if (selected) spec.selectedIcon else spec.unselectedIcon,
                                        label = spec.label,
                                        badgeCount = spec.badgeCount
                                    )
                                },
                                label = { Text(spec.label) },
                                colors = NavigationRailItemDefaults.colors(
                                    selectedIconColor = BrandBlue,
                                    selectedTextColor = BrandBlue,
                                    indicatorColor = BrandSoft,
                                    unselectedIconColor = if (spec.tab == StaffTab.NEW_BILL) BrandBlue else InkMuted,
                                    unselectedTextColor = if (spec.tab == StaffTab.NEW_BILL) BrandBlue else InkMuted
                                ),
                                modifier = Modifier.testTag("rail_tab_${spec.tab.name.lowercase()}")
                            )
                        }
                    }
                }

                Box(modifier = Modifier.weight(1f)) {
                    when (currentTab) {
                        StaffTab.HOME -> StaffHomeScreen(
                            me = me,
                            today = state.today,
                            workStops = state.workStops,
                            myTasks = state.myTasks,
                            unreadNotifications = state.unreadNotifications,
                            isOnline = state.isOnline,
                            pendingOutboxCount = state.outboxItems.size,
                            subscriptionBanner = state.subscriptionBanner,
                            isRefreshing = state.isRefreshing,
                            onRefresh = { viewModel.refreshAll(quiet = false) },
                            onSyncOutbox = { viewModel.syncOutbox(quiet = false) },
                            onOpenNotifications = { overlay = SecondaryOverlay.NOTIFICATIONS },
                            onOpenWorkQueue = { currentTab = StaffTab.WORK },
                            onOpenTasks = { currentTab = StaffTab.TASKS },
                            onOpenOrder = { viewModel.openOrderDetail(it) },
                            onOpenCashSheet = { currentTab = StaffTab.PROFILE }
                        )

                        StaffTab.WORK -> WorkQueueScreen(
                            me = me,
                            today = state.today,
                            stops = state.workStops,
                            unreadNotifications = state.unreadNotifications,
                            subscriptionBanner = state.subscriptionBanner,
                            isOnline = state.isOnline,
                            pendingOutboxCount = state.outboxItems.size,
                            isSubmitting = state.isSubmitting,
                            onRefresh = { viewModel.refreshAll(quiet = false) },
                            onSyncOutbox = { viewModel.syncOutbox(quiet = false) },
                            onOpenNotifications = { overlay = SecondaryOverlay.NOTIFICATIONS },
                            onOpenOrder = { viewModel.openOrderDetail(it) },
                            onCallCustomer = { viewModel.requestCustomerCall(it) },
                            onMarkPickedUp = { viewModel.markPickedUp(it) },
                            onStartWashing = { viewModel.startWashing(it) },
                            onUpdateStage = { num, wire, label ->
                                viewModel.advanceOrUpdateStage(num, wire, label)
                            },
                            onDeliverOrder = { viewModel.deliverOrder(it) },
                            onMarkNotHome = { num, note -> viewModel.markNotHome(num, note) }
                        )

                        StaffTab.TASKS -> MyTasksScreen(
                            me = me,
                            tasks = state.myTasks,
                            isOnline = state.isOnline,
                            pendingOutboxCount = state.outboxItems.size,
                            isSubmitting = state.isSubmitting,
                            activeThread = state.activeTaskThread,
                            isLoadingThread = state.isLoadingThread,
                            onRefresh = { viewModel.refreshAll(quiet = false) },
                            onSyncOutbox = { viewModel.syncOutbox(quiet = false) },
                            onOpenOrder = { viewModel.openOrderDetail(it) },
                            onMarkTaskDone = { code, note -> viewModel.markTaskDone(code, note) },
                            onOpenThread = { viewModel.openTaskThread(it) },
                            onCloseThread = { viewModel.closeTaskThread() },
                            onSendThreadMessage = { code, text -> viewModel.sendTaskMessage(code, text) },
                            onRequestCancel = { code, reason -> viewModel.requestTaskCancel(code, reason) },
                            onMakePickupBill = { code -> viewModel.openPickupBillFromTask(code) }
                        )

                        StaffTab.NEW_BILL -> NewBillScreen(
                            me = me,
                            rates = state.rates,
                            isLoadingRates = state.isLoadingRates,
                            customerSearchHits = state.customerSearchHits,
                            customerRewards = state.customerRewards,
                            customerUsualItems = state.customerUsualItems,
                            pickupContext = state.pickupBillContext,
                            isOnline = state.isOnline,
                            isSubmitting = state.isSubmitting,
                            onLoadRates = { viewModel.loadRates(force = true) },
                            onSearchCustomers = { viewModel.searchCustomers(it) },
                            onClearCustomerSearch = { viewModel.clearCustomerSearch() },
                            onSelectCustomerRef = { viewModel.loadCustomerExtras(it) },
                            onClearPickupContext = { viewModel.clearPickupBillContext() },
                            onSubmitBill = { req -> viewModel.createBill(req) }
                        )

                        StaffTab.BILLS -> BillsScreen(
                            me = me,
                            bills = state.bills,
                            billsTotal = state.billsTotal,
                            isLoading = state.isLoadingBills,
                            isOnline = state.isOnline,
                            onLoadBills = { q, pay, mine, reset ->
                                viewModel.loadBills(q, pay, mine, reset)
                            },
                            onOpenOrder = { viewModel.openOrderDetail(it) },
                            onOpenReceipt = { viewModel.openReceipt(it) }
                        )

                        StaffTab.HISTORY -> HistoryScreen(
                            me = me,
                            completedOrders = state.historyStops,
                            completedTasks = state.doneTasks,
                            isRefreshing = state.isRefreshing,
                            onLoadHistory = { viewModel.loadHistory() },
                            onOpenOrder = { viewModel.openOrderDetail(it) }
                        )

                        StaffTab.PROFILE -> ProfileScreen(
                            me = me,
                            points = state.points,
                            cashSummary = state.cashSummary,
                            isLoadingCash = state.isLoadingCash,
                            isOnline = state.isOnline,
                            isSubmitting = state.isSubmitting,
                            pendingOutboxCount = state.outboxItems.size,
                            onOpenCashDialog = { viewModel.loadMyCash() },
                            onSubmitCashHandover = { amt, note -> viewModel.submitCashHandover(amt, note) },
                            onOpenChangePassword = { showVoluntaryPasswordDialog = true },
                            onOpenNotifications = { overlay = SecondaryOverlay.NOTIFICATIONS },
                            onOpenSettings = { overlay = SecondaryOverlay.SETTINGS },
                            onOpenExpenses = { overlay = SecondaryOverlay.EXPENSES },
                            onOpenHistory = { overlay = SecondaryOverlay.HISTORY_MODAL },
                            onLogout = { viewModel.logout() }
                        )
                    }
                }
            }
        }
    }

    // Immediate WhatsApp / Copy / Share Receipt modal after New Bill or tapping "Send Bill"
    state.activeReceipt?.let { receipt ->
        ReceiptShareDialog(
            receipt = receipt,
            onDismiss = { viewModel.closeReceipt() }
        )
    }

    if (state.mustChangePassword || showVoluntaryPasswordDialog) {
        ChangePasswordDialog(
            mandatory = state.mustChangePassword,
            isSubmitting = state.isSubmitting,
            onDismiss = { showVoluntaryPasswordDialog = false },
            onSubmit = { oldPass, newPass ->
                viewModel.changePassword(oldPass, newPass)
                showVoluntaryPasswordDialog = false
            }
        )
    }
}

@Composable
private fun TabIconWithBadge(
    icon: ImageVector,
    label: String,
    badgeCount: Int
) {
    if (badgeCount > 0) {
        BadgedBox(
            badge = {
                Badge(containerColor = StatusError) {
                    Text(if (badgeCount > 99) "99+" else badgeCount.toString())
                }
            }
        ) {
            Icon(icon, contentDescription = label)
        }
    } else {
        Icon(icon, contentDescription = label)
    }
}
