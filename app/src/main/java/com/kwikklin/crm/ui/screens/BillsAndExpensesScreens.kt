package com.kwikklin.crm.ui.screens

import com.kwikklin.crm.ui.components.withUniqueKeys
import com.kwikklin.crm.ui.components.formatIsoDateShort
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.kwikklin.crm.data.network.BillListItemDto
import com.kwikklin.crm.data.network.ExpensesResponse
import com.kwikklin.crm.data.network.OrderReceiptDto
import com.kwikklin.crm.data.network.OrderStage
import com.kwikklin.crm.data.network.StaffMeDto
import com.kwikklin.crm.ui.components.EmptyStateCard
import com.kwikklin.crm.ui.components.KwikSearchField
import com.kwikklin.crm.ui.components.StatusPill
import com.kwikklin.crm.ui.components.formatRupees
import com.kwikklin.crm.ui.components.openExternalUrl
import kotlinx.coroutines.delay
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

/**
 * Full Web-Parity Bills Register Screen (GET /staff/api/bills).
 * Matches web app: Search + All/Unpaid/Paid/Mine chips + 4-stage strip + WhatsApp Receipt + Collect Due.
 */
@Composable
fun BillsScreen(
    me: StaffMeDto,
    bills: List<BillListItemDto>,
    billsTotal: Int,
    isLoading: Boolean,
    isOnline: Boolean,
    onLoadBills: (query: String, payFilter: String, mineOnly: Boolean, reset: Boolean) -> Unit,
    onOpenOrder: (String) -> Unit,
    onOpenReceipt: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var search by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("all") } // all, due, paid, mine

    val reload: () -> Unit = {
        onLoadBills(
            search.trim(),
            if (filter == "due" || filter == "paid") filter else "all",
            filter == "mine",
            true
        )
    }

    // Filter changes reload at once; typing reloads after a short pause (no "Go" button needed).
    LaunchedEffect(filter) { reload() }
    var lastSearched by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(search) {
        if (search.trim() == lastSearched) return@LaunchedEffect
        delay(450)
        lastSearched = search.trim()
        reload()
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = modifier
            .fillMaxSize()
            .testTag("bills_screen")
    ) {
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Bills",
                        style = MaterialTheme.typography.headlineSmall,
                        color = InkPrimary,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "$billsTotal bill(s) synced live",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted
                    )
                }
                IconButton(
                    onClick = reload,
                    modifier = Modifier.testTag("bills_refresh_button")
                ) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "Refresh bills", tint = BrandBlue)
                }
            }
        }

        item {
            KwikSearchField(
                value = search,
                onValueChange = { search = it },
                placeholder = "Search bill # or customer",
                testTag = "bills_search_input",
                onSearch = {
                    lastSearched = search.trim()
                    reload()
                }
            )
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = filter == "all",
                    onClick = { filter = "all" },
                    label = { Text("All") }
                )
                FilterChip(
                    selected = filter == "due",
                    onClick = { filter = "due" },
                    label = { Text("Unpaid") }
                )
                FilterChip(
                    selected = filter == "paid",
                    onClick = { filter = "paid" },
                    label = { Text("Paid") }
                )
                if (me.isManager) {
                    FilterChip(
                        selected = filter == "mine",
                        onClick = { filter = "mine" },
                        label = { Text("Mine") }
                    )
                }
            }
        }

        if (isLoading && bills.isEmpty()) {
            item {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp)
                ) {
                    CircularProgressIndicator(color = BrandBlue)
                }
            }
        } else if (bills.isEmpty()) {
            item {
                EmptyStateCard(
                    icon = Icons.AutoMirrored.Outlined.ReceiptLong,
                    title = "No Bills Found",
                    subtitle = "Bills you create will appear here with payment & delivery status."
                )
            }
        } else {
            items(bills.withUniqueKeys { it.number }, key = { it.first }) { (_, bill) ->
                BillRegisterCard(
                    me = me,
                    bill = bill,
                    isOnline = isOnline,
                    onOpenDetail = { onOpenOrder(bill.number) },
                    onShareReceipt = { onOpenReceipt(bill.number) }
                )
            }

            if (bills.size < billsTotal) {
                item {
                    OutlinedButton(
                        onClick = {
                            onLoadBills(
                                search,
                                if (filter == "due" || filter == "paid") filter else "all",
                                filter == "mine",
                                false
                            )
                        },
                        enabled = !isLoading,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                    ) {
                        Text(if (isLoading) "Loading…" else "Show More (${bills.size} of $billsTotal)")
                    }
                }
            }
        }
    }
}

@Composable
private fun BillRegisterCard(
    me: StaffMeDto,
    bill: BillListItemDto,
    isOnline: Boolean,
    onOpenDetail: () -> Unit,
    onShareReceipt: () -> Unit
) {
    val isPaid = bill.due <= 0.0
    val accent = if (isPaid) StatusSuccess else BrandBlue

    Surface(
        color = SurfaceWhite,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, BorderLight),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpenDetail)
            .testTag("bill_card_${bill.number}")
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    Text(
                        text = bill.number,
                        style = MaterialTheme.typography.titleMedium,
                        color = InkPrimary,
                        fontWeight = FontWeight.Bold
                    )
                    if (bill.created.isNotBlank()) {
                        Text(
                            text = bill.created,
                            style = MaterialTheme.typography.labelSmall,
                            color = InkMuted
                        )
                    }
                }
                StatusPill(
                    text = if (isPaid) "Paid" else "${formatRupees(bill.due)} due",
                    fg = if (isPaid) StatusSuccess else StatusWarning,
                    bg = if (isPaid) StatusSuccessSoft else StatusWarningSoft
                )
            }

            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = bill.customer.ifBlank { "Customer" },
                style = MaterialTheme.typography.bodyLarge,
                color = InkPrimary,
                fontWeight = FontWeight.SemiBold
            )
            if (bill.items.isNotBlank()) {
                Text(
                    text = bill.items,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // 4-step progress strip matching Web app (Received -> Washing -> Ready -> Delivered)
            val stepIdx = when (bill.stage) {
                OrderStage.RECEIVED, OrderStage.PICKUP_ASSIGNED, OrderStage.PICKED_UP -> 0
                OrderStage.IN_WASH, OrderStage.IN_DRY, OrderStage.IN_IRON -> 1
                OrderStage.READY, OrderStage.OUT_FOR_DELIVERY -> 2
                OrderStage.DELIVERED -> 3
                else -> -1
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                listOf("Received", "Washing", "Ready", "Delivered").forEachIndexed { idx, label ->
                    val done = stepIdx >= 0 && (idx < stepIdx || bill.stage == OrderStage.DELIVERED)
                    val cur = idx == stepIdx && bill.stage != OrderStage.DELIVERED
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(
                                when {
                                    done -> StatusSuccessSoft
                                    cur -> BrandSoft
                                    else -> PageCanvas
                                }
                            )
                            .padding(vertical = 4.dp)
                    ) {
                        Text(
                            text = label,
                            style = MaterialTheme.typography.labelSmall,
                            color = when {
                                done -> StatusSuccess
                                cur -> accent
                                else -> InkMuted
                            },
                            fontWeight = if (cur || done) FontWeight.Bold else FontWeight.Normal,
                            maxLines = 1
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                OutlinedButton(
                    onClick = onShareReceipt,
                    enabled = isOnline,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .weight(1f)
                        .height(44.dp)
                        .testTag("bill_share_${bill.number}")
                ) {
                    Icon(Icons.AutoMirrored.Outlined.Chat, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Send Bill")
                }

                if (me.hasFeature("cod_collection") && !isPaid) {
                    Button(
                        onClick = onOpenDetail,
                        enabled = isOnline,
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = StatusSuccess),
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp)
                            .testTag("bill_collect_${bill.number}")
                    ) {
                        Icon(Icons.Outlined.AccountBalanceWallet, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Collect ${formatRupees(bill.due)}", maxLines = 1)
                    }
                }
            }
        }
    }
}

/** Web-Parity Receipt Share Modal (WhatsApp wa.me + Copy + Android Share Sheet) */
@Composable
fun ReceiptShareDialog(
    receipt: OrderReceiptDto,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Send Bill · ${receipt.number}", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "Share directly on WhatsApp or copy the bill text for ${receipt.name.ifBlank { "customer" }}.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted
                )
                Surface(
                    color = PageCanvas,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 220.dp)
                ) {
                    Text(
                        text = receipt.text,
                        style = MaterialTheme.typography.bodySmall,
                        color = InkPrimary,
                        modifier = Modifier
                            .verticalScroll(rememberScrollState())
                            .padding(12.dp)
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(
                        onClick = {
                            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                            cm?.setPrimaryClip(ClipData.newPlainText("Kwik Klin Bill", receipt.text))
                            Toast.makeText(context, "Bill copied", Toast.LENGTH_SHORT).show()
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Outlined.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Copy")
                    }
                    OutlinedButton(
                        onClick = {
                            val share = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_TEXT, receipt.text)
                            }
                            runCatching { context.startActivity(Intent.createChooser(share, "Share Kwik Klin Bill")) }
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Outlined.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Share")
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val digits = receipt.phone.filter { it.isDigit() }.trimStart('0')
                    val waNum = if (digits.length == 10) "91$digits" else digits
                    val waUrl = if (waNum.isNotBlank()) {
                        "https://wa.me/$waNum?text=${Uri.encode(receipt.text)}"
                    } else {
                        "https://wa.me/?text=${Uri.encode(receipt.text)}"
                    }
                    openExternalUrl(context, waUrl)
                    onDismiss()
                },
                colors = ButtonDefaults.buttonColors(containerColor = StatusSuccess),
                modifier = Modifier.testTag("receipt_whatsapp_button")
            ) {
                Text("Open WhatsApp")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}

/** Web-Parity Staff Expenses Screen (GET/POST /staff/api/expenses) */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ExpensesScreen(
    expenses: ExpensesResponse?,
    isLoading: Boolean,
    isOnline: Boolean,
    isSubmitting: Boolean,
    onBack: () -> Unit,
    onLoadExpenses: () -> Unit,
    onSaveExpense: (category: String, amount: Double, description: String) -> Unit,
    modifier: Modifier = Modifier
) {
    BackHandler(onBack = onBack)
    LaunchedEffect(Unit) { onLoadExpenses() }

    var selectedCategory by rememberSaveable { mutableStateOf("") }
    var amountText by rememberSaveable { mutableStateOf("") }
    var desc by rememberSaveable { mutableStateOf("") }
    var err by rememberSaveable { mutableStateOf<String?>(null) }

    Scaffold(
        containerColor = PageCanvas,
        topBar = {
            TopAppBar(
                title = { Text("Shop Expenses", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = SurfaceWhite)
            )
        },
        modifier = modifier.testTag("expenses_screen")
    ) { innerPadding ->
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
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
                            text = "Add Expense",
                            style = MaterialTheme.typography.titleMedium,
                            color = InkPrimary,
                            fontWeight = FontWeight.Bold
                        )
                        // The shop defines the categories; only fall back to free text if it sent none.
                        val serverCats = expenses?.categories.orEmpty()
                        Text("Category", style = MaterialTheme.typography.labelLarge, color = InkMuted)
                        if (serverCats.isNotEmpty()) {
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(0.dp)
                            ) {
                                serverCats.forEach { c ->
                                    FilterChip(
                                        selected = selectedCategory == c,
                                        onClick = { selectedCategory = c; err = null },
                                        label = { Text(c, maxLines = 1) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = BrandSoft,
                                            selectedLabelColor = BrandInk
                                        )
                                    )
                                }
                            }
                        } else {
                            OutlinedTextField(
                                value = selectedCategory,
                                onValueChange = { selectedCategory = it; err = null },
                                placeholder = { Text("e.g. Fuel, Detergent") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                        OutlinedTextField(
                            value = amountText,
                            onValueChange = { amountText = it; err = null },
                            label = { Text("Amount (₹)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = desc,
                            onValueChange = { desc = it.take(200) },
                            label = { Text("Description (optional)") },
                            placeholder = { Text("e.g., Petrol for evening deliveries") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        if (!err.isNullOrBlank()) {
                            Text(err!!, color = StatusError, style = MaterialTheme.typography.labelMedium)
                        } else if (!isOnline) {
                            Text(
                                "You're offline — expenses can only be saved with internet.",
                                color = StatusWarning,
                                style = MaterialTheme.typography.labelMedium
                            )
                        }
                        Button(
                            onClick = {
                                val amt = amountText.toDoubleOrNull()
                                when {
                                    selectedCategory.isBlank() -> err = "Pick a category."
                                    amt == null || amt <= 0.0 -> err = "Enter a valid amount."
                                    else -> {
                                        onSaveExpense(selectedCategory.trim(), amt, desc.trim())
                                        amountText = ""
                                        desc = ""
                                    }
                                }
                            },
                            enabled = isOnline && !isSubmitting,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                        ) {
                            Text(if (isSubmitting) "Saving…" else "Save Expense", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            if (expenses != null) {
                item {
                    Text(
                        text = "My Expenses (${expenses.month.ifBlank { "This Month" }}) · ${formatRupees(expenses.total)}",
                        style = MaterialTheme.typography.titleSmall,
                        color = InkPrimary,
                        fontWeight = FontWeight.Bold
                    )
                }
                if (expenses.expenses.isEmpty()) {
                    item {
                        Text(
                            "No expenses logged this month yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = InkMuted
                        )
                    }
                }
                items(expenses.expenses) { exp ->
                    Surface(
                        color = SurfaceWhite,
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(1.dp, BorderLight),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(14.dp)
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(exp.category, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Text(
                                    text = listOf(formatIsoDateShort(exp.spentOn), exp.description)
                                        .filter { it.isNotBlank() }
                                        .joinToString(" · "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = InkMuted
                                )
                            }
                            Text(
                                text = formatRupees(exp.amount),
                                style = MaterialTheme.typography.titleSmall,
                                color = BrandInk,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            } else if (isLoading) {
                item {
                    Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxWidth().padding(20.dp)) {
                        CircularProgressIndicator(color = BrandBlue)
                    }
                }
            }
        }
    }
}
