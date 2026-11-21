package com.kwikklin.crm.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Iron
import androidx.compose.material.icons.outlined.LocalLaundryService
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kwikklin.crm.data.network.RouteStopDto
import com.kwikklin.crm.data.network.StaffMeDto
import com.kwikklin.crm.data.network.StaffRole
import com.kwikklin.crm.data.network.TaskDto
import com.kwikklin.crm.data.network.TodayDto
import com.kwikklin.crm.ui.components.ConnectivityOutboxBanner
import com.kwikklin.crm.ui.components.EmptyStateCard
import com.kwikklin.crm.ui.components.NavyHeroSurface
import com.kwikklin.crm.ui.components.PlanPill
import com.kwikklin.crm.ui.components.StatusPill
import com.kwikklin.crm.ui.components.UrgentBadge
import com.kwikklin.crm.ui.components.formatRupees
import com.kwikklin.crm.ui.components.stageColors
import com.kwikklin.crm.ui.theme.BorderLight
import com.kwikklin.crm.ui.theme.BrandBlue
import com.kwikklin.crm.ui.theme.BrandSoft
import com.kwikklin.crm.ui.theme.InkMuted
import com.kwikklin.crm.ui.theme.InkPrimary
import com.kwikklin.crm.ui.theme.StatusError
import com.kwikklin.crm.ui.theme.StatusErrorSoft
import com.kwikklin.crm.ui.theme.StatusSuccess
import com.kwikklin.crm.ui.theme.StatusSuccessSoft
import com.kwikklin.crm.ui.theme.StatusWarning
import com.kwikklin.crm.ui.theme.StatusWarningSoft
import com.kwikklin.crm.ui.theme.SurfaceWhite

/** Screen 4: Role-Based Home Dashboard */
@Composable
fun StaffHomeScreen(
    me: StaffMeDto,
    today: TodayDto,
    workStops: List<RouteStopDto>,
    myTasks: List<TaskDto>,
    unreadNotifications: Int,
    isOnline: Boolean,
    pendingOutboxCount: Int,
    subscriptionBanner: String?,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    onSyncOutbox: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenWorkQueue: () -> Unit,
    onOpenTasks: () -> Unit,
    onOpenOrder: (String) -> Unit,
    onOpenCashSheet: () -> Unit,
    modifier: Modifier = Modifier
) {
    val urgentStops = workStops.filter { it.urgent }
    val urgentTasks = myTasks.filter { it.urgent }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = modifier
            .fillMaxSize()
            .testTag("staff_home_screen")
    ) {
        item {
            ConnectivityOutboxBanner(
                isOnline = isOnline,
                pendingOutboxCount = pendingOutboxCount,
                onSyncClick = onSyncOutbox
            )
        }

        if (!subscriptionBanner.isNullOrBlank()) {
            item {
                Surface(
                    color = StatusWarningSoft,
                    border = BorderStroke(1.dp, StatusWarning.copy(alpha = 0.45f)),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(12.dp)
                    ) {
                        Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = StatusWarning)
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = subscriptionBanner,
                            style = MaterialTheme.typography.bodySmall,
                            color = InkPrimary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }

        // Navy Role Hero Card
        item {
            NavyHeroSurface {
                Column {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = me.shop.ifBlank { "Kwik Klin Shop" },
                                style = MaterialTheme.typography.labelMedium,
                                color = Color.White.copy(alpha = 0.78f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = "Hi, ${me.name.ifBlank { me.staffRole.displayLabel }}",
                                style = MaterialTheme.typography.headlineSmall,
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconButton(
                                onClick = onRefresh,
                                enabled = !isRefreshing,
                                modifier = Modifier.testTag("home_refresh_button")
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.Refresh,
                                    contentDescription = "Refresh dashboard",
                                    tint = Color.White
                                )
                            }
                            IconButton(
                                onClick = onOpenNotifications,
                                modifier = Modifier.testTag("home_notifications_button")
                            ) {
                                BadgedBox(
                                    badge = {
                                        if (unreadNotifications > 0) {
                                            Badge(containerColor = StatusError) {
                                                Text(
                                                    text = if (unreadNotifications > 9) "9+" else unreadNotifications.toString(),
                                                    color = Color.White
                                                )
                                            }
                                        }
                                    }
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.Notifications,
                                        contentDescription = "Notifications",
                                        tint = Color.White
                                    )
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            color = Color.White.copy(alpha = 0.16f),
                            shape = RoundedCornerShape(999.dp)
                        ) {
                            Text(
                                text = me.staffRole.displayLabel,
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                            )
                        }
                        PlanPill(plan = me.subscriptionPlan)
                    }
                }
            }
        }

        // Late / Overdue Warning Bar
        if (today.late > 0) {
            item {
                Surface(
                    color = StatusErrorSoft,
                    border = BorderStroke(1.dp, StatusError.copy(alpha = 0.4f)),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenWorkQueue() }
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)
                    ) {
                        Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = StatusError)
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "${today.late} overdue order(s) need attention right now",
                            style = MaterialTheme.typography.labelLarge,
                            color = StatusError,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )
                        Icon(
                            Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                            contentDescription = null,
                            tint = StatusError
                        )
                    }
                }
            }
        }

        // Role-Scoped Today KPI Grid
        item {
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                HomeMetricCard(
                    title = when (me.staffRole) {
                        StaffRole.DELIVERY -> "Pending Stops"
                        StaffRole.WASHER -> "To Wash"
                        StaffRole.IRONER -> "To Iron"
                        else -> "Pending Work"
                    },
                    value = today.pending.toString(),
                    icon = when (me.staffRole) {
                        StaffRole.DELIVERY -> Icons.Outlined.LocalShipping
                        StaffRole.WASHER -> Icons.Outlined.LocalLaundryService
                        StaffRole.IRONER -> Icons.Outlined.Iron
                        else -> Icons.Outlined.TaskAlt
                    },
                    tint = BrandBlue,
                    softBg = BrandSoft,
                    onClick = onOpenWorkQueue,
                    testTag = "home_metric_pending",
                    modifier = Modifier.weight(1f)
                )

                HomeMetricCard(
                    title = "Done Today",
                    value = today.doneToday.toString(),
                    icon = Icons.Outlined.CheckCircle,
                    tint = StatusSuccess,
                    softBg = StatusSuccessSoft,
                    onClick = onOpenTasks,
                    testTag = "home_metric_done",
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Delivery Boy / Authorized Money Row ONLY (Never rendered for Washerman or Iron Boy)
        if (me.allowFinancialVisibility) {
            item {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    HomeMetricCard(
                        title = "Due on Route",
                        value = formatRupees(today.dueToday),
                        icon = Icons.Outlined.AccountBalanceWallet,
                        tint = StatusWarning,
                        softBg = StatusWarningSoft,
                        onClick = onOpenWorkQueue,
                        testTag = "home_metric_due",
                        modifier = Modifier.weight(1f)
                    )
                    HomeMetricCard(
                        title = "Collected Today",
                        value = formatRupees(today.collectedToday),
                        icon = Icons.Outlined.AccountBalanceWallet,
                        tint = StatusSuccess,
                        softBg = StatusSuccessSoft,
                        onClick = onOpenCashSheet,
                        testTag = "home_metric_collected",
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }

        // Urgent Work Priority Section
        if (urgentStops.isNotEmpty() || urgentTasks.isNotEmpty()) {
            item {
                Text(
                    text = "Urgent Priority",
                    style = MaterialTheme.typography.titleMedium,
                    color = StatusError,
                    fontWeight = FontWeight.Bold
                )
            }
            items(urgentStops.take(3), key = { "urgent_${it.number}" }) { stop ->
                HomeQuickOrderRow(
                    stop = stop,
                    showFinancials = me.allowFinancialVisibility,
                    showAddress = me.allowCustomerCall,
                    onClick = { onOpenOrder(stop.number) }
                )
            }
        }

        // Next Up in Queue
        item {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = when (me.staffRole) {
                        StaffRole.DELIVERY -> "Next Pickup & Delivery Stops"
                        StaffRole.WASHER -> "Active Washing Queue"
                        StaffRole.IRONER -> "Active Ironing Queue"
                        else -> "Assigned Orders"
                    },
                    style = MaterialTheme.typography.titleMedium,
                    color = InkPrimary,
                    fontWeight = FontWeight.Bold
                )
                TextButton(
                    onClick = onOpenWorkQueue,
                    modifier = Modifier.testTag("home_view_all_work_button")
                ) {
                    Text("See All (${workStops.size})")
                }
            }
        }

        if (workStops.isEmpty()) {
            item {
                EmptyStateCard(
                    icon = Icons.Outlined.CheckCircle,
                    title = "All Caught Up",
                    subtitle = "No assigned orders right now. Pull or tap refresh to check for new work."
                )
            }
        } else {
            items(workStops.take(5), key = { "home_${it.number}_${it.status}" }) { stop ->
                HomeQuickOrderRow(
                    stop = stop,
                    showFinancials = me.allowFinancialVisibility,
                    showAddress = me.allowCustomerCall,
                    onClick = { onOpenOrder(stop.number) }
                )
            }
        }

        // Open Tasks Summary Card
        if (myTasks.isNotEmpty()) {
            item {
                Surface(
                    color = SurfaceWhite,
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, BorderLight),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenTasks() }
                        .testTag("home_tasks_summary_card")
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(16.dp)
                    ) {
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .size(42.dp)
                                .clip(CircleShape)
                                .background(BrandSoft)
                        ) {
                            Icon(Icons.Outlined.TaskAlt, contentDescription = null, tint = BrandBlue)
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "${myTasks.size} Open Task(s) Assigned",
                                style = MaterialTheme.typography.titleSmall,
                                color = InkPrimary,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = myTasks.first().title,
                                style = MaterialTheme.typography.bodySmall,
                                color = InkMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        Icon(
                            Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                            contentDescription = "View tasks",
                            tint = InkMuted
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeMetricCard(
    title: String,
    value: String,
    icon: ImageVector,
    tint: Color,
    softBg: Color,
    onClick: () -> Unit,
    testTag: String,
    modifier: Modifier = Modifier
) {
    Surface(
        color = SurfaceWhite,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, BorderLight),
        modifier = modifier
            .clickable(onClick = onClick)
            .testTag(testTag)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(softBg)
            ) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                color = InkPrimary,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                color = InkMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun HomeQuickOrderRow(
    stop: RouteStopDto,
    showFinancials: Boolean,
    showAddress: Boolean,
    onClick: () -> Unit
) {
    val (fg, bg) = stageColors(stop.stage)
    Surface(
        color = SurfaceWhite,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(
            width = if (stop.urgent) 1.5.dp else 1.dp,
            color = if (stop.urgent) StatusError.copy(alpha = 0.45f) else BorderLight
        ),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag("home_order_card_${stop.number}")
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = stop.number,
                        style = MaterialTheme.typography.titleSmall,
                        color = InkPrimary,
                        fontWeight = FontWeight.Bold
                    )
                    if (stop.urgent) UrgentBadge()
                }
                StatusPill(text = stop.stage.label, fg = fg, bg = bg)
            }

            Spacer(modifier = Modifier.height(6.dp))

            val primaryInfo = buildString {
                if (stop.customer.isNotBlank()) append(stop.customer)
                if (stop.items.isNotBlank()) {
                    if (isNotEmpty()) append(" · ")
                    append(stop.items)
                }
            }
            if (primaryInfo.isNotBlank()) {
                Text(
                    text = primaryInfo,
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            if (showAddress && stop.address.isNotBlank()) {
                Spacer(modifier = Modifier.height(3.dp))
                Text(
                    text = stop.address,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = if (stop.delivery.isNotBlank()) "Due: ${stop.delivery}" else stop.kind,
                    style = MaterialTheme.typography.labelSmall,
                    color = InkMuted
                )
                if (showFinancials && stop.due > 0.0) {
                    Text(
                        text = "Balance: ${formatRupees(stop.due)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = StatusWarning,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
