package com.kwikklin.crm.ui.screens

import android.net.Uri
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Directions
import androidx.compose.material.icons.outlined.DoorFront
import androidx.compose.material.icons.outlined.Iron
import androidx.compose.material.icons.outlined.LocalLaundryService
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kwikklin.crm.data.network.OrderStage
import com.kwikklin.crm.data.network.RouteStopDto
import com.kwikklin.crm.data.network.StaffMeDto
import com.kwikklin.crm.data.network.StaffRole
import com.kwikklin.crm.data.network.TodayDto
import com.kwikklin.crm.ui.components.ConnectivityOutboxBanner
import com.kwikklin.crm.ui.components.EmptyStateCard
import com.kwikklin.crm.ui.components.KwikSearchField
import com.kwikklin.crm.ui.components.StatusPill
import com.kwikklin.crm.ui.components.UrgentBadge
import com.kwikklin.crm.ui.components.formatRupees
import com.kwikklin.crm.ui.components.openExternalUrl
import com.kwikklin.crm.ui.components.stageColors
import com.kwikklin.crm.ui.theme.BorderLight
import com.kwikklin.crm.ui.theme.BrandBlue
import com.kwikklin.crm.ui.theme.InkMuted
import com.kwikklin.crm.ui.theme.InkPrimary
import com.kwikklin.crm.ui.theme.StatusError
import com.kwikklin.crm.ui.theme.StatusErrorSoft
import com.kwikklin.crm.ui.theme.StatusSuccess
import com.kwikklin.crm.ui.theme.StatusWarning
import com.kwikklin.crm.ui.theme.StatusWarningSoft
import com.kwikklin.crm.ui.theme.SurfaceWhite

private data class PendingConfirmAction(
    val orderNumber: String,
    val title: String,
    val description: String,
    val confirmLabel: String,
    val onConfirm: () -> Unit
)

/**
 * Serves Screens 7, 8, and 9 with strict role adaptation:
 * - Screen 7: Delivery Boy (Pickup & Delivery)
 * - Screen 8: Washerman (Washing Tasks — zero billing/contact)
 * - Screen 9: Iron Boy (Ironing Tasks — only garment pressing info)
 */
@Composable
fun WorkQueueScreen(
    me: StaffMeDto,
    today: TodayDto?,
    stops: List<RouteStopDto>,
    unreadNotifications: Int,
    subscriptionBanner: String?,
    isOnline: Boolean,
    pendingOutboxCount: Int,
    isSubmitting: Boolean,
    onRefresh: () -> Unit,
    onSyncOutbox: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenOrder: (String) -> Unit,
    onCallCustomer: (String) -> Unit,
    onMarkPickedUp: (String) -> Unit,
    onStartWashing: (String) -> Unit,
    onUpdateStage: (orderNumber: String, targetWire: String, label: String) -> Unit,
    onDeliverOrder: (String) -> Unit,
    onMarkNotHome: (orderNumber: String, note: String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var search by rememberSaveable { mutableStateOf("") }
    var selectedFilter by rememberSaveable { mutableStateOf("ALL") }
    var pendingConfirm by remember { mutableStateOf<PendingConfirmAction?>(null) }
    var notHomeOrder by remember { mutableStateOf<String?>(null) }
    var notHomeNote by remember { mutableStateOf("") }

    val screenTitle = when (me.staffRole) {
        StaffRole.DELIVERY -> "Pickup & Delivery"
        StaffRole.WASHER -> "Washing Tasks"
        StaffRole.IRONER -> "Ironing Tasks"
        else -> "Assigned Work"
    }

    val filterOptions: List<Pair<String, String>> = when (me.staffRole) {
        StaffRole.DELIVERY -> listOf(
            "ALL" to "All",
            "PICKUP" to "Pickups",
            "DELIVERY" to "Deliveries",
            "URGENT" to "Urgent"
        )
        StaffRole.WASHER -> listOf(
            "ALL" to "All",
            "WAITING" to "To Start",
            "IN_WASH" to "Washing",
            "URGENT" to "Urgent"
        )
        StaffRole.IRONER -> listOf(
            "ALL" to "All",
            "WAITING" to "Waiting Press",
            "IN_IRON" to "Ironing Now",
            "URGENT" to "Urgent"
        )
        else -> listOf("ALL" to "All", "URGENT" to "Urgent")
    }

    val filteredStops = remember(stops, search, selectedFilter, me.staffRole) {
        stops.filter { stop ->
            val q = search.trim().lowercase()
            val matchesSearch = q.isEmpty() ||
                stop.number.lowercase().contains(q) ||
                stop.customer.lowercase().contains(q) ||
                stop.items.lowercase().contains(q) ||
                (me.allowCustomerCall && stop.address.lowercase().contains(q))

            val matchesFilter = when (selectedFilter) {
                "URGENT" -> stop.urgent
                "PICKUP" -> stop.kind.equals("Pickup", true) ||
                    stop.stage == OrderStage.RECEIVED || stop.stage == OrderStage.PICKUP_ASSIGNED
                "DELIVERY" -> stop.kind.equals("Delivery", true) ||
                    stop.stage == OrderStage.READY || stop.stage == OrderStage.OUT_FOR_DELIVERY
                "WAITING" -> when (me.staffRole) {
                    StaffRole.WASHER -> stop.stage == OrderStage.PICKED_UP || stop.stage == OrderStage.RECEIVED
                    StaffRole.IRONER -> stop.stage == OrderStage.IN_DRY || stop.stage == OrderStage.IN_WASH
                    else -> true
                }
                "IN_WASH" -> stop.stage == OrderStage.IN_WASH || stop.stage == OrderStage.IN_DRY
                "IN_IRON" -> stop.stage == OrderStage.IN_IRON
                else -> true
            }
            matchesSearch && matchesFilter
        }
    }

    val routeWaypoints = remember(filteredStops) {
        filteredStops.mapNotNull { it.waypoint?.takeIf { wp -> wp.isNotBlank() } }.take(9)
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = modifier
            .fillMaxSize()
            .testTag("work_queue_screen")
    ) {
        item {
            ConnectivityOutboxBanner(
                isOnline = isOnline,
                pendingOutboxCount = pendingOutboxCount,
                onSyncClick = onSyncOutbox
            )
        }

        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (me.canCreateBill && me.shop.isNotBlank()) me.shop else screenTitle,
                        style = MaterialTheme.typography.headlineSmall,
                        color = InkPrimary,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = if (me.canCreateBill) {
                            "${me.staffRole.displayLabel} · ${filteredStops.size} active item(s)"
                        } else {
                            "${filteredStops.size} active item(s) · live from shop backend"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(
                        onClick = onOpenNotifications,
                        modifier = Modifier.testTag("work_notifications_button")
                    ) {
                        if (unreadNotifications > 0) {
                            BadgedBox(
                                badge = {
                                    Badge(containerColor = StatusError) {
                                        Text(if (unreadNotifications > 99) "99+" else unreadNotifications.toString())
                                    }
                                }
                            ) {
                                Icon(Icons.Outlined.Notifications, contentDescription = "Notifications", tint = InkPrimary)
                            }
                        } else {
                            Icon(Icons.Outlined.Notifications, contentDescription = "Notifications", tint = InkPrimary)
                        }
                    }
                    IconButton(
                        onClick = onRefresh,
                        modifier = Modifier.testTag("work_refresh_button")
                    ) {
                        Icon(Icons.Outlined.Refresh, contentDescription = "Refresh work queue", tint = BrandBlue)
                    }
                }
            }
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
                        Spacer(modifier = Modifier.width(8.dp))
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

        // Web Staff App Today KPI strip & Late overdue warning bar (matches app/static/staff.html)
        if (me.canCreateBill && today != null) {
            item {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    CompactTodayMetric(
                        label = "Pending",
                        value = "${today.pending}",
                        accent = BrandBlue,
                        modifier = Modifier.weight(1f)
                    )
                    CompactTodayMetric(
                        label = "Done Today",
                        value = "${today.doneToday}",
                        accent = StatusSuccess,
                        modifier = Modifier.weight(1f)
                    )
                    if (me.allowFinancialVisibility) {
                        val showCollected = today.collectedToday > 0.0 || today.dueToday <= 0.0
                        CompactTodayMetric(
                            label = if (showCollected) "Collected" else "Due Today",
                            value = if (showCollected) formatRupees(today.collectedToday) else formatRupees(today.dueToday),
                            accent = if (showCollected) StatusSuccess else StatusWarning,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
            if (today.late > 0) {
                item {
                    Surface(
                        color = StatusErrorSoft,
                        border = BorderStroke(1.dp, StatusError.copy(alpha = 0.4f)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)
                        ) {
                            Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = StatusError, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "${today.late} overdue order(s) need attention today",
                                style = MaterialTheme.typography.labelMedium,
                                color = StatusError,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }

        // Delivery multi-stop Google Maps launcher (gated by me.showRoute & Delivery role)
        if (me.showRoute && me.allowCustomerCall && routeWaypoints.size >= 2) {
            item {
                OutlinedButton(
                    onClick = {
                        val dest = Uri.encode(routeWaypoints.last())
                        val mid = routeWaypoints.dropLast(1).joinToString("|") { Uri.encode(it) }
                        val mapsUrl = "https://www.google.com/maps/dir/?api=1&destination=$dest&waypoints=$mid&travelmode=driving"
                        openExternalUrl(context, mapsUrl)
                    },
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("open_full_route_map_button")
                ) {
                    Icon(Icons.Outlined.Map, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Open Multi-Stop Route in Google Maps (${routeWaypoints.size} stops)")
                }
            }
        }

        item {
            KwikSearchField(
                value = search,
                onValueChange = { search = it },
                placeholder = if (me.allowCustomerCall) "Search order #, customer, or address" else "Search order # or garment item",
                testTag = "work_search_input"
            )
        }

        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(filterOptions) { (key, label) ->
                    FilterChip(
                        selected = selectedFilter == key,
                        onClick = { selectedFilter = key },
                        label = { Text(label) },
                        modifier = Modifier.testTag("work_filter_$key")
                    )
                }
            }
        }

        if (filteredStops.isEmpty()) {
            item {
                val emptyIcon = when (me.staffRole) {
                    StaffRole.DELIVERY -> Icons.Outlined.LocalShipping
                    StaffRole.WASHER -> Icons.Outlined.LocalLaundryService
                    StaffRole.IRONER -> Icons.Outlined.Iron
                    else -> Icons.Outlined.CheckCircle
                }
                EmptyStateCard(
                    icon = emptyIcon,
                    title = "No Matching Work",
                    subtitle = "All orders in this queue are completed or none match your filter."
                )
            }
        } else {
            items(filteredStops, key = { "${it.number}_${it.status}_${it.kind}" }) { stop ->
                WorkStopCard(
                    me = me,
                    stop = stop,
                    isSubmitting = isSubmitting,
                    onOpenDetail = { onOpenOrder(stop.number) },
                    onNavigate = { url -> openExternalUrl(context, url) },
                    onCall = { onCallCustomer(stop.number) },
                    onNotHome = {
                        notHomeOrder = stop.number
                        notHomeNote = ""
                    },
                    onPrimaryAction = { title, desc, label, action ->
                        pendingConfirm = PendingConfirmAction(
                            orderNumber = stop.number,
                            title = title,
                            description = desc,
                            confirmLabel = label,
                            onConfirm = action
                        )
                    },
                    onMarkPickedUp = { onMarkPickedUp(stop.number) },
                    onStartWashing = { onStartWashing(stop.number) },
                    onUpdateStage = { wire, label -> onUpdateStage(stop.number, wire, label) },
                    onDeliver = { onDeliverOrder(stop.number) }
                )
            }
        }
    }

    // Confirmation Dialog before every status transition
    pendingConfirm?.let { confirm ->
        AlertDialog(
            onDismissRequest = { pendingConfirm = null },
            title = { Text(confirm.title, fontWeight = FontWeight.Bold) },
            text = { Text("${confirm.orderNumber}\n\n${confirm.description}") },
            confirmButton = {
                Button(
                    onClick = {
                        val action = confirm.onConfirm
                        pendingConfirm = null
                        action()
                    },
                    modifier = Modifier.testTag("confirm_status_transition_button")
                ) {
                    Text(confirm.confirmLabel)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingConfirm = null }) {
                    Text("Not Now")
                }
            }
        )
    }

    // Customer Not Home Dialog (Delivery Boy)
    notHomeOrder?.let { orderNum ->
        AlertDialog(
            onDismissRequest = { notHomeOrder = null },
            title = { Text("Customer Not Home?", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Order $orderNum will stay in your list and your shop owner will be alerted.",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted
                    )
                    OutlinedTextField(
                        value = notHomeNote,
                        onValueChange = { notHomeNote = it.take(150) },
                        label = { Text("Optional Note") },
                        placeholder = { Text("e.g., Door locked, no answer on phone") },
                        singleLine = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("not_home_note_input")
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val note = notHomeNote
                        notHomeOrder = null
                        onMarkNotHome(orderNum, note)
                    },
                    modifier = Modifier.testTag("confirm_not_home_button")
                ) {
                    Text("Mark Not Home")
                }
            },
            dismissButton = {
                TextButton(onClick = { notHomeOrder = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun CompactTodayMetric(
    label: String,
    value: String,
    accent: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier
) {
    Surface(
        color = SurfaceWhite,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, BorderLight),
        modifier = modifier
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                color = accent,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = InkMuted,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun WorkStopCard(
    me: StaffMeDto,
    stop: RouteStopDto,
    isSubmitting: Boolean,
    onOpenDetail: () -> Unit,
    onNavigate: (String) -> Unit,
    onCall: () -> Unit,
    onNotHome: () -> Unit,
    onPrimaryAction: (title: String, desc: String, label: String, action: () -> Unit) -> Unit,
    onMarkPickedUp: () -> Unit,
    onStartWashing: () -> Unit,
    onUpdateStage: (wire: String, label: String) -> Unit,
    onDeliver: () -> Unit
) {
    val (fg, bg) = stageColors(stop.stage)
    Surface(
        color = SurfaceWhite,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(
            width = if (stop.urgent) 1.5.dp else 1.dp,
            color = if (stop.urgent) StatusError.copy(alpha = 0.5f) else BorderLight
        ),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpenDetail)
            .testTag("work_card_${stop.number}")
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
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
                        style = MaterialTheme.typography.titleMedium,
                        color = InkPrimary,
                        fontWeight = FontWeight.Bold
                    )
                    if (stop.urgent) UrgentBadge()
                }
                StatusPill(text = stop.stage.label, fg = fg, bg = bg)
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Role-scoped details: Washerman/Iron Boy see garment counts & customer label, NO billing/phone/address
            if (stop.customer.isNotBlank()) {
                Text(
                    text = stop.customer,
                    style = MaterialTheme.typography.bodyLarge,
                    color = InkPrimary,
                    fontWeight = FontWeight.SemiBold
                )
            }

            if (stop.items.isNotBlank()) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = stop.items,
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkPrimary
                )
            }

            stop.clothes?.let { c ->
                if (c.total > 0) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "${c.pending} pending · ${c.total} total pieces" +
                            if (c.held > 0) " · ${c.held} on hold" else "",
                        style = MaterialTheme.typography.labelMedium,
                        color = InkMuted
                    )
                }
            }

            if (me.allowCustomerCall && stop.address.isNotBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = stop.address,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (stop.delivery.isNotBlank()) {
                    Text(
                        text = "Due: ${stop.delivery}",
                        style = MaterialTheme.typography.labelSmall,
                        color = InkMuted
                    )
                }
                if (me.allowFinancialVisibility && stop.due > 0.0) {
                    Text(
                        text = "Due: ${formatRupees(stop.due)}",
                        style = MaterialTheme.typography.labelLarge,
                        color = StatusWarning,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Role-strict primary state transition CTA
            val primaryCta = resolveRolePrimaryAction(
                role = me.staffRole,
                stage = stop.stage,
                onMarkPickedUp = onMarkPickedUp,
                onStartWashing = onStartWashing,
                onUpdateStage = onUpdateStage,
                onDeliver = onDeliver
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (primaryCta != null) {
                    Button(
                        onClick = {
                            onPrimaryAction(
                                primaryCta.dialogTitle,
                                primaryCta.dialogDesc,
                                primaryCta.buttonLabel,
                                primaryCta.action
                            )
                        },
                        enabled = !isSubmitting,
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (stop.stage == OrderStage.OUT_FOR_DELIVERY || stop.stage == OrderStage.IN_IRON) {
                                StatusSuccess
                            } else {
                                BrandBlue
                            }
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                            .testTag("work_primary_cta_${stop.number}")
                    ) {
                        Text(primaryCta.buttonLabel, fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                } else {
                    OutlinedButton(
                        onClick = onOpenDetail,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Text("Open Details")
                    }
                }

                // Delivery Boy quick utilities (Navigate, Call, Not Home)
                if (me.allowCustomerCall) {
                    if (!stop.navUrl.isNullOrBlank()) {
                        OutlinedButton(
                            onClick = { onNavigate(stop.navUrl) },
                            contentPadding = PaddingValues(horizontal = 12.dp),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .height(48.dp)
                                .testTag("work_navigate_${stop.number}")
                        ) {
                            Icon(Icons.Outlined.Directions, contentDescription = "Directions", modifier = Modifier.size(20.dp))
                        }
                    }

                    OutlinedButton(
                        onClick = onCall,
                        contentPadding = PaddingValues(horizontal = 12.dp),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .height(48.dp)
                            .testTag("work_call_${stop.number}")
                    ) {
                        Icon(Icons.Outlined.Phone, contentDescription = "Call customer", modifier = Modifier.size(20.dp))
                    }

                    if (stop.stage in setOf(
                            OrderStage.RECEIVED,
                            OrderStage.PICKUP_ASSIGNED,
                            OrderStage.READY,
                            OrderStage.OUT_FOR_DELIVERY
                        )
                    ) {
                        OutlinedButton(
                            onClick = onNotHome,
                            contentPadding = PaddingValues(horizontal = 12.dp),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .height(48.dp)
                                .testTag("work_not_home_${stop.number}")
                        ) {
                            Icon(Icons.Outlined.DoorFront, contentDescription = "Customer not home", modifier = Modifier.size(20.dp))
                        }
                    }
                }
            }
        }
    }
}

private data class RoleActionSpec(
    val buttonLabel: String,
    val dialogTitle: String,
    val dialogDesc: String,
    val action: () -> Unit
)

private fun resolveRolePrimaryAction(
    role: StaffRole,
    stage: OrderStage,
    onMarkPickedUp: () -> Unit,
    onStartWashing: () -> Unit,
    onUpdateStage: (wire: String, label: String) -> Unit,
    onDeliver: () -> Unit
): RoleActionSpec? {
    return when (role) {
        StaffRole.DELIVERY -> when (stage) {
            OrderStage.RECEIVED, OrderStage.PICKUP_ASSIGNED -> RoleActionSpec(
                buttonLabel = "Mark Picked Up",
                dialogTitle = "Confirm Pickup",
                dialogDesc = "Have you collected the clothes from the customer?",
                action = onMarkPickedUp
            )
            OrderStage.READY -> RoleActionSpec(
                buttonLabel = "Out for Delivery",
                dialogTitle = "Start Delivery",
                dialogDesc = "Mark this order Out for Delivery? The customer will be notified.",
                action = { onUpdateStage(OrderStage.OUT_FOR_DELIVERY.wireValue, "Out for Delivery") }
            )
            OrderStage.OUT_FOR_DELIVERY -> RoleActionSpec(
                buttonLabel = "Mark Delivered",
                dialogTitle = "Confirm Delivery",
                dialogDesc = "Have you handed over all ready clothes to the customer?",
                action = onDeliver
            )
            else -> null
        }

        StaffRole.WASHER -> when (stage) {
            OrderStage.PICKED_UP, OrderStage.RECEIVED -> RoleActionSpec(
                buttonLabel = "Start Washing",
                dialogTitle = "Start Washing",
                dialogDesc = "Confirm clothes are checked and washing has started?",
                action = onStartWashing
            )
            OrderStage.IN_WASH -> RoleActionSpec(
                buttonLabel = "Washing Done (Dry)",
                dialogTitle = "Complete Washing",
                dialogDesc = "Move this order from Washing to Drying stage?",
                action = { onUpdateStage(OrderStage.IN_DRY.wireValue, "Drying") }
            )
            OrderStage.IN_DRY -> RoleActionSpec(
                buttonLabel = "Send to Ironing",
                dialogTitle = "Move to Ironing",
                dialogDesc = "Clothes are dry. Move this order to Ironing?",
                action = { onUpdateStage(OrderStage.IN_IRON.wireValue, "Ironing") }
            )
            else -> null
        }

        StaffRole.IRONER -> when (stage) {
            OrderStage.IN_DRY, OrderStage.IN_WASH, OrderStage.PICKED_UP -> RoleActionSpec(
                buttonLabel = "Start Ironing",
                dialogTitle = "Start Ironing",
                dialogDesc = "Mark ironing/press as started for this order?",
                action = { onUpdateStage(OrderStage.IN_IRON.wireValue, "Ironing") }
            )
            OrderStage.IN_IRON -> RoleActionSpec(
                buttonLabel = "Ironing Done (Ready)",
                dialogTitle = "Complete Ironing",
                dialogDesc = "Mark this order as Ready for delivery? The customer will be notified.",
                action = { onUpdateStage(OrderStage.READY.wireValue, "Ready") }
            )
            else -> null
        }

        // Supervisor / Manager / Solo Owner
        else -> when (stage) {
            OrderStage.RECEIVED, OrderStage.PICKUP_ASSIGNED -> RoleActionSpec(
                "Mark Picked Up", "Confirm Pickup", "Mark clothes as picked up?", onMarkPickedUp
            )
            OrderStage.PICKED_UP -> RoleActionSpec(
                "Start Washing", "Start Washing", "Start washing these clothes?", onStartWashing
            )
            OrderStage.IN_WASH -> RoleActionSpec(
                "Move to Drying", "Update Stage", "Move order to Drying?",
                { onUpdateStage(OrderStage.IN_DRY.wireValue, "Drying") }
            )
            OrderStage.IN_DRY -> RoleActionSpec(
                "Start Ironing", "Update Stage", "Move order to Ironing?",
                { onUpdateStage(OrderStage.IN_IRON.wireValue, "Ironing") }
            )
            OrderStage.IN_IRON -> RoleActionSpec(
                "Mark Ready", "Mark Ready", "Mark order as Ready for delivery?",
                { onUpdateStage(OrderStage.READY.wireValue, "Ready") }
            )
            OrderStage.READY -> RoleActionSpec(
                "Out for Delivery", "Out for Delivery", "Mark order Out for Delivery?",
                { onUpdateStage(OrderStage.OUT_FOR_DELIVERY.wireValue, "Out for Delivery") }
            )
            OrderStage.OUT_FOR_DELIVERY -> RoleActionSpec(
                "Mark Delivered", "Confirm Delivery", "Mark order as Delivered?", onDeliver
            )
            else -> null
        }
    }
}
