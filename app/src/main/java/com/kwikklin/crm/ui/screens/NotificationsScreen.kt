package com.kwikklin.crm.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.kwikklin.crm.data.network.NotificationItemDto
import com.kwikklin.crm.data.notifications.StaffNotificationHelper
import com.kwikklin.crm.ui.components.withUniqueKeys
import com.kwikklin.crm.ui.components.EmptyStateCard
import com.kwikklin.crm.ui.components.UrgentBadge
import com.kwikklin.crm.ui.theme.BorderLight
import com.kwikklin.crm.ui.theme.BrandBlue
import com.kwikklin.crm.ui.theme.BrandSoft
import com.kwikklin.crm.ui.theme.InkMuted
import com.kwikklin.crm.ui.theme.InkPrimary
import com.kwikklin.crm.ui.theme.PageCanvas
import com.kwikklin.crm.ui.theme.StatusError
import com.kwikklin.crm.ui.theme.StatusSuccess
import com.kwikklin.crm.ui.theme.StatusSuccessSoft
import com.kwikklin.crm.ui.theme.SurfaceWhite

/** Screen 11: Staff Notifications with Urgent Alert Channel & Lock-Screen Privacy */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    items: List<NotificationItemDto>,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onOpenOrder: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    BackHandler(onBack = onBack)

    val context = LocalContext.current
    var hasPermission by remember {
        mutableStateOf(StaffNotificationHelper.hasNotificationPermission(context))
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasPermission = granted
    }

    LaunchedEffect(Unit) {
        onRefresh()
    }

    Scaffold(
        containerColor = PageCanvas,
        topBar = {
            TopAppBar(
                title = { Text("Notifications", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("notifications_back_button")
                    ) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(
                        onClick = onRefresh,
                        modifier = Modifier.testTag("notifications_refresh_button")
                    ) {
                        Icon(Icons.Outlined.Refresh, contentDescription = "Refresh notifications")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = SurfaceWhite)
            )
        },
        modifier = modifier.testTag("notifications_screen")
    ) { innerPadding ->
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Runtime Notification Permission & Alert Channel Card
            item {
                Surface(
                    color = if (hasPermission) StatusSuccessSoft else BrandSoft,
                    border = BorderStroke(
                        1.dp,
                        if (hasPermission) StatusSuccess.copy(alpha = 0.35f) else BrandBlue.copy(alpha = 0.35f)
                    ),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Outlined.NotificationsActive,
                                contentDescription = null,
                                tint = if (hasPermission) StatusSuccess else BrandBlue
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = if (hasPermission) "Urgent Staff Alerts Enabled" else "Enable Urgent Work Alerts",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = InkPrimary,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Lock-screen safe: customer phone numbers and addresses are never shown on the lock screen.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = InkMuted
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        if (!hasPermission && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            Button(
                                onClick = { permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) },
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp)
                                    .testTag("enable_notifications_permission_button")
                            ) {
                                Text("Allow Urgent Alerts", fontWeight = FontWeight.Bold)
                            }
                        } else {
                            OutlinedButton(
                                onClick = {
                                    StaffNotificationHelper.postStaffAlert(
                                        context = context,
                                        notificationId = 9001,
                                        title = "Test Urgent Alert",
                                        body = "Your device is ready to vibrate and ring for urgent Kwik Klin work.",
                                        urgent = true
                                    )
                                },
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp)
                                    .testTag("test_urgent_notification_button")
                            ) {
                                Text("Send Test Urgent Alert")
                            }
                        }
                    }
                }
            }

            if (items.isEmpty()) {
                item {
                    EmptyStateCard(
                        icon = Icons.Outlined.NotificationsNone,
                        title = "No Notifications",
                        subtitle = "Urgent assignments and messages from your shop owner will appear here."
                    )
                }
            } else {
                items(items.withUniqueKeys { it.code.ifBlank { "${it.title}_${it.at}" } }, key = { it.first }) { (_, note) ->
                    val isUrgent = note.urgent || note.title.contains("urgent", ignoreCase = true)
                    Surface(
                        color = SurfaceWhite,
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(
                            width = if (isUrgent) 1.5.dp else 1.dp,
                            color = if (isUrgent) StatusError.copy(alpha = 0.5f) else BorderLight
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !note.order.isNullOrBlank()) {
                                note.order?.let(onOpenOrder)
                            }
                            .testTag("notification_card_${note.code}")
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = note.title.ifBlank { "Shop Update" },
                                    style = MaterialTheme.typography.titleSmall,
                                    color = InkPrimary,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.weight(1f)
                                )
                                if (isUrgent) {
                                    Spacer(modifier = Modifier.width(8.dp))
                                    UrgentBadge()
                                }
                            }
                            if (note.text.isNotBlank()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = note.text,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = InkPrimary
                                )
                            }
                            if (note.at.isNotBlank()) {
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = note.at,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = InkMuted
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
