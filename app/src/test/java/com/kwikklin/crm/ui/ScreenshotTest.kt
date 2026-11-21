package com.kwikklin.crm.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import com.github.takahirom.roborazzi.ExperimentalRoborazziApi
import com.github.takahirom.roborazzi.captureRoboImage
import com.github.takahirom.roborazzi.captureScreenRoboImage
import com.kwikklin.crm.ui.screens.ReceiptShareDialog
import com.kwikklin.crm.ui.screens.BillsScreen
import com.kwikklin.crm.ui.screens.ExpensesScreen
import com.kwikklin.crm.ui.screens.HistoryScreen
import com.kwikklin.crm.ui.screens.LoginScreen
import com.kwikklin.crm.ui.screens.MyTasksScreen
import com.kwikklin.crm.ui.screens.NetworkErrorScreen
import com.kwikklin.crm.ui.screens.NewBillScreen
import com.kwikklin.crm.ui.screens.NotificationsScreen
import com.kwikklin.crm.ui.screens.OrderDetailScreen
import com.kwikklin.crm.ui.screens.ProfileScreen
import com.kwikklin.crm.ui.screens.SplashScreen
import com.kwikklin.crm.ui.screens.StaffHomeScreen
import com.kwikklin.crm.ui.screens.WorkQueueScreen
import com.kwikklin.crm.ui.screens.AppSettingsScreen
import com.kwikklin.crm.ui.theme.KwikKlinTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Renders each screen with [SampleData] to PNGs under app/build/screenshots/ for visual review.
 * Run: ./gradlew :app:testDebugUnitTest --tests '*ScreenshotTest*'
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w393dp-h852dp-xhdpi")
class ScreenshotTest {

    @get:Rule
    val compose = createComposeRule()

    private fun shot(name: String, content: @Composable () -> Unit) {
        compose.setContent { KwikKlinTheme { content() } }
        compose.waitForIdle()
        compose.onRoot().captureRoboImage("build/screenshots/$name.png")
    }

    /** Dialogs live in their own window, so capture the whole screen instead of the root node. */
    @OptIn(ExperimentalRoborazziApi::class)
    private fun dialogShot(name: String, content: @Composable () -> Unit) {
        compose.setContent { KwikKlinTheme { content() } }
        compose.waitForIdle()
        captureScreenRoboImage("build/screenshots/$name.png")
    }

    @Test fun d01_receipt_dialog() = dialogShot("d01_receipt_dialog") {
        ReceiptShareDialog(receipt = SampleData.receipt, onDismiss = {})
    }

    @Test fun s01_splash() = shot("01_splash") { SplashScreen() }

    @Test fun s02_login() = shot("02_login") {
        LoginScreen(
            serverBaseUrl = "https://kwikklin.online", sessionReason = null, loginError = null,
            isSubmitting = false, isCheckingHealth = false, healthCheck = null,
            onLogin = { _, _ -> }, onUpdateServerUrl = {}, onCheckHealth = {}
        )
    }

    @Test fun s03_network_error() = shot("03_network_error") {
        NetworkErrorScreen(
            message = "No internet connection or Kwik Klin server is unreachable.",
            serverBaseUrl = "https://kwikklin.online", onRetry = {}, onSignOut = {}
        )
    }

    @Test fun s04_home_washer() = shot("04_home_washer") {
        StaffHomeScreen(
            me = SampleData.washerMe, today = SampleData.today, workStops = SampleData.stops,
            myTasks = SampleData.tasks, unreadNotifications = 2, isOnline = true, pendingOutboxCount = 0,
            subscriptionBanner = null, isRefreshing = false, onRefresh = {}, onSyncOutbox = {},
            onOpenNotifications = {}, onOpenWorkQueue = {}, onOpenTasks = {}, onOpenOrder = {}, onOpenCashSheet = {}
        )
    }

    @Test fun s05_work_delivery() = shot("05_work_delivery") {
        WorkQueueScreen(
            me = SampleData.deliveryMe, today = SampleData.today, stops = SampleData.stops,
            unreadNotifications = 3, subscriptionBanner = null, isOnline = true, pendingOutboxCount = 0,
            isSubmitting = false, onRefresh = {}, onSyncOutbox = {}, onOpenNotifications = {}, onOpenOrder = {},
            onCallCustomer = {}, onMarkPickedUp = {}, onStartWashing = {}, onUpdateStage = { _, _, _ -> },
            onDeliverOrder = {}, onMarkNotHome = { _, _ -> }
        )
    }

    @Test fun s06_work_offline() = shot("06_work_offline") {
        WorkQueueScreen(
            me = SampleData.washerMe, today = SampleData.today, stops = SampleData.stops.drop(3),
            unreadNotifications = 0, subscriptionBanner = "Shop plan expires in 3 days.", isOnline = false,
            pendingOutboxCount = 2, isSubmitting = false, onRefresh = {}, onSyncOutbox = {}, onOpenNotifications = {},
            onOpenOrder = {}, onCallCustomer = {}, onMarkPickedUp = {}, onStartWashing = {},
            onUpdateStage = { _, _, _ -> }, onDeliverOrder = {}, onMarkNotHome = { _, _ -> }
        )
    }

    @Test fun s07_tasks() = shot("07_tasks") {
        MyTasksScreen(
            me = SampleData.deliveryMe, tasks = SampleData.tasks, isOnline = true, pendingOutboxCount = 0,
            isSubmitting = false, activeThread = null, isLoadingThread = false, onRefresh = {}, onSyncOutbox = {},
            onOpenOrder = {}, onMarkTaskDone = { _, _ -> }, onOpenThread = {}, onCloseThread = {},
            onSendThreadMessage = { _, _ -> }, onRequestCancel = { _, _ -> }, onMakePickupBill = {}
        )
    }

    @Test fun s08_new_bill() = shot("08_new_bill") {
        NewBillScreen(
            me = SampleData.deliveryMe, rates = SampleData.rates, isLoadingRates = false,
            customerSearchHits = SampleData.customerHits, customerRewards = emptyList(),
            customerUsualItems = emptyList(), pickupContext = null, isOnline = true, isSubmitting = false,
            onLoadRates = {}, onSearchCustomers = {}, onClearCustomerSearch = {}, onSelectCustomerRef = {},
            onClearPickupContext = {}, onSubmitBill = {}
        )
    }

    @Test fun s09_bills() = shot("09_bills") {
        BillsScreen(
            me = SampleData.deliveryMe, bills = SampleData.bills, billsTotal = 3, isLoading = false,
            isOnline = true, onLoadBills = { _, _, _, _ -> }, onOpenOrder = {}, onOpenReceipt = {}
        )
    }

    @Test fun s10_order_detail() = shot("10_order_detail") {
        OrderDetailScreen(
            me = SampleData.deliveryMe, order = SampleData.orderDetail, isLoading = false, error = null,
            isOnline = true, isSubmitting = false, orderDues = null, onBack = {}, onRefresh = {},
            onCallCustomer = {}, onLoadDues = {}, onCollectPayment = { _, _, _, _ -> }, onMarkPickedUp = {},
            onStartWashing = {}, onUpdateStage = { _, _, _ -> }, onDeliverOrder = {}, onMarkNotHome = { _, _ -> }
        )
    }

    @Test fun s11_history() = shot("11_history") {
        HistoryScreen(
            me = SampleData.deliveryMe, completedOrders = SampleData.stops.take(2),
            completedTasks = SampleData.tasks.take(1), isRefreshing = false, onLoadHistory = {}, onOpenOrder = {}
        )
    }

    @Test fun s12_profile() = shot("12_profile") {
        ProfileScreen(
            me = SampleData.deliveryMe, points = SampleData.points, cashSummary = SampleData.cash,
            isLoadingCash = false, isOnline = true, isSubmitting = false, pendingOutboxCount = 0,
            onOpenCashDialog = {}, onSubmitCashHandover = { _, _ -> }, onOpenChangePassword = {},
            onOpenNotifications = {}, onOpenSettings = {}, onLogout = {}
        )
    }

    @Test fun s13_notifications() = shot("13_notifications") {
        NotificationsScreen(items = SampleData.notifications, onBack = {}, onRefresh = {}, onOpenOrder = {})
    }

    @Test fun s14_expenses() = shot("14_expenses") {
        ExpensesScreen(
            expenses = SampleData.expenses, isLoading = false, isOnline = true, isSubmitting = false,
            onBack = {}, onLoadExpenses = {}, onSaveExpense = { _, _, _ -> }
        )
    }

    @Test fun s15_settings() = shot("15_settings") {
        AppSettingsScreen(
            serverBaseUrl = "https://kwikklin.online", isOnline = true, isCheckingHealth = false,
            healthCheck = null, outboxItems = emptyList(), onBack = {}, onSaveServerUrl = {},
            onCheckHealth = {}, onSyncOutbox = {}, onDiscardOutboxItem = {}
        )
    }

    @Config(qualifiers = "w393dp-h1700dp-xhdpi")
    @Test fun t01_order_detail_full() = shot("t01_order_detail_full") {
        OrderDetailScreen(
            me = SampleData.deliveryMe, order = SampleData.orderDetail, isLoading = false, error = null,
            isOnline = true, isSubmitting = false, orderDues = null, onBack = {}, onRefresh = {},
            onCallCustomer = {}, onLoadDues = {}, onCollectPayment = { _, _, _, _ -> }, onMarkPickedUp = {},
            onStartWashing = {}, onUpdateStage = { _, _, _ -> }, onDeliverOrder = {}, onMarkNotHome = { _, _ -> }
        )
    }

    private fun newBill() = @Composable {
        NewBillScreen(
            me = SampleData.deliveryMe, rates = SampleData.rates, isLoadingRates = false,
            customerSearchHits = emptyList(), customerRewards = emptyList(),
            customerUsualItems = emptyList(), pickupContext = null, isOnline = true, isSubmitting = false,
            onLoadRates = {}, onSearchCustomers = {}, onClearCustomerSearch = {}, onSelectCustomerRef = {},
            onClearPickupContext = {}, onSubmitBill = {}
        )
    }

    @Config(qualifiers = "w393dp-h1400dp-xhdpi")
    @Test fun t02_new_bill_step2() {
        compose.setContent { KwikKlinTheme { newBill()() } }
        compose.onNodeWithText("2. Clothes", substring = true).performClick()
        compose.waitForIdle()
        compose.onRoot().captureRoboImage("build/screenshots/t02_new_bill_step2.png")
    }

    @Config(qualifiers = "w393dp-h1400dp-xhdpi")
    @Test fun t03_new_bill_step3() {
        compose.setContent { KwikKlinTheme { newBill()() } }
        compose.onNodeWithText("3. Payment", substring = true).performClick()
        compose.waitForIdle()
        compose.onRoot().captureRoboImage("build/screenshots/t03_new_bill_step3.png")
    }
}
