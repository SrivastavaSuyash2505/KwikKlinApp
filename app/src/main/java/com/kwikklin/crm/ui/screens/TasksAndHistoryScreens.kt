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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.kwikklin.crm.data.network.RouteStopDto
import com.kwikklin.crm.data.network.StaffMeDto
import com.kwikklin.crm.data.network.TaskDto
import com.kwikklin.crm.data.network.TaskMessagesResponse
import com.kwikklin.crm.ui.components.ConnectivityOutboxBanner
import com.kwikklin.crm.ui.components.EmptyStateCard
import com.kwikklin.crm.ui.components.StatusPill
import com.kwikklin.crm.ui.components.UrgentBadge
import com.kwikklin.crm.ui.components.stageColors
import com.kwikklin.crm.ui.theme.BorderLight
import com.kwikklin.crm.ui.theme.BrandBlue
import com.kwikklin.crm.ui.theme.BrandInk
import com.kwikklin.crm.ui.theme.BrandSoft
import com.kwikklin.crm.ui.theme.InkMuted
import com.kwikklin.crm.ui.theme.InkPrimary
import com.kwikklin.crm.ui.theme.PageCanvas
import com.kwikklin.crm.ui.theme.StatusError
import com.kwikklin.crm.ui.theme.StatusSuccess
import com.kwikklin.crm.ui.theme.StatusSuccessSoft
import com.kwikklin.crm.ui.theme.StatusWarning
import com.kwikklin.crm.ui.theme.StatusWarningSoft
import com.kwikklin.crm.ui.theme.SurfaceWhite

/** Screen 5: My Tasks Screen (Assigned tasks, Mark Done, Ask Owner thread, Request Cancel) */
@Composable
fun MyTasksScreen(
    me: StaffMeDto,
    tasks: List<TaskDto>,
    isOnline: Boolean,
    pendingOutboxCount: Int,
    isSubmitting: Boolean,
    activeThread: TaskMessagesResponse?,
    isLoadingThread: Boolean,
    onRefresh: () -> Unit,
    onSyncOutbox: () -> Unit,
    onOpenOrder: (String) -> Unit,
    onMarkTaskDone: (code: String, note: String) -> Unit,
    onOpenThread: (code: String) -> Unit,
    onCloseThread: () -> Unit,
    onSendThreadMessage: (code: String, text: String) -> Unit,
    onRequestCancel: (code: String, reason: String) -> Unit,
    onMakePickupBill: (code: String) -> Unit = {},
    modifier: Modifier = Modifier
) {
    var doneDialogTask by remember { mutableStateOf<TaskDto?>(null) }
    var doneNote by remember { mutableStateOf("") }
    var cancelDialogTask by remember { mutableStateOf<TaskDto?>(null) }
    var cancelReason by remember { mutableStateOf("") }
    var urgentOnly by rememberSaveable { mutableStateOf(false) }

    val displayed = remember(tasks, urgentOnly) {
        if (urgentOnly) tasks.filter { it.urgent } else tasks
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = modifier
            .fillMaxSize()
            .testTag("my_tasks_screen")
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
                        text = "My Tasks",
                        style = MaterialTheme.typography.headlineSmall,
                        color = InkPrimary,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "${displayed.size} open task(s) assigned to you",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted
                    )
                }
                IconButton(
                    onClick = onRefresh,
                    modifier = Modifier.testTag("tasks_refresh_button")
                ) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "Refresh tasks", tint = BrandBlue)
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = !urgentOnly,
                    onClick = { urgentOnly = false },
                    label = { Text("All (${tasks.size})") },
                    modifier = Modifier.testTag("tasks_filter_all")
                )
                FilterChip(
                    selected = urgentOnly,
                    onClick = { urgentOnly = true },
                    label = { Text("Urgent (${tasks.count { it.urgent }})") },
                    modifier = Modifier.testTag("tasks_filter_urgent")
                )
            }
        }

        if (displayed.isEmpty()) {
            item {
                EmptyStateCard(
                    icon = Icons.Outlined.TaskAlt,
                    title = "No Pending Tasks",
                    subtitle = "All assigned tasks are completed. Check back later or pull refresh."
                )
            }
        } else {
            items(displayed, key = { it.code.ifBlank { it.title } }) { task ->
                TaskCard(
                    me = me,
                    task = task,
                    isOnline = isOnline,
                    isSubmitting = isSubmitting,
                    onOpenOrder = { orderNum -> onOpenOrder(orderNum) },
                    onMarkDone = {
                        doneDialogTask = task
                        doneNote = ""
                    },
                    onAskOwner = { onOpenThread(task.code) },
                    onRequestCancel = {
                        cancelDialogTask = task
                        cancelReason = ""
                    },
                    onMakePickupBill = { onMakePickupBill(task.code) }
                )
            }
        }
    }

    // Mark Task Done Dialog
    doneDialogTask?.let { task ->
        AlertDialog(
            onDismissRequest = { doneDialogTask = null },
            title = { Text("Complete Task", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(task.title, style = MaterialTheme.typography.bodyMedium, color = InkPrimary)
                    OutlinedTextField(
                        value = doneNote,
                        onValueChange = { doneNote = it.take(160) },
                        label = { Text("Completion Note (optional)") },
                        placeholder = { Text("e.g., Completed and checked") },
                        singleLine = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("task_done_note_input")
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val code = task.code
                        val note = doneNote
                        doneDialogTask = null
                        onMarkTaskDone(code, note)
                    },
                    enabled = isOnline && !isSubmitting,
                    modifier = Modifier.testTag("task_done_confirm_button")
                ) {
                    Text("Mark Done")
                }
            },
            dismissButton = {
                TextButton(onClick = { doneDialogTask = null }) { Text("Cancel") }
            }
        )
    }

    // Request Cancel Dialog
    cancelDialogTask?.let { task ->
        AlertDialog(
            onDismissRequest = { cancelDialogTask = null },
            title = { Text("Request Task Cancellation", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Your shop owner will review and approve or decline this cancellation request.",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted
                    )
                    OutlinedTextField(
                        value = cancelReason,
                        onValueChange = { cancelReason = it.take(180) },
                        label = { Text("Reason (required)") },
                        placeholder = { Text("e.g., Customer rescheduled to tomorrow") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("task_cancel_reason_input")
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val code = task.code
                        val reason = cancelReason
                        cancelDialogTask = null
                        onRequestCancel(code, reason)
                    },
                    enabled = isOnline && cancelReason.trim().length >= 3 && !isSubmitting,
                    colors = ButtonDefaults.buttonColors(containerColor = StatusError),
                    modifier = Modifier.testTag("task_cancel_confirm_button")
                ) {
                    Text("Send Request")
                }
            },
            dismissButton = {
                TextButton(onClick = { cancelDialogTask = null }) { Text("Cancel") }
            }
        )
    }

    // Ask Owner Thread Dialog
    if (activeThread != null || isLoadingThread) {
        TaskMessageThreadDialog(
            thread = activeThread,
            isLoading = isLoadingThread,
            isSubmitting = isSubmitting,
            onDismiss = onCloseThread,
            onSend = { text ->
                activeThread?.code?.let { onSendThreadMessage(it, text) }
            }
        )
    }
}

@Composable
private fun TaskCard(
    me: StaffMeDto,
    task: TaskDto,
    isOnline: Boolean,
    isSubmitting: Boolean,
    onOpenOrder: (String) -> Unit,
    onMarkDone: () -> Unit,
    onAskOwner: () -> Unit,
    onRequestCancel: () -> Unit,
    onMakePickupBill: () -> Unit
) {
    Surface(
        color = SurfaceWhite,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(
            width = if (task.urgent) 1.5.dp else 1.dp,
            color = if (task.urgent) StatusError.copy(alpha = 0.5f) else BorderLight
        ),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("task_card_${task.code}")
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
                    StatusPill(
                        text = task.kind.replaceFirstChar { it.uppercase() },
                        fg = BrandInk,
                        bg = BrandSoft
                    )
                    if (task.urgent) UrgentBadge()
                }
                if (!task.etaText.isNullOrBlank()) {
                    Text(
                        text = task.etaText,
                        style = MaterialTheme.typography.labelSmall,
                        color = InkMuted
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = task.title,
                style = MaterialTheme.typography.titleMedium,
                color = InkPrimary,
                fontWeight = FontWeight.SemiBold
            )

            if (!task.order.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Order: ${task.order}" +
                        if (!task.customer.isNullOrBlank()) " · ${task.customer}" else "",
                    style = MaterialTheme.typography.bodySmall,
                    color = BrandBlue,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable { onOpenOrder(task.order) }
                )
            }

            if (me.allowCustomerCall && !task.address.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(3.dp))
                Text(
                    text = task.address,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted
                )
            }

            if (!task.reply.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = BrandSoft,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Owner reply: ${task.reply}",
                        style = MaterialTheme.typography.bodySmall,
                        color = BrandInk,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }

            if (task.cancelRequested) {
                Spacer(modifier = Modifier.height(8.dp))
                StatusPill(
                    text = "Cancel Requested${task.cancelReason?.let { ": $it" } ?: ""}",
                    fg = StatusWarning,
                    bg = StatusWarningSoft
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (me.canCreateBill && task.kind.equals("pickup", ignoreCase = true) && task.order.isNullOrBlank()) {
                Button(
                    onClick = onMakePickupBill,
                    enabled = isOnline && !isSubmitting,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("task_make_bill_btn_${task.code}")
                ) {
                    Text("Make Pickup Bill", fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.height(8.dp))
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Button(
                    onClick = onMarkDone,
                    enabled = isOnline && !isSubmitting,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = StatusSuccess),
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .testTag("task_done_btn_${task.code}")
                ) {
                    Icon(Icons.Outlined.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Done", fontWeight = FontWeight.Bold)
                }

                OutlinedButton(
                    onClick = onAskOwner,
                    enabled = isOnline,
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    modifier = Modifier
                        .height(48.dp)
                        .testTag("task_ask_btn_${task.code}")
                ) {
                    Icon(Icons.AutoMirrored.Outlined.Chat, contentDescription = "Ask owner", modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Ask")
                }

                if (me.allowCancelApprovalRequest && !task.cancelRequested) {
                    OutlinedButton(
                        onClick = onRequestCancel,
                        enabled = isOnline,
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp),
                        modifier = Modifier
                            .height(48.dp)
                            .testTag("task_cancel_btn_${task.code}")
                    ) {
                        Icon(Icons.Outlined.Block, contentDescription = "Request cancel", modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun TaskMessageThreadDialog(
    thread: TaskMessagesResponse?,
    isLoading: Boolean,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onSend: (String) -> Unit
) {
    var draft by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = thread?.title?.ifBlank { "Ask Shop Owner" } ?: "Ask Shop Owner",
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (isLoading && thread == null) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(100.dp)
                    ) {
                        CircularProgressIndicator(color = BrandBlue)
                    }
                } else {
                    val messages = thread?.messages.orEmpty()
                    if (messages.isEmpty()) {
                        Text(
                            text = "No messages yet. Send a quick question to your shop owner or manager.",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted
                        )
                    } else {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 220.dp)
                        ) {
                            items(messages) { msg ->
                                val bg = if (msg.mine) BrandSoft else PageCanvas
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(bg)
                                        .padding(10.dp)
                                ) {
                                    Column {
                                        Text(
                                            text = "${msg.who} · ${msg.at}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = InkMuted
                                        )
                                        Spacer(modifier = Modifier.height(2.dp))
                                        Text(
                                            text = msg.text,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = InkPrimary
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        OutlinedTextField(
                            value = draft,
                            onValueChange = { draft = it.take(240) },
                            placeholder = { Text("Type message…") },
                            singleLine = true,
                            modifier = Modifier
                                .weight(1f)
                                .testTag("task_thread_message_input")
                        )
                        IconButton(
                            onClick = {
                                if (draft.isNotBlank()) {
                                    onSend(draft)
                                    draft = ""
                                }
                            },
                            enabled = draft.isNotBlank() && !isSubmitting,
                            modifier = Modifier.testTag("task_thread_send_button")
                        ) {
                            Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = "Send", tint = BrandBlue)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}

/** Screen 10: Task & Work History (Completed orders & tasks) */
@Composable
fun HistoryScreen(
    me: StaffMeDto,
    completedOrders: List<RouteStopDto>,
    completedTasks: List<TaskDto>,
    isRefreshing: Boolean,
    onLoadHistory: () -> Unit,
    onOpenOrder: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var tab by rememberSaveable { mutableStateOf("ORDERS") }

    LaunchedEffect(Unit) {
        onLoadHistory()
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = modifier
            .fillMaxSize()
            .testTag("history_screen")
    ) {
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Work History",
                        style = MaterialTheme.typography.headlineSmall,
                        color = InkPrimary,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Completed work synced from Kwik Klin backend",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted
                    )
                }
                IconButton(
                    onClick = onLoadHistory,
                    enabled = !isRefreshing,
                    modifier = Modifier.testTag("history_refresh_button")
                ) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "Refresh history", tint = BrandBlue)
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = tab == "ORDERS",
                    onClick = { tab = "ORDERS" },
                    label = { Text("Completed Orders (${completedOrders.size})") },
                    modifier = Modifier.testTag("history_tab_orders")
                )
                FilterChip(
                    selected = tab == "TASKS",
                    onClick = { tab = "TASKS" },
                    label = { Text("Completed Tasks (${completedTasks.size})") },
                    modifier = Modifier.testTag("history_tab_tasks")
                )
            }
        }

        if (tab == "ORDERS") {
            if (completedOrders.isEmpty()) {
                item {
                    EmptyStateCard(
                        icon = Icons.Outlined.History,
                        title = "No Completed Orders Yet",
                        subtitle = "Orders you complete will appear here automatically."
                    )
                }
            } else {
                items(completedOrders, key = { "done_${it.number}_${it.doneAt}" }) { stop ->
                    val (fg, bg) = stageColors(stop.stage)
                    Surface(
                        color = SurfaceWhite,
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(1.dp, BorderLight),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenOrder(stop.number) }
                            .testTag("history_order_${stop.number}")
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = stop.number,
                                    style = MaterialTheme.typography.titleSmall,
                                    color = InkPrimary,
                                    fontWeight = FontWeight.Bold
                                )
                                StatusPill(text = stop.stage.label, fg = fg, bg = bg)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = listOf(stop.customer, stop.items)
                                    .filter { it.isNotBlank() }
                                    .joinToString(" · "),
                                style = MaterialTheme.typography.bodyMedium,
                                color = InkPrimary
                            )
                            if (stop.doneAt.isNotBlank()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "Completed: ${stop.doneAt}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = StatusSuccess
                                )
                            }
                        }
                    }
                }
            }
        } else {
            if (completedTasks.isEmpty()) {
                item {
                    EmptyStateCard(
                        icon = Icons.Outlined.CheckCircle,
                        title = "No Completed Tasks Yet",
                        subtitle = "Finished staff tasks will be listed here."
                    )
                }
            } else {
                items(completedTasks, key = { "done_task_${it.code}_${it.title}" }) { task ->
                    Surface(
                        color = SurfaceWhite,
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(1.dp, BorderLight),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = task.title,
                                    style = MaterialTheme.typography.titleSmall,
                                    color = InkPrimary,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.weight(1f)
                                )
                                StatusPill(text = "Done", fg = StatusSuccess, bg = StatusSuccessSoft)
                            }
                            if (!task.order.isNullOrBlank()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "Order ${task.order}" +
                                        if (me.allowCustomerCall && !task.customer.isNullOrBlank()) " · ${task.customer}" else "",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = InkMuted
                                )
                            }
                            if (!task.doneAt.isNullOrBlank()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "Done at ${task.doneAt}",
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
