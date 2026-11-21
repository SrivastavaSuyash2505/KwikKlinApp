package com.kwikklin.crm.ui.screens

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.kwikklin.crm.data.network.BillLineItemRequest
import com.kwikklin.crm.data.network.CreateBillRequest
import com.kwikklin.crm.data.network.CustomerRewardDto
import com.kwikklin.crm.data.network.CustomerSearchHitDto
import com.kwikklin.crm.data.network.PickupBillContextDto
import com.kwikklin.crm.data.network.RateCardItemDto
import com.kwikklin.crm.data.network.StaffMeDto
import com.kwikklin.crm.data.network.UsualItemDto
import com.kwikklin.crm.ui.components.EmptyStateCard
import com.kwikklin.crm.ui.components.KwikSearchField
import com.kwikklin.crm.ui.components.formatRupees
import com.kwikklin.crm.ui.theme.BorderLight
import com.kwikklin.crm.ui.theme.BrandBlue
import com.kwikklin.crm.ui.theme.BrandInk
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
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private data class CartLine(
    val service: String,
    val garment: String,
    val qty: Double,
    val rate: Double,
    val cardRate: Double,
    val unit: String
)

/**
 * Full Web-Parity 3-Step New Bill Wizard (POST /staff/api/bills).
 * Available to Delivery Boy, Manager, Admin, and Solo Owner whenever
 * ME.can_bill && ME.features.includes("billing").
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NewBillScreen(
    me: StaffMeDto,
    rates: List<RateCardItemDto>,
    isLoadingRates: Boolean,
    customerSearchHits: List<CustomerSearchHitDto>,
    customerRewards: List<CustomerRewardDto>,
    customerUsualItems: List<UsualItemDto>,
    pickupContext: PickupBillContextDto?,
    isOnline: Boolean,
    isSubmitting: Boolean,
    onLoadRates: () -> Unit,
    onSearchCustomers: (String) -> Unit,
    onClearCustomerSearch: () -> Unit,
    onSelectCustomerRef: (String) -> Unit,
    onClearPickupContext: () -> Unit,
    onSubmitBill: (CreateBillRequest) -> Unit,
    modifier: Modifier = Modifier
) {
    LaunchedEffect(Unit) { onLoadRates() }

    var step by rememberSaveable { mutableIntStateOf(if (pickupContext != null) 2 else 1) }

    // Step 1: Customer + Fulfilment + Urgent
    var searchOrName by rememberSaveable { mutableStateOf("") }
    var newPhone by rememberSaveable { mutableStateOf("") }
    var pickedCustomer by remember { mutableStateOf<CustomerSearchHitDto?>(null) }
    var fulfilment by rememberSaveable { mutableStateOf(if (pickupContext != null) "pickup" else "walkin") }
    var isUrgent by rememberSaveable { mutableStateOf(false) }

    // Step 2: Garments / Rate Card Cart
    var selectedService by rememberSaveable { mutableStateOf("ALL") }
    var itemSearch by rememberSaveable { mutableStateOf("") }
    val cart = remember { mutableStateListOf<CartLine>() }

    // Step 3: Payment, Discount, Charges, Notes
    var discountMode by rememberSaveable { mutableStateOf("amt") } // "amt" or "pct"
    var discountInput by rememberSaveable { mutableStateOf("") }
    var deliveryChargeInput by rememberSaveable { mutableStateOf("") }
    var gstPercent by rememberSaveable {
        mutableDoubleStateOf(if (me.bill?.gstDefaultOn == true) me.bill.gstPercent else 0.0)
    }
    var advanceInput by rememberSaveable { mutableStateOf("") }
    var paymentMethod by rememberSaveable { mutableStateOf("CASH") } // CASH, UPI, SPLIT
    var splitUpiInput by rememberSaveable { mutableStateOf("") }
    var selectedRewardCode by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }

    // Apply Pickup Task Context when opened from a Pickup Task
    LaunchedEffect(pickupContext) {
        if (pickupContext != null) {
            pickedCustomer = CustomerSearchHitDto(
                ref = pickupContext.customerRef,
                name = pickupContext.customerName,
                phoneMasked = pickupContext.phoneMasked,
                due = pickupContext.due
            )
            searchOrName = pickupContext.customerName
            fulfilment = "pickup"
            step = 2
        }
    }

    // Exact Kwik Klin billMath (matches app/static/staff.js:3444)
    val gross = cart.sumOf { it.qty * it.rate }
    val discVal = discountInput.toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0
    val discountAmt = min(
        if (discountMode == "pct") (gross * discVal / 100.0) else discVal,
        gross
    )
    val urgentCfg = me.urgent
    val urgentAmt = if (isUrgent) {
        val uVal = urgentCfg?.value ?: 50.0
        val raw = if (urgentCfg?.type == "flat") uVal else (gross * uVal / 100.0)
        max(0.0, raw.roundToInt().toDouble())
    } else 0.0
    val deliveryCharge = deliveryChargeInput.toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0
    val taxableBase = max(0.0, gross - discountAmt + urgentAmt + deliveryCharge)
    val gstAmt = (taxableBase * gstPercent / 100.0 * 100.0).roundToInt() / 100.0
    val netTotal = ((taxableBase + gstAmt) * 100.0).roundToInt() / 100.0
    val advanceAmt = min(advanceInput.toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0, netTotal)
    val balanceDue = max(0.0, netTotal - advanceAmt)
    val prevDue = pickedCustomer?.due ?: 0.0

    val services = remember(rates) { listOf("ALL") + rates.map { it.service }.distinct() }
    val filteredRates = remember(rates, selectedService, itemSearch) {
        rates.filter { r ->
            val svcOk = selectedService == "ALL" || r.service == selectedService
            val q = itemSearch.trim().lowercase()
            val qOk = q.isEmpty() || r.garment.lowercase().contains(q) || r.service.lowercase().contains(q)
            svcOk && qOk
        }
    }

    fun addOrIncrementRate(rate: RateCardItemDto) {
        val idx = cart.indexOfFirst { it.service == rate.service && it.garment == rate.garment }
        if (idx >= 0) {
            val cur = cart[idx]
            val delta = if (cur.unit == "kg") 0.5 else 1.0
            cart[idx] = cur.copy(qty = cur.qty + delta)
        } else {
            cart.add(
                CartLine(
                    service = rate.service,
                    garment = rate.garment,
                    qty = 1.0,
                    rate = rate.rate,
                    cardRate = rate.rate,
                    unit = rate.unit.ifBlank { "pc" }
                )
            )
        }
        validationError = null
    }

    if (!me.canCreateBill) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = modifier
                .fillMaxSize()
                .padding(20.dp)
        ) {
            EmptyStateCard(
                icon = Icons.AutoMirrored.Outlined.ReceiptLong,
                title = "Billing Not Enabled",
                subtitle = "Your role or shop plan does not include bill creation."
            )
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .testTag("new_bill_screen")
    ) {
        // Top Stepper Bar matching Web Bill Wizard (1. Customer · 2. Clothes · 3. Payment)
        Surface(color = SurfaceWhite, tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "New Bill",
                        style = MaterialTheme.typography.titleLarge,
                        color = InkPrimary,
                        fontWeight = FontWeight.Bold
                    )
                    if (cart.isNotEmpty()) {
                        Text(
                            text = "${cart.size} item(s) · ${formatRupees(netTotal)}",
                            style = MaterialTheme.typography.labelLarge,
                            color = BrandBlue,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    StepPill(1, "Customer", step == 1, step > 1, Modifier.weight(1f)) { step = 1 }
                    StepPill(2, "Clothes (${cart.size})", step == 2, step > 2, Modifier.weight(1f)) { step = 2 }
                    StepPill(3, "Payment", step == 3, false, Modifier.weight(1f)) { step = 3 }
                }
            }
        }

        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.weight(1f)
        ) {
            if (pickupContext != null) {
                item {
                    Surface(
                        color = BrandSoft,
                        border = BorderStroke(1.dp, BrandBlue.copy(alpha = 0.35f)),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(12.dp)
                        ) {
                            Icon(Icons.Outlined.LocalShipping, contentDescription = null, tint = BrandBlue)
                            Spacer(modifier = Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Pickup Task Bill · ${pickupContext.customerName}",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = BrandInk,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Creating this bill automatically completes the pickup task.",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = InkMuted
                                )
                            }
                            IconButton(onClick = {
                                onClearPickupContext()
                                pickedCustomer = null
                                searchOrName = ""
                            }) {
                                Icon(Icons.Outlined.Close, contentDescription = "Clear pickup link", tint = InkMuted)
                            }
                        }
                    }
                }
            }

            if (!validationError.isNullOrBlank()) {
                item {
                    Surface(
                        color = StatusErrorSoft,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = validationError!!,
                            color = StatusError,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }

            // ─── STEP 1: CUSTOMER & FULFILMENT ──────────────────────────────
            if (step == 1) {
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
                                text = "1. Customer Details",
                                style = MaterialTheme.typography.titleMedium,
                                color = InkPrimary,
                                fontWeight = FontWeight.Bold
                            )

                            if (pickedCustomer != null) {
                                val c = pickedCustomer!!
                                Surface(
                                    color = if (c.due > 0) StatusWarningSoft else BrandSoft,
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(12.dp)
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = c.name.ifBlank { "Customer" },
                                                style = MaterialTheme.typography.titleSmall,
                                                color = InkPrimary,
                                                fontWeight = FontWeight.Bold
                                            )
                                            Text(
                                                text = "${c.phoneMasked} · ${c.orderCount} previous order(s)",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = InkMuted
                                            )
                                            if (c.due > 0) {
                                                Text(
                                                    text = "Previous due: ${formatRupees(c.due)}",
                                                    style = MaterialTheme.typography.labelMedium,
                                                    color = StatusWarning,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }
                                        }
                                        TextButton(
                                            onClick = {
                                                pickedCustomer = null
                                                searchOrName = ""
                                                selectedRewardCode = ""
                                                onClearCustomerSearch()
                                            },
                                            modifier = Modifier.testTag("bill_change_customer_btn")
                                        ) {
                                            Text("Change")
                                        }
                                    }
                                }
                            } else {
                                OutlinedTextField(
                                    value = searchOrName,
                                    onValueChange = {
                                        searchOrName = it
                                        onSearchCustomers(it)
                                        validationError = null
                                    },
                                    label = { Text("Search Existing Customer or Enter Name") },
                                    placeholder = { Text("Name or mobile number") },
                                    singleLine = true,
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("bill_customer_search_input")
                                )

                                if (customerSearchHits.isNotEmpty()) {
                                    Column(
                                        verticalArrangement = Arrangement.spacedBy(6.dp),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        customerSearchHits.take(5).forEach { hit ->
                                            Surface(
                                                color = BrandSoft.copy(alpha = 0.6f),
                                                shape = RoundedCornerShape(12.dp),
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .clickable {
                                                        pickedCustomer = hit
                                                        searchOrName = hit.name
                                                        newPhone = ""
                                                        onSelectCustomerRef(hit.ref)
                                                        validationError = null
                                                    }
                                            ) {
                                                Row(
                                                    horizontalArrangement = Arrangement.SpaceBetween,
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    modifier = Modifier.padding(12.dp)
                                                ) {
                                                    Column {
                                                        Text(
                                                            text = hit.name.ifBlank { "Customer" },
                                                            style = MaterialTheme.typography.titleSmall,
                                                            fontWeight = FontWeight.SemiBold
                                                        )
                                                        Text(
                                                            text = hit.phoneMasked,
                                                            style = MaterialTheme.typography.labelSmall,
                                                            color = InkMuted
                                                        )
                                                    }
                                                    if (hit.due > 0) {
                                                        Text(
                                                            text = "${formatRupees(hit.due)} due",
                                                            style = MaterialTheme.typography.labelMedium,
                                                            color = StatusWarning,
                                                            fontWeight = FontWeight.Bold
                                                        )
                                                    } else {
                                                        Text(
                                                            text = "${hit.orderCount} orders",
                                                            style = MaterialTheme.typography.labelSmall,
                                                            color = InkMuted
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                OutlinedTextField(
                                    value = newPhone,
                                    onValueChange = { newPhone = it.filter { ch -> ch.isDigit() }.take(10); validationError = null },
                                    label = { Text("New Customer Mobile (10 digits)") },
                                    placeholder = { Text("98xxxxxxxx") },
                                    leadingIcon = { Icon(Icons.Outlined.PersonAdd, contentDescription = null, tint = InkMuted) },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                    singleLine = true,
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("bill_new_phone_input")
                                )
                            }
                        }
                    }
                }

                // Fulfilment: At the shop vs Pickup from home
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
                                text = "Where are the clothes?",
                                style = MaterialTheme.typography.titleSmall,
                                color = InkPrimary,
                                fontWeight = FontWeight.Bold
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                                FulfilmentOptionCard(
                                    title = "At the Shop",
                                    subtitle = "Walk-in / counter",
                                    icon = Icons.Outlined.Storefront,
                                    selected = fulfilment == "walkin",
                                    onClick = { fulfilment = "walkin" },
                                    modifier = Modifier.weight(1f)
                                )
                                FulfilmentOptionCard(
                                    title = "Doorstep Pickup",
                                    subtitle = "Collected from home",
                                    icon = Icons.Outlined.LocalShipping,
                                    selected = fulfilment == "pickup",
                                    onClick = { fulfilment = "pickup" },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }
                }

                // Urgent Toggle
                item {
                    Surface(
                        color = if (isUrgent) StatusWarningSoft else SurfaceWhite,
                        shape = RoundedCornerShape(18.dp),
                        border = BorderStroke(1.dp, if (isUrgent) StatusWarning else BorderLight),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(16.dp)
                        ) {
                            Icon(Icons.Outlined.Bolt, contentDescription = null, tint = StatusWarning)
                            Spacer(modifier = Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Urgent / Express Order",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = InkPrimary,
                                    fontWeight = FontWeight.Bold
                                )
                                val chargeText = if (urgentCfg?.type == "flat") {
                                    "+${formatRupees(urgentCfg.value)}"
                                } else {
                                    "+${(urgentCfg?.value ?: 50.0).toInt()}%"
                                }
                                Text(
                                    text = "$chargeText · Washer & Iron Boy see URGENT on top",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = InkMuted
                                )
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Switch(
                                checked = isUrgent,
                                onCheckedChange = { isUrgent = it },
                                colors = SwitchDefaults.colors(
                                    checkedTrackColor = StatusWarning,
                                    uncheckedThumbColor = InkMuted,
                                    uncheckedBorderColor = InkMuted,
                                    uncheckedTrackColor = SurfaceWhite
                                ),
                                modifier = Modifier.testTag("bill_urgent_switch")
                            )
                        }
                    }
                }
            }

            // ─── STEP 2: GARMENTS & RATE CARD ───────────────────────────────
            if (step == 2) {
                // Customer Usual Items (1-tap quick add)
                if (customerUsualItems.isNotEmpty()) {
                    item {
                        Surface(
                            color = SurfaceWhite,
                            shape = RoundedCornerShape(16.dp),
                            border = BorderStroke(1.dp, BorderLight),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Text(
                                    text = "Customer's Usual Clothes",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = InkPrimary,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    customerUsualItems.forEach { u ->
                                        val match = rates.firstOrNull { it.service == u.service && it.garment == u.garment }
                                        if (match != null) {
                                            FilterChip(
                                                selected = cart.any { it.service == u.service && it.garment == u.garment },
                                                onClick = { addOrIncrementRate(match) },
                                                label = { Text("${u.garment.ifBlank { u.service }} · ${formatRupees(match.rate)}") }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Active Cart Summary (editable quantities)
                if (cart.isNotEmpty()) {
                    item {
                        Surface(
                            color = SurfaceWhite,
                            shape = RoundedCornerShape(16.dp),
                            border = BorderStroke(1.dp, BrandBlue.copy(alpha = 0.35f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Text(
                                    text = "Added to Bill (${cart.size})",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = BrandBlue,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                cart.forEachIndexed { idx, line ->
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 4.dp)
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = line.garment.ifBlank { line.service },
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.SemiBold,
                                                color = InkPrimary
                                            )
                                            Text(
                                                text = "${line.service} · ${formatRupees(line.rate)}/${line.unit}",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = InkMuted
                                            )
                                        }
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            IconButton(
                                                onClick = {
                                                    val delta = if (line.unit == "kg") 0.5 else 1.0
                                                    val next = line.qty - delta
                                                    if (next <= 0.0) cart.removeAt(idx)
                                                    else cart[idx] = line.copy(qty = next)
                                                }
                                            ) {
                                                Icon(Icons.Outlined.Remove, contentDescription = "Decrease")
                                            }
                                            Text(
                                                text = if (line.unit == "kg") "${line.qty} kg" else "${line.qty.toInt()}",
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.Bold
                                            )
                                            IconButton(
                                                onClick = {
                                                    val delta = if (line.unit == "kg") 0.5 else 1.0
                                                    cart[idx] = line.copy(qty = line.qty + delta)
                                                }
                                            ) {
                                                Icon(Icons.Outlined.Add, contentDescription = "Increase")
                                            }
                                        }
                                    }
                                    if (idx < cart.lastIndex) HorizontalDivider(color = BorderLight)
                                }
                            }
                        }
                    }
                }

                // Rate Card Search & Service Filter
                item {
                    KwikSearchField(
                        value = itemSearch,
                        onValueChange = { itemSearch = it },
                        placeholder = "Search garment or service (e.g. Shirt, Saree, Dry Clean)",
                        testTag = "bill_rate_search_input"
                    )
                }

                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(services) { svc ->
                            FilterChip(
                                selected = selectedService == svc,
                                onClick = { selectedService = svc },
                                label = { Text(if (svc == "ALL") "All Services" else svc) }
                            )
                        }
                    }
                }

                if (isLoadingRates && rates.isEmpty()) {
                    item {
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp)
                        ) {
                            CircularProgressIndicator(color = BrandBlue)
                        }
                    }
                } else if (filteredRates.isEmpty()) {
                    item {
                        EmptyStateCard(
                            icon = Icons.AutoMirrored.Outlined.ReceiptLong,
                            title = "No Rate Card Items",
                            subtitle = "Ask your shop owner to add items to the shop Rate Card."
                        )
                    }
                } else {
                    items(filteredRates, key = { "${it.id}_${it.service}_${it.garment}" }) { rate ->
                        val inCartQty = cart.firstOrNull { it.service == rate.service && it.garment == rate.garment }?.qty
                        Surface(
                            color = SurfaceWhite,
                            shape = RoundedCornerShape(14.dp),
                            border = BorderStroke(
                                width = if (inCartQty != null) 1.5.dp else 1.dp,
                                color = if (inCartQty != null) BrandBlue else BorderLight
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { addOrIncrementRate(rate) }
                                .testTag("bill_rate_item_${rate.id}")
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(14.dp)
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = rate.garment.ifBlank { rate.service },
                                        style = MaterialTheme.typography.titleSmall,
                                        color = InkPrimary,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    Text(
                                        text = "${rate.service} · per ${rate.unit.ifBlank { "pc" }}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = InkMuted
                                    )
                                }
                                Text(
                                    text = formatRupees(rate.rate),
                                    style = MaterialTheme.typography.titleSmall,
                                    color = BrandBlue,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                                Surface(
                                    color = if (inCartQty != null) BrandBlue else BrandSoft,
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Text(
                                        text = if (inCartQty != null) {
                                            if (rate.unit == "kg") "${inCartQty}kg" else "+${inCartQty.toInt()}"
                                        } else "+ Add",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = if (inCartQty != null) Color.White else BrandBlue,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // ─── STEP 3: SUMMARY, DISCOUNT, GST, ADVANCE & CREATE ───────────
            if (step == 3) {
                if (customerRewards.isNotEmpty()) {
                    item {
                        Surface(
                            color = StatusSuccessSoft,
                            shape = RoundedCornerShape(16.dp),
                            border = BorderStroke(1.dp, StatusSuccess.copy(alpha = 0.4f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Text(
                                    text = "Available Customer Rewards",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = StatusSuccess,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                customerRewards.forEach { rw ->
                                    val applied = selectedRewardCode == rw.code
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Text(rw.reward, style = MaterialTheme.typography.bodySmall, color = InkPrimary)
                                        TextButton(onClick = {
                                            selectedRewardCode = if (applied) "" else rw.code
                                        }) {
                                            Text(if (applied) "Remove" else "Apply")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

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
                                text = "Discount, Charges & GST",
                                style = MaterialTheme.typography.titleSmall,
                                color = InkPrimary,
                                fontWeight = FontWeight.Bold
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                FilterChip(
                                    selected = discountMode == "amt",
                                    onClick = { discountMode = "amt" },
                                    label = { Text("Discount ₹") }
                                )
                                FilterChip(
                                    selected = discountMode == "pct",
                                    onClick = { discountMode = "pct" },
                                    label = { Text("Discount %") }
                                )
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                OutlinedTextField(
                                    value = discountInput,
                                    onValueChange = { discountInput = it },
                                    label = { Text(if (discountMode == "pct") "Discount (%)" else "Discount (₹)") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    singleLine = true,
                                    modifier = Modifier.weight(1f)
                                )
                                OutlinedTextField(
                                    value = deliveryChargeInput,
                                    onValueChange = { deliveryChargeInput = it },
                                    label = { Text("Delivery Chg (₹)") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    singleLine = true,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            Text("GST %", style = MaterialTheme.typography.labelMedium, color = InkMuted)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf(0.0, 5.0, 12.0, 18.0).forEach { pct ->
                                    FilterChip(
                                        selected = gstPercent == pct,
                                        onClick = { gstPercent = pct },
                                        label = { Text("${pct.toInt()}%") }
                                    )
                                }
                            }
                        }
                    }
                }

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
                                text = "Advance Payment & Notes",
                                style = MaterialTheme.typography.titleSmall,
                                color = InkPrimary,
                                fontWeight = FontWeight.Bold
                            )
                            OutlinedTextField(
                                value = advanceInput,
                                onValueChange = { advanceInput = it },
                                label = { Text("Advance Received Now (₹)") },
                                placeholder = { Text("0 if paying on delivery") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("bill_advance_input")
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf("CASH" to "Cash", "UPI" to "UPI", "SPLIT" to "Split").forEach { (k, label) ->
                                    FilterChip(
                                        selected = paymentMethod == k,
                                        onClick = { paymentMethod = k },
                                        label = { Text(label) }
                                    )
                                }
                            }
                            if (paymentMethod == "SPLIT") {
                                OutlinedTextField(
                                    value = splitUpiInput,
                                    onValueChange = { splitUpiInput = it },
                                    label = { Text("UPI Part (₹)") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                            OutlinedTextField(
                                value = notes,
                                onValueChange = { notes = it.take(240) },
                                label = { Text("Wash / Iron / Delivery Instructions (optional)") },
                                placeholder = { Text("e.g., Soft starch on white shirt, deliver after 6 PM") },
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }

                // Live Totals Card
                item {
                    Surface(
                        color = SurfaceWhite,
                        shape = RoundedCornerShape(18.dp),
                        border = BorderStroke(1.5.dp, BrandBlue.copy(alpha = 0.4f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.padding(16.dp)
                        ) {
                            SummaryLine("Garments Subtotal", formatRupees(gross))
                            if (discountAmt > 0) SummaryLine("Discount", "-${formatRupees(discountAmt)}", StatusSuccess)
                            if (urgentAmt > 0) SummaryLine("Urgent Charge", "+${formatRupees(urgentAmt)}", StatusWarning)
                            if (deliveryCharge > 0) SummaryLine("Delivery Charge", "+${formatRupees(deliveryCharge)}")
                            if (gstAmt > 0) SummaryLine("GST (${gstPercent.toInt()}%)", "+${formatRupees(gstAmt)}")
                            HorizontalDivider(color = BorderLight)
                            SummaryLine("Net Bill Total", formatRupees(netTotal), InkPrimary, bold = true)
                            if (advanceAmt > 0) SummaryLine("Advance Paid ($paymentMethod)", "-${formatRupees(advanceAmt)}", StatusSuccess)
                            SummaryLine("Balance Due", formatRupees(balanceDue), if (balanceDue > 0) StatusError else StatusSuccess, bold = true)
                            if (prevDue > 0) {
                                SummaryLine("Total incl. Previous Due", formatRupees(balanceDue + prevDue), StatusWarning, bold = true)
                            }
                        }
                    }
                }
            }
        }

        // Sticky Bottom Action Bar
        Surface(
            color = SurfaceWhite,
            tonalElevation = 4.dp,
            border = BorderStroke(1.dp, BorderLight),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                if (step > 1) {
                    OutlinedButton(
                        onClick = { step -= 1 },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.height(48.dp)
                    ) {
                        Text("Back")
                    }
                }

                Button(
                    onClick = {
                        when (step) {
                            1 -> {
                                if (pickedCustomer == null && newPhone.length < 10) {
                                    validationError = "Select an existing customer or enter a 10-digit mobile number."
                                } else {
                                    validationError = null
                                    step = 2
                                }
                            }
                            2 -> {
                                if (cart.isEmpty()) {
                                    validationError = "Add at least one garment item from the rate card."
                                } else {
                                    validationError = null
                                    step = 3
                                }
                            }
                            3 -> {
                                val upiVal = if (paymentMethod == "SPLIT") {
                                    splitUpiInput.toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0
                                } else 0.0
                                if (pickedCustomer == null && newPhone.length < 10) {
                                    validationError = "Enter a valid 10-digit mobile number."
                                    step = 1
                                } else if (cart.isEmpty()) {
                                    validationError = "Add at least one garment."
                                    step = 2
                                } else if (upiVal > advanceAmt) {
                                    validationError = "UPI split part cannot exceed the advance amount."
                                } else {
                                    validationError = null
                                    val req = CreateBillRequest(
                                        customerRef = pickedCustomer?.ref.orEmpty(),
                                        customerPhone = if (pickedCustomer == null) newPhone else "",
                                        customerName = searchOrName.trim(),
                                        advance = advanceAmt,
                                        advanceMethod = if (advanceAmt > 0) paymentMethod else "CASH",
                                        advanceUpi = if (advanceAmt > 0) upiVal else 0.0,
                                        discountAmount = if (discountMode == "amt") discVal else 0.0,
                                        discountPercent = if (discountMode == "pct") discVal else 0.0,
                                        couponCode = selectedRewardCode,
                                        needsPickup = false,
                                        fulfilment = fulfilment,
                                        pickupTaskCode = pickupContext?.taskCode.orEmpty(),
                                        urgent = isUrgent,
                                        urgentCharge = if (isUrgent) urgentAmt else null,
                                        deliveryCharge = deliveryCharge,
                                        gstPercent = gstPercent,
                                        notes = notes.trim(),
                                        idempotencyKey = UUID.randomUUID().toString(),
                                        items = cart.map {
                                            BillLineItemRequest(
                                                service = it.service,
                                                garment = it.garment,
                                                qty = it.qty,
                                                rate = if (it.rate != it.cardRate) it.rate else null
                                            )
                                        }
                                    )
                                    onSubmitBill(req)
                                    // Reset local wizard state after submission
                                    cart.clear()
                                    pickedCustomer = null
                                    searchOrName = ""
                                    newPhone = ""
                                    discountInput = ""
                                    deliveryChargeInput = ""
                                    advanceInput = ""
                                    notes = ""
                                    isUrgent = false
                                    selectedRewardCode = ""
                                    step = 1
                                }
                            }
                        }
                    },
                    enabled = isOnline && !isSubmitting,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (step == 3) StatusSuccess else BrandBlue
                    ),
                    modifier = Modifier
                        .weight(1f)
                        .height(50.dp)
                        .testTag("bill_primary_next_submit_button")
                ) {
                    Text(
                        text = when {
                            !isOnline -> "Internet Required for Billing"
                            isSubmitting -> "Creating Bill…"
                            step == 1 -> "Next: Add Clothes →"
                            step == 2 -> "Next: Payment (${formatRupees(netTotal)}) →"
                            else -> "Create Bill · ${formatRupees(netTotal)}"
                        },
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
private fun StepPill(
    number: Int,
    label: String,
    active: Boolean,
    done: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val bg = when {
        active -> BrandBlue
        done -> StatusSuccessSoft
        else -> BrandSoft
    }
    val fg = when {
        active -> Color.White
        done -> StatusSuccess
        else -> BrandInk
    }
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp, horizontal = 6.dp)
    ) {
        Text(
            text = "$number. $label",
            style = MaterialTheme.typography.labelMedium,
            color = fg,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )
    }
}

@Composable
private fun FulfilmentOptionCard(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        color = if (selected) BrandSoft else SurfaceWhite,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(if (selected) 1.5.dp else 1.dp, if (selected) BrandBlue else BorderLight),
        modifier = modifier.clickable(onClick = onClick)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Icon(icon, contentDescription = null, tint = if (selected) BrandBlue else InkMuted)
            Spacer(modifier = Modifier.height(6.dp))
            Text(title, style = MaterialTheme.typography.titleSmall, color = InkPrimary, fontWeight = FontWeight.Bold)
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = InkMuted)
        }
    }
}

@Composable
private fun SummaryLine(
    label: String,
    value: String,
    color: Color = InkPrimary,
    bold: Boolean = false
) {
    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            text = label,
            style = if (bold) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium,
            color = if (bold) InkPrimary else InkMuted,
            fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal
        )
        Text(
            text = value,
            style = if (bold) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium,
            color = color,
            fontWeight = if (bold) FontWeight.Bold else FontWeight.SemiBold
        )
    }
}
