package com.kwikklin.crm.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.OpenInBrowser
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.kwikklin.crm.BuildConfig
import com.kwikklin.crm.data.crm.CrmHealthResult
import com.kwikklin.crm.data.network.CashSummaryDto
import com.kwikklin.crm.data.network.PointsDto
import com.kwikklin.crm.data.network.StaffMeDto
import com.kwikklin.crm.data.outbox.OfflineActionEntity
import com.kwikklin.crm.ui.components.NavyHeroSurface
import com.kwikklin.crm.ui.components.PlanPill
import com.kwikklin.crm.ui.components.StatusPill
import com.kwikklin.crm.ui.components.formatRupees
import com.kwikklin.crm.ui.components.formatTimeShort
import com.kwikklin.crm.ui.components.openExternalUrl
import com.kwikklin.crm.ui.components.roleBadgeColors
import com.kwikklin.crm.ui.theme.BorderLight
import com.kwikklin.crm.ui.theme.BrandBlue
import com.kwikklin.crm.ui.theme.BrandInk
import com.kwikklin.crm.ui.theme.BrandSoft
import com.kwikklin.crm.ui.theme.InkMuted
import com.kwikklin.crm.ui.theme.InkPrimary
import com.kwikklin.crm.ui.theme.PageCanvas
import com.kwikklin.crm.ui.theme.StatusError
import com.kwikklin.crm.ui.theme.StatusErrorSoft
import com.kwikklin.crm.ui.theme.StatusSuccess
import com.kwikklin.crm.ui.theme.StatusSuccessSoft
import com.kwikklin.crm.ui.theme.StatusWarning
import com.kwikklin.crm.ui.theme.SurfaceWhite

/** Screen 12: Staff Profile (Role vs Plan clarity, Points, Delivery Cash Handover, Password, Logout) */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileScreen(
    me: StaffMeDto,
    points: PointsDto?,
    cashSummary: CashSummaryDto?,
    isLoadingCash: Boolean,
    isOnline: Boolean,
    isSubmitting: Boolean,
    pendingOutboxCount: Int,
    onOpenCashDialog: () -> Unit,
    onSubmitCashHandover: (handedCash: Double, note: String) -> Unit,
    onOpenChangePassword: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenExpenses: () -> Unit = {},
    onOpenHistory: () -> Unit = {},
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showCashDialog by remember { mutableStateOf(false) }
    var showLogoutConfirm by remember { mutableStateOf(false) }
    val (roleFg, roleBg) = roleBadgeColors(me.staffRole)

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = modifier
            .fillMaxSize()
            .testTag("profile_screen")
    ) {
        // Profile Header
        item {
            NavyHeroSurface {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .size(54.dp)
                            .clip(CircleShape)
                            .background(BrandBlue)
                    ) {
                        Text(
                            text = me.name.trim().take(1).uppercase().ifEmpty { "K" },
                            style = MaterialTheme.typography.headlineSmall,
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Spacer(modifier = Modifier.width(14.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = me.name.ifBlank { me.staffRole.displayLabel },
                            style = MaterialTheme.typography.titleLarge,
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${me.shop.ifBlank { "Kwik Klin Shop" }} · ${me.phone}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.8f)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            StatusPill(text = me.staffRole.displayLabel, fg = roleFg, bg = roleBg)
                            PlanPill(plan = me.subscriptionPlan)
                        }
                    }
                }
            }
        }

        // Shop Subscription Plan & Backend-Enabled Features Card
        item {
            Surface(
                color = SurfaceWhite,
                shape = RoundedCornerShape(18.dp),
                border = BorderStroke(1.dp, BorderLight),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Shop Plan & Permitted Access",
                        style = MaterialTheme.typography.titleSmall,
                        color = InkPrimary,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Role: ${me.staffRole.displayLabel}  ·  Shop Tier: ${me.subscriptionPlan.displayName}",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted
                    )
                    me.planValidity?.daysLeft?.let { days ->
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Plan validity: $days day(s) remaining",
                            style = MaterialTheme.typography.labelMedium,
                            color = if (days <= 5) StatusWarning else StatusSuccess,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    if (me.features.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            me.features.forEach { feat ->
                                Surface(
                                    color = BrandSoft,
                                    shape = RoundedCornerShape(999.dp)
                                ) {
                                    Text(
                                        text = feat.replace('_', ' '),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = BrandInk,
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Staff Points Card (from /staff/api/points)
        points?.let { pts ->
            item {
                Surface(
                    color = SurfaceWhite,
                    shape = RoundedCornerShape(18.dp),
                    border = BorderStroke(1.dp, BorderLight),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.StarOutline, contentDescription = null, tint = BrandBlue)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "My Points This Month",
                                style = MaterialTheme.typography.titleSmall,
                                color = InkPrimary,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column {
                                Text(
                                    text = pts.monthPoints.toString(),
                                    style = MaterialTheme.typography.headlineMedium,
                                    color = BrandBlue,
                                    fontWeight = FontWeight.Bold
                                )
                                Text("Total points", style = MaterialTheme.typography.labelSmall, color = InkMuted)
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                RatingMiniStat("Excellent", pts.good, StatusSuccess)
                                RatingMiniStat("Okay", pts.mid, StatusWarning)
                                RatingMiniStat("Needs work", pts.bad, StatusError)
                            }
                        }
                        if (pts.rewardNote.isNotBlank()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = pts.rewardNote,
                                style = MaterialTheme.typography.bodySmall,
                                color = InkMuted
                            )
                        }
                    }
                }
            }
        }

        // Action Menu List
        item {
            Surface(
                color = SurfaceWhite,
                shape = RoundedCornerShape(18.dp),
                border = BorderStroke(1.dp, BorderLight),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    // Cash Handover — ONLY for Delivery Boy / roles with financial permission
                    if (me.allowFinancialVisibility) {
                        ProfileMenuRow(
                            icon = Icons.Outlined.AccountBalanceWallet,
                            title = "My Cash Handover",
                            subtitle = "View collected cash & submit handover to manager",
                            onClick = {
                                onOpenCashDialog()
                                showCashDialog = true
                            },
                            testTag = "profile_cash_handover_row"
                        )
                        HorizontalDivider(color = BorderLight)
                    }

                    // Shop Expenses — matching Web You tab (ME.can_expense)
                    if (me.canExpense) {
                        ProfileMenuRow(
                            icon = Icons.AutoMirrored.Outlined.ReceiptLong,
                            title = "Add Expense",
                            subtitle = "Log petrol, detergent, or shop expenses",
                            onClick = onOpenExpenses,
                            testTag = "profile_expenses_row"
                        )
                        HorizontalDivider(color = BorderLight)
                    }

                    ProfileMenuRow(
                        icon = Icons.Outlined.History,
                        title = "Completed Work History",
                        subtitle = "View completed orders & finished tasks",
                        onClick = onOpenHistory,
                        testTag = "profile_history_row"
                    )
                    HorizontalDivider(color = BorderLight)

                    ProfileMenuRow(
                        icon = Icons.Outlined.Notifications,
                        title = "Notifications & Urgent Alerts",
                        subtitle = "Manage alert sound, vibration & lock-screen privacy",
                        onClick = onOpenNotifications,
                        testTag = "profile_notifications_row"
                    )
                    HorizontalDivider(color = BorderLight)

                    ProfileMenuRow(
                        icon = Icons.Outlined.Settings,
                        title = "App Settings & Sync Queue",
                        subtitle = if (pendingOutboxCount > 0) {
                            "$pendingOutboxCount status update(s) queued"
                        } else {
                            "Server URL, health check & offline sync"
                        },
                        onClick = onOpenSettings,
                        testTag = "profile_settings_row"
                    )
                    HorizontalDivider(color = BorderLight)

                    ProfileMenuRow(
                        icon = Icons.Outlined.Lock,
                        title = "Change Password",
                        subtitle = "Update your staff account password",
                        onClick = onOpenChangePassword,
                        testTag = "profile_change_password_row"
                    )
                }
            }
        }

        // Secure Sign Out Button
        item {
            OutlinedButton(
                onClick = { showLogoutConfirm = true },
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, StatusError.copy(alpha = 0.5f)),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = StatusError),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .testTag("profile_logout_button")
            ) {
                Icon(Icons.AutoMirrored.Outlined.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Sign Out & Clear Device Session", fontWeight = FontWeight.Bold)
            }
        }
    }

    if (showCashDialog && me.allowFinancialVisibility) {
        CashHandoverDialog(
            cashSummary = cashSummary,
            isLoading = isLoadingCash,
            isOnline = isOnline,
            isSubmitting = isSubmitting,
            onDismiss = { showCashDialog = false },
            onSubmit = { amount, note ->
                showCashDialog = false
                onSubmitCashHandover(amount, note)
            }
        )
    }

    if (showLogoutConfirm) {
        AlertDialog(
            onDismissRequest = { showLogoutConfirm = false },
            title = { Text("Sign Out?", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Signing out clears your encrypted session cookie and any pending local queue from this device."
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showLogoutConfirm = false
                        onLogout()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = StatusError),
                    modifier = Modifier.testTag("confirm_logout_button")
                ) {
                    Text("Sign Out")
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutConfirm = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun RatingMiniStat(label: String, count: Int, tint: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.titleMedium,
            color = tint,
            fontWeight = FontWeight.Bold
        )
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = InkMuted)
    }
}

@Composable
private fun ProfileMenuRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    testTag: String
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp)
            .testTag(testTag)
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(BrandSoft)
        ) {
            Icon(icon, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(20.dp))
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = InkPrimary,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted
            )
        }
        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = InkMuted)
    }
}

@Composable
private fun CashHandoverDialog(
    cashSummary: CashSummaryDto?,
    isLoading: Boolean,
    isOnline: Boolean,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (handedCash: Double, note: String) -> Unit
) {
    var amountText by remember(cashSummary?.cash) {
        mutableStateOf(cashSummary?.cash?.toInt()?.toString() ?: "0")
    }
    var note by remember { mutableStateOf("") }
    var err by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("My Cash Handover", fontWeight = FontWeight.Bold) },
        text = {
            if (isLoading && cashSummary == null) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(100.dp)
                ) {
                    CircularProgressIndicator(color = BrandBlue)
                }
            } else if (cashSummary == null) {
                Text("Could not load cash summary. Please ensure you have internet access.")
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "Since ${cashSummary.since.ifBlank { "last handover" }} · ${cashSummary.count} payment(s)",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted
                    )
                    Surface(
                        color = PageCanvas,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Cash in hand", style = MaterialTheme.typography.bodySmall, color = InkMuted)
                                Text(formatRupees(cashSummary.cash), fontWeight = FontWeight.Bold, color = InkPrimary)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("UPI (already with shop)", style = MaterialTheme.typography.bodySmall, color = InkMuted)
                                Text(formatRupees(cashSummary.upi), fontWeight = FontWeight.SemiBold, color = InkPrimary)
                            }
                        }
                    }

                    if (cashSummary.count > 0) {
                        OutlinedTextField(
                            value = amountText,
                            onValueChange = { amountText = it; err = null },
                            label = { Text("Cash Handing Over (₹)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("cash_handover_amount_input")
                        )
                        OutlinedTextField(
                            value = note,
                            onValueChange = { note = it.take(150); err = null },
                            label = { Text("Note (required if handing less)") },
                            placeholder = { Text("e.g., ₹50 fuel") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        Text(
                            text = "No new cash collected since your last handover.",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted
                        )
                    }

                    if (!err.isNullOrBlank()) {
                        Text(err!!, style = MaterialTheme.typography.labelMedium, color = StatusError)
                    }
                }
            }
        },
        confirmButton = {
            if (cashSummary != null && cashSummary.count > 0) {
                Button(
                    onClick = {
                        val amt = amountText.toDoubleOrNull()
                        when {
                            amt == null || amt < 0.0 -> err = "Enter a valid cash amount."
                            amt > cashSummary.cash + 0.01 -> err = "You collected only ${formatRupees(cashSummary.cash)} in cash."
                            amt < cashSummary.cash - 0.01 && note.trim().length < 3 -> err = "Handing less cash — please write a short reason."
                            else -> onSubmit(amt, note.trim())
                        }
                    },
                    enabled = isOnline && !isSubmitting,
                    modifier = Modifier.testTag("cash_handover_submit_button")
                ) {
                    Text("Hand Over")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}

/** Screen 13: App Settings (Server URL, /health check, Offline Outbox Queue, Web Fallback) */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppSettingsScreen(
    serverBaseUrl: String,
    isOnline: Boolean,
    isCheckingHealth: Boolean,
    healthCheck: CrmHealthResult?,
    outboxItems: List<OfflineActionEntity>,
    onBack: () -> Unit,
    onSaveServerUrl: (String) -> Unit,
    onCheckHealth: (String) -> Unit,
    onSyncOutbox: () -> Unit,
    onDiscardOutboxItem: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    BackHandler(onBack = onBack)

    val context = LocalContext.current
    var urlText by rememberSaveable(serverBaseUrl) { mutableStateOf(serverBaseUrl) }

    Scaffold(
        containerColor = PageCanvas,
        topBar = {
            TopAppBar(
                title = { Text("App Settings", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("settings_back_button")
                    ) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = SurfaceWhite)
            )
        },
        modifier = modifier.testTag("app_settings_screen")
    ) { innerPadding ->
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Backend Server Configuration
            item {
                Surface(
                    color = SurfaceWhite,
                    shape = RoundedCornerShape(18.dp),
                    border = BorderStroke(1.dp, BorderLight),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Kwik Klin Backend Server",
                            style = MaterialTheme.typography.titleSmall,
                            color = InkPrimary,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Only change this if your shop owner asks you to.",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedTextField(
                            value = urlText,
                            onValueChange = { urlText = it },
                            label = { Text("Server Base URL") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("settings_server_url_input")
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = { onSaveServerUrl(urlText) },
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(48.dp)
                                    .testTag("settings_save_url_button")
                            ) {
                                Text("Save & Check")
                            }
                            OutlinedButton(
                                onClick = { onCheckHealth(urlText) },
                                enabled = !isCheckingHealth,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier
                                    .height(48.dp)
                                    .testTag("settings_ping_health_button")
                            ) {
                                Text(if (isCheckingHealth) "Checking…" else "Test")
                            }
                        }

                        healthCheck?.let { res ->
                            Spacer(modifier = Modifier.height(10.dp))
                            Surface(
                                color = if (res.isHealthy) StatusSuccessSoft else StatusErrorSoft,
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = res.message,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (res.isHealthy) StatusSuccess else StatusError,
                                    modifier = Modifier.padding(10.dp)
                                )
                            }
                        }
                    }
                }
            }

            // Offline Status-Only Outbox Queue
            item {
                Surface(
                    color = SurfaceWhite,
                    shape = RoundedCornerShape(18.dp),
                    border = BorderStroke(1.dp, BorderLight),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Offline Status Outbox (${outboxItems.size})",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = InkPrimary,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Only safe status updates are queued offline. Payments always require live internet.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = InkMuted
                                )
                            }
                            if (outboxItems.isNotEmpty()) {
                                OutlinedButton(
                                    onClick = onSyncOutbox,
                                    enabled = isOnline,
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier.testTag("settings_sync_outbox_button")
                                ) {
                                    Icon(Icons.Outlined.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Sync")
                                }
                            }
                        }

                        if (outboxItems.isEmpty()) {
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = "Queue is empty — all status updates are synced with the backend.",
                                style = MaterialTheme.typography.bodySmall,
                                color = StatusSuccess
                            )
                        }
                    }
                }
            }

            if (outboxItems.isNotEmpty()) {
                items(outboxItems, key = { it.id }) { item ->
                    Surface(
                        color = SurfaceWhite,
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(1.dp, BorderLight),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(12.dp)
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "${item.orderNumber} · ${item.actionLabel}",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = InkPrimary,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = "Queued ${formatTimeShort(item.createdAtMs)}" +
                                        if (item.attemptCount > 0) " · ${item.attemptCount} retry(s)" else "",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = InkMuted
                                )
                                if (!item.lastError.isNullOrBlank()) {
                                    Text(
                                        text = item.lastError,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = StatusError
                                    )
                                }
                            }
                            IconButton(
                                onClick = { onDiscardOutboxItem(item.id) },
                                modifier = Modifier.testTag("discard_outbox_${item.id}")
                            ) {
                                Icon(Icons.Outlined.DeleteOutline, contentDescription = "Remove queued item", tint = StatusError)
                            }
                        }
                    }
                }
            }

            // Security & Web Portal Reference
            item {
                Surface(
                    color = SurfaceWhite,
                    shape = RoundedCornerShape(18.dp),
                    border = BorderStroke(1.dp, BorderLight),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Security, contentDescription = null, tint = StatusSuccess)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Security & App Info",
                                style = MaterialTheme.typography.titleSmall,
                                color = InkPrimary,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Version ${BuildConfig.VERSION_NAME} · Session encrypted with Android Keystore AES-256-GCM · Cloud backup disabled.",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedButton(
                            onClick = { openExternalUrl(context, "${serverBaseUrl.trimEnd('/')}/staff") },
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                                .testTag("settings_open_web_portal_button")
                        ) {
                            Icon(Icons.Outlined.OpenInBrowser, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Open Staff Web Portal in Browser")
                        }
                    }
                }
            }
        }
    }
}
