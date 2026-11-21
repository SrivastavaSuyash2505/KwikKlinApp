package com.kwikklin.crm.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Directions
import androidx.compose.material.icons.outlined.DoorFront
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.kwikklin.crm.data.network.OrderDetailDto
import com.kwikklin.crm.data.network.OrderDuesResponse
import com.kwikklin.crm.data.network.OrderStage
import com.kwikklin.crm.data.network.StaffMeDto
import com.kwikklin.crm.data.network.StaffRole
import com.kwikklin.crm.ui.components.withUniqueKeys
import com.kwikklin.crm.ui.components.EmptyStateCard
import com.kwikklin.crm.ui.components.OrderPipelineProgress
import com.kwikklin.crm.ui.components.StatusPill
import com.kwikklin.crm.ui.components.UrgentBadge
import com.kwikklin.crm.ui.components.formatRupees
import com.kwikklin.crm.ui.components.openExternalUrl
import com.kwikklin.crm.ui.components.stageColors
import com.kwikklin.crm.ui.theme.BorderLight
import com.kwikklin.crm.ui.theme.BrandBlue
import com.kwikklin.crm.ui.theme.InkMuted
import com.kwikklin.crm.ui.theme.InkPrimary
import com.kwikklin.crm.ui.theme.PageCanvas
import com.kwikklin.crm.ui.theme.StatusError
import com.kwikklin.crm.ui.theme.StatusSuccess
import com.kwikklin.crm.ui.theme.StatusWarning
import com.kwikklin.crm.ui.theme.StatusWarningSoft
import com.kwikklin.crm.ui.theme.SurfaceWhite

/** Screen 6: Order Details with exact backend state machine & role-gated billing/contact */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(
    me: StaffMeDto,
    order: OrderDetailDto?,
    isLoading: Boolean,
    error: String?,
    isOnline: Boolean,
    isSubmitting: Boolean,
    orderDues: OrderDuesResponse?,
    onBack: () -> Unit,
    onRefresh: (String) -> Unit,
    onCallCustomer: (String) -> Unit,
    onLoadDues: (String) -> Unit,
    onCollectPayment: (orderNumber: String, amount: Double, method: String, settlePrevious: Boolean) -> Unit,
    onMarkPickedUp: (String) -> Unit,
    onStartWashing: (String) -> Unit,
    onUpdateStage: (orderNumber: String, targetWire: String, label: String) -> Unit,
    onDeliverOrder: (String) -> Unit,
    onMarkNotHome: (orderNumber: String, note: String) -> Unit,
    modifier: Modifier = Modifier
) {
    BackHandler(onBack = onBack)

    val context = LocalContext.current
    var pendingTransition by remember { mutableStateOf<Pair<String, () -> Unit>?>(null) }
    var showNotHomeDialog by remember { mutableStateOf(false) }
    var notHomeNote by remember { mutableStateOf("") }
    var showCollectDialog by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = PageCanvas,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = order?.number ?: "Order Details",
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("order_detail_back_button")
                    ) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    order?.let {
                        IconButton(onClick = { onRefresh(it.number) }) {
                            Icon(Icons.Outlined.Refresh, contentDescription = "Refresh order")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = SurfaceWhite)
            )
        },
        modifier = modifier.testTag("order_detail_screen")
    ) { innerPadding ->
        when {
            isLoading && order == null -> {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                ) {
                    CircularProgressIndicator(color = BrandBlue)
                }
            }

            error != null && order == null -> {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .padding(20.dp)
                ) {
                    EmptyStateCard(
                        icon = Icons.Outlined.ErrorOutline,
                        title = "Could Not Load Order",
                        subtitle = error
                    )
                }
            }

            order != null -> {
                val (fg, bg) = stageColors(order.stage)
                val validNextStages = allowedNextStagesForRole(me.staffRole, order.stage)

                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                ) {
                    // Header & Order Lifecycle Bar
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
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Text(
                                            text = order.number,
                                            style = MaterialTheme.typography.titleLarge,
                                            color = InkPrimary,
                                            fontWeight = FontWeight.Bold
                                        )
                                        if (order.urgent) UrgentBadge()
                                    }
                                    StatusPill(text = order.stage.label, fg = fg, bg = bg)
                                }

                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = order.customer.ifBlank { "Customer" },
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = InkPrimary,
                                    fontWeight = FontWeight.SemiBold
                                )
                                if (order.delivery.isNotBlank()) {
                                    Text(
                                        text = "Scheduled: ${order.delivery}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = InkMuted
                                    )
                                }

                                Spacer(modifier = Modifier.height(14.dp))
                                OrderPipelineProgress(currentStage = order.stage)
                            }
                        }
                    }

                    // Special Washing / Ironing / Delivery Instructions
                    if (order.notes.isNotBlank()) {
                        item {
                            Surface(
                                color = StatusWarningSoft,
                                border = BorderStroke(1.dp, StatusWarning.copy(alpha = 0.45f)),
                                shape = RoundedCornerShape(16.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(14.dp)) {
                                    Text(
                                        text = "Special Instructions",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = StatusWarning,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = order.notes,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = InkPrimary
                                    )
                                }
                            }
                        }
                    }

                    // Address & Call Block — STRICTLY gated for Delivery / Authorized roles
                    if (me.allowCustomerCall) {
                        item {
                            Surface(
                                color = SurfaceWhite,
                                shape = RoundedCornerShape(18.dp),
                                border = BorderStroke(1.dp, BorderLight),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text(
                                        text = "Customer Location & Contact",
                                        style = MaterialTheme.typography.titleSmall,
                                        color = InkPrimary,
                                        fontWeight = FontWeight.Bold
                                    )
                                    if (order.address.isNotBlank()) {
                                        Spacer(modifier = Modifier.height(6.dp))
                                        Text(
                                            text = order.address,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = InkMuted
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        OutlinedButton(
                                            onClick = { onCallCustomer(order.number) },
                                            shape = RoundedCornerShape(12.dp),
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(48.dp)
                                                .testTag("detail_call_button")
                                        ) {
                                            Icon(Icons.Outlined.Phone, contentDescription = null, modifier = Modifier.size(18.dp))
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text("Call")
                                        }
                                        if (!order.navUrl.isNullOrBlank()) {
                                            OutlinedButton(
                                                onClick = { openExternalUrl(context, order.navUrl) },
                                                shape = RoundedCornerShape(12.dp),
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .height(48.dp)
                                                    .testTag("detail_navigate_button")
                                            ) {
                                                Icon(Icons.Outlined.Directions, contentDescription = null, modifier = Modifier.size(18.dp))
                                                Spacer(modifier = Modifier.width(6.dp))
                                                Text("Navigate")
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Garment Lines List (Visible to all roles — essential for Washerman & Iron Boy)
                    item {
                        Text(
                            text = "Garments (${order.clothes?.total ?: order.lines.sumOf { it.qty }})",
                            style = MaterialTheme.typography.titleMedium,
                            color = InkPrimary,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    items(order.lines.withUniqueKeys { "${it.line}_${it.name}" }, key = { it.first }) { (_, line) ->
                        Surface(
                            color = SurfaceWhite,
                            shape = RoundedCornerShape(14.dp),
                            border = BorderStroke(1.dp, BorderLight),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Row(
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = line.name,
                                            style = MaterialTheme.typography.titleSmall,
                                            color = InkPrimary,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                        if (line.service.isNotBlank() && line.service != line.name) {
                                            Text(
                                                text = line.service,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = InkMuted
                                            )
                                        }
                                    }
                                    Text(
                                        text = if (line.bag && line.weight != null) {
                                            "${line.weight} kg bag"
                                        } else {
                                            "${line.qty} pc"
                                        },
                                        style = MaterialTheme.typography.labelLarge,
                                        color = BrandBlue,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                if (line.held > 0 || line.returned > 0 || !line.holdReason.isNullOrBlank()) {
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = buildString {
                                            if (line.held > 0) append("On hold: ${line.held} ")
                                            if (!line.holdReason.isNullOrBlank()) append("(${line.holdReason}) ")
                                            if (line.returned > 0) append("Returned: ${line.returned}")
                                        }.trim(),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = StatusWarning
                                    )
                                }

                                line.pieces?.takeIf { it.isNotEmpty() }?.let { pieces ->
                                    Spacer(modifier = Modifier.height(8.dp))
                                    HorizontalDivider(color = BorderLight)
                                    Spacer(modifier = Modifier.height(6.dp))
                                    pieces.forEach { piece ->
                                        Row(
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Text(
                                                text = "• ${piece.type}",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = InkPrimary
                                            )
                                            Text(
                                                text = "${piece.qty} pc",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = InkMuted
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Payment Block — STRICTLY hidden from Washerman & Iron Boy
                    if (me.allowFinancialVisibility) {
                        item {
                            Surface(
                                color = SurfaceWhite,
                                shape = RoundedCornerShape(18.dp),
                                border = BorderStroke(1.dp, BorderLight),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text(
                                        text = "Payment Summary",
                                        style = MaterialTheme.typography.titleSmall,
                                        color = InkPrimary,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Spacer(modifier = Modifier.height(10.dp))
                                    PaymentRow("Bill Total", formatRupees(order.total))
                                    PaymentRow("Paid", formatRupees(order.paid))
                                    PaymentRow(
                                        "Balance Due",
                                        formatRupees(order.due),
                                        highlight = order.due > 0.0
                                    )

                                    if (order.canCollect && order.due > 0.0) {
                                        Spacer(modifier = Modifier.height(12.dp))
                                        Button(
                                            onClick = {
                                                onLoadDues(order.number)
                                                showCollectDialog = true
                                            },
                                            enabled = isOnline && !isSubmitting,
                                            shape = RoundedCornerShape(12.dp),
                                            colors = ButtonDefaults.buttonColors(containerColor = StatusSuccess),
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(48.dp)
                                                .testTag("detail_collect_payment_button")
                                        ) {
                                            Icon(Icons.Outlined.AccountBalanceWallet, contentDescription = null, modifier = Modifier.size(18.dp))
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text(
                                                if (isOnline) "Record Cash / UPI (${formatRupees(order.due)})" else "Online Required to Collect Payment",
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Strict Valid State Transition Actions
                    if (validNextStages.isNotEmpty() || (me.allowCustomerCall && order.stage != OrderStage.DELIVERED && order.stage != OrderStage.CANCELLED)) {
                        item {
                            Surface(
                                color = SurfaceWhite,
                                shape = RoundedCornerShape(18.dp),
                                border = BorderStroke(1.dp, BorderLight),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    verticalArrangement = Arrangement.spacedBy(10.dp),
                                    modifier = Modifier.padding(16.dp)
                                ) {
                                    Text(
                                        text = "Update Order Status",
                                        style = MaterialTheme.typography.titleSmall,
                                        color = InkPrimary,
                                        fontWeight = FontWeight.Bold
                                    )
                                    validNextStages.forEach { target ->
                                        val actionLabel = "Mark as ${target.label}"
                                        Button(
                                            onClick = {
                                                pendingTransition = actionLabel to {
                                                    when (target) {
                                                        OrderStage.PICKED_UP -> onMarkPickedUp(order.number)
                                                        OrderStage.IN_WASH -> onStartWashing(order.number)
                                                        OrderStage.DELIVERED -> onDeliverOrder(order.number)
                                                        else -> onUpdateStage(order.number, target.wireValue, target.label)
                                                    }
                                                }
                                            },
                                            enabled = !isSubmitting,
                                            shape = RoundedCornerShape(12.dp),
                                            colors = ButtonDefaults.buttonColors(
                                                containerColor = if (target == OrderStage.DELIVERED || target == OrderStage.READY) StatusSuccess else BrandBlue
                                            ),
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(48.dp)
                                                .testTag("detail_transition_${target.wireValue}")
                                        ) {
                                            Text(actionLabel, fontWeight = FontWeight.Bold)
                                        }
                                    }

                                    if (me.allowCustomerCall && order.stage in setOf(
                                            OrderStage.RECEIVED,
                                            OrderStage.PICKUP_ASSIGNED,
                                            OrderStage.READY,
                                            OrderStage.OUT_FOR_DELIVERY
                                        )
                                    ) {
                                        OutlinedButton(
                                            onClick = {
                                                notHomeNote = ""
                                                showNotHomeDialog = true
                                            },
                                            shape = RoundedCornerShape(12.dp),
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(48.dp)
                                                .testTag("detail_not_home_button")
                                        ) {
                                            Icon(Icons.Outlined.DoorFront, contentDescription = null, modifier = Modifier.size(18.dp))
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Customer Not Home")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Transition Confirmation Dialog
                pendingTransition?.let { (label, execute) ->
                    AlertDialog(
                        onDismissRequest = { pendingTransition = null },
                        title = { Text("Confirm Status Update", fontWeight = FontWeight.Bold) },
                        text = { Text("Update ${order.number} to \"$label\"?\n\nThis change is validated and recorded in Kwik Klin order history.") },
                        confirmButton = {
                            Button(
                                onClick = {
                                    pendingTransition = null
                                    execute()
                                },
                                modifier = Modifier.testTag("detail_confirm_transition_button")
                            ) {
                                Text("Confirm")
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { pendingTransition = null }) {
                                Text("Cancel")
                            }
                        }
                    )
                }

                // Not Home Dialog
                if (showNotHomeDialog) {
                    AlertDialog(
                        onDismissRequest = { showNotHomeDialog = false },
                        title = { Text("Customer Not Home", fontWeight = FontWeight.Bold) },
                        text = {
                            OutlinedTextField(
                                value = notHomeNote,
                                onValueChange = { notHomeNote = it.take(150) },
                                label = { Text("Reason / Note (optional)") },
                                placeholder = { Text("e.g., Door locked") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                        },
                        confirmButton = {
                            Button(onClick = {
                                showNotHomeDialog = false
                                onMarkNotHome(order.number, notHomeNote)
                            }) {
                                Text("Notify Owner")
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { showNotHomeDialog = false }) { Text("Cancel") }
                        }
                    )
                }

                // Online-Only Payment Collection Dialog
                if (showCollectDialog && me.allowFinancialVisibility) {
                    CollectPaymentDialog(
                        order = order,
                        dues = orderDues,
                        isSubmitting = isSubmitting,
                        onDismiss = { showCollectDialog = false },
                        onCollect = { amount, method, settlePrev ->
                            showCollectDialog = false
                            onCollectPayment(order.number, amount, method, settlePrev)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun PaymentRow(label: String, value: String, highlight: Boolean = false) {
    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp)
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = InkMuted)
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = if (highlight) StatusError else InkPrimary,
            fontWeight = if (highlight) FontWeight.Bold else FontWeight.SemiBold
        )
    }
}

@Composable
private fun CollectPaymentDialog(
    order: OrderDetailDto,
    dues: OrderDuesResponse?,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onCollect: (amount: Double, method: String, settlePrevious: Boolean) -> Unit
) {
    val previousDue = dues?.previousDue ?: 0.0
    val grandTotal = order.due + previousDue
    var settlePrevious by remember { mutableStateOf(false) }
    var amountText by remember(order.due) { mutableStateOf(order.due.toInt().toString()) }
    var method by remember { mutableStateOf("cash") }
    var validationError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(settlePrevious, grandTotal) {
        val target = if (settlePrevious) grandTotal else order.due
        amountText = if (target % 1.0 == 0.0) target.toInt().toString() else String.format("%.2f", target)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Record Payment · ${order.number}", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "Bill Due: ${formatRupees(order.due)}" +
                        if (previousDue > 0.0) " · Previous Due: ${formatRupees(previousDue)}" else "",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted
                )

                if (previousDue > 0.0) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = !settlePrevious,
                            onClick = { settlePrevious = false },
                            label = { Text("This Bill (${formatRupees(order.due)})") }
                        )
                        FilterChip(
                            selected = settlePrevious,
                            onClick = { settlePrevious = true },
                            label = { Text("All Dues (${formatRupees(grandTotal)})") }
                        )
                    }
                }

                OutlinedTextField(
                    value = amountText,
                    onValueChange = { amountText = it; validationError = null },
                    label = { Text("Amount Received (₹)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("collect_amount_input")
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = method == "cash",
                        onClick = { method = "cash" },
                        label = { Text("Cash") },
                        modifier = Modifier.testTag("collect_method_cash")
                    )
                    FilterChip(
                        selected = method == "upi",
                        onClick = { method = "upi" },
                        label = { Text("UPI") },
                        modifier = Modifier.testTag("collect_method_upi")
                    )
                }

                if (!validationError.isNullOrBlank()) {
                    Text(validationError!!, style = MaterialTheme.typography.labelMedium, color = StatusError)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val amt = amountText.toDoubleOrNull()
                    val ceiling = if (settlePrevious) grandTotal else order.due
                    when {
                        amt == null || amt <= 0.0 -> validationError = "Enter a valid positive amount."
                        amt > ceiling + 0.01 -> validationError = "Maximum due is ${formatRupees(ceiling)}."
                        else -> onCollect(amt, method, settlePrevious)
                    }
                },
                enabled = !isSubmitting,
                modifier = Modifier.testTag("collect_submit_button")
            ) {
                Text("Record ${method.uppercase()}")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

private fun allowedNextStagesForRole(role: StaffRole, current: OrderStage): List<OrderStage> {
    if (current == OrderStage.DELIVERED || current == OrderStage.CANCELLED) return emptyList()
    return when (role) {
        StaffRole.DELIVERY -> when (current) {
            OrderStage.RECEIVED, OrderStage.PICKUP_ASSIGNED -> listOf(OrderStage.PICKED_UP)
            OrderStage.READY -> listOf(OrderStage.OUT_FOR_DELIVERY, OrderStage.DELIVERED)
            OrderStage.OUT_FOR_DELIVERY -> listOf(OrderStage.DELIVERED)
            else -> emptyList()
        }
        StaffRole.WASHER -> when (current) {
            OrderStage.RECEIVED, OrderStage.PICKED_UP -> listOf(OrderStage.IN_WASH)
            OrderStage.IN_WASH -> listOf(OrderStage.IN_DRY, OrderStage.IN_IRON, OrderStage.READY)
            OrderStage.IN_DRY -> listOf(OrderStage.IN_IRON, OrderStage.READY)
            else -> emptyList()
        }
        StaffRole.IRONER -> when (current) {
            OrderStage.PICKED_UP, OrderStage.IN_WASH, OrderStage.IN_DRY -> listOf(OrderStage.IN_IRON)
            OrderStage.IN_IRON -> listOf(OrderStage.READY)
            else -> emptyList()
        }
        else -> {
            val idx = current.pipelineIndex
            if (idx in 0 until OrderStage.mainPipeline.lastIndex) {
                OrderStage.mainPipeline.subList(idx + 1, OrderStage.mainPipeline.size).take(3)
            } else {
                emptyList()
            }
        }
    }
}
