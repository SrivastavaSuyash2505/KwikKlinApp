package com.kwikklin.crm.ui

import com.kwikklin.crm.data.network.BillConfigDto
import com.kwikklin.crm.data.network.BillListItemDto
import com.kwikklin.crm.data.network.CashHandoverRecordDto
import com.kwikklin.crm.data.network.CashPaymentItemDto
import com.kwikklin.crm.data.network.CashSummaryDto
import com.kwikklin.crm.data.network.ClothesSummaryDto
import com.kwikklin.crm.data.network.CustomerSearchHitDto
import com.kwikklin.crm.data.network.ExpenseEntryDto
import com.kwikklin.crm.data.network.ExpensesResponse
import com.kwikklin.crm.data.network.NotificationItemDto
import com.kwikklin.crm.data.network.OrderDetailDto
import com.kwikklin.crm.data.network.OrderLineDto
import com.kwikklin.crm.data.network.OrderPieceDto
import com.kwikklin.crm.data.network.OrderReceiptDto
import com.kwikklin.crm.data.network.PlanValidityDto
import com.kwikklin.crm.data.network.PointsDto
import com.kwikklin.crm.data.network.RateCardItemDto
import com.kwikklin.crm.data.network.RatingEntryDto
import com.kwikklin.crm.data.network.RouteStopDto
import com.kwikklin.crm.data.network.StaffMeDto
import com.kwikklin.crm.data.network.TaskDto
import com.kwikklin.crm.data.network.TodayDto
import com.kwikklin.crm.data.network.UrgentConfigDto

/** Realistic fake data for rendering screens in screenshot tests. Not real customers. */
object SampleData {
    val deliveryMe = StaffMeDto(
        name = "Ravi Kumar",
        phone = "9000000001",
        role = "DELIVERY",
        shop = "Kwik Klin Lanka",
        plan = "pro",
        features = listOf("billing", "expenses", "cancel_approval", "route"),
        canBill = true,
        canMoney = true,
        canContact = true,
        canAsk = true,
        canExpense = true,
        showRoute = true,
        planValidity = PlanValidityDto(plan = "pro", daysLeft = 23, status = "active"),
        urgent = UrgentConfigDto(),
        bill = BillConfigDto(gstDefaultOn = false, gstPercent = 18.0)
    )

    val washerMe = StaffMeDto(
        name = "Sunil Prasad",
        phone = "9000000002",
        role = "WASHER",
        shop = "Kwik Klin Lanka",
        plan = "starter",
        features = listOf("billing"),
        canAsk = true
    )

    val today = TodayDto(
        pending = 7, doneToday = 4, dueToday = 2350.0, collectedToday = 1820.0,
        canCollect = true, cashToConfirm = 1, shopPending = 18, late = 2
    )

    val stops = listOf(
        RouteStopDto(
            kind = "delivery", number = "KK-2041", customer = "Anjali Verma",
            items = "3 Shirt · 2 Trouser · 1 Saree", due = 420.0,
            address = "B-12, Durgakund Road, near Sankat Mochan, Varanasi", urgent = true,
            delivery = "Today, 6 PM", status = "READY",
            clothes = ClothesSummaryDto(total = 6, pending = 6), navUrl = "https://maps.google.com"
        ),
        RouteStopDto(
            kind = "pickup", number = "KK-2044", customer = "Mohit Singh",
            items = "Pickup · ~10 pcs", due = 0.0, address = "Flat 3B, Assi Ghat Apartments",
            delivery = "Today, 4 PM", status = "PICKUP_ASSIGNED"
        ),
        RouteStopDto(
            kind = "delivery", number = "KK-2033", customer = "Priya Agarwal",
            items = "1 Blanket · 2 Curtain", due = 0.0, address = "Sigra, Mahmoorganj Rd",
            delivery = "Tomorrow", status = "OUT_FOR_DELIVERY",
            clothes = ClothesSummaryDto(total = 3, pending = 3)
        ),
        RouteStopDto(
            kind = "wash", number = "KK-2038", customer = "Deepak Gupta",
            items = "5 Shirt · 3 Jeans", due = 0.0, address = "",
            delivery = "Tomorrow", status = "IN_WASH"
        )
    )

    val tasks = listOf(
        TaskDto(
            code = "T-91", title = "Pickup from Mohit Singh — 10 clothes", kind = "pickup",
            status = "OPEN", urgent = true, ageHours = 1.5, etaText = "by 4 PM",
            order = null, customer = "Mohit Singh", address = "Flat 3B, Assi Ghat Apartments"
        ),
        TaskDto(
            code = "T-88", title = "Collect ₹420 pending from Anjali", kind = "general",
            status = "OPEN", ageHours = 5.0, reply = "Owner: Call before going",
            order = "KK-2041", customer = "Anjali Verma"
        ),
        TaskDto(
            code = "T-85", title = "Return stained shirt to shop", kind = "general",
            status = "OPEN", ageHours = 26.0, cancelRequested = true, cancelReason = "Customer not reachable"
        )
    )

    val notifications = listOf(
        NotificationItemDto(code = "n1", title = "URGENT pickup assigned", text = "KK-2044 · Mohit Singh · by 4 PM", at = "2 min ago", urgent = true, order = "KK-2044"),
        NotificationItemDto(code = "n2", title = "Order ready for delivery", text = "KK-2041 is packed and ready", at = "35 min ago", order = "KK-2041"),
        NotificationItemDto(code = "n3", title = "Cash handover confirmed", text = "₹1,200 confirmed by owner", at = "Yesterday")
    )

    val orderDetail = OrderDetailDto(
        number = "KK-2041", customer = "Anjali Verma", status = "READY", urgent = true,
        delivery = "Today, 6 PM", address = "B-12, Durgakund Road, near Sankat Mochan, Varanasi",
        navUrl = "https://maps.google.com", total = 620.0, paid = 200.0, due = 420.0, canCollect = true,
        urgentCharge = 100.0, notes = "Saree — light starch. Call before arriving.",
        clothes = ClothesSummaryDto(total = 6, pending = 6),
        lines = listOf(
            OrderLineDto(line = 1, name = "Shirt", service = "Wash & Iron", qty = 3, pending = 3),
            OrderLineDto(line = 2, name = "Trouser", service = "Wash & Iron", qty = 2, pending = 2),
            OrderLineDto(
                line = 3, name = "Saree", service = "Dry Clean", qty = 1, pending = 1,
                pieces = listOf(OrderPieceDto(piece = 1, type = "Silk", qty = 1, pending = 1))
            )
        ),
        customerRef = "c-77"
    )

    val rates = listOf(
        RateCardItemDto(1, "Wash & Iron", "Shirt", 30.0, "pc", 120),
        RateCardItemDto(2, "Wash & Iron", "Trouser", 35.0, "pc", 90),
        RateCardItemDto(3, "Dry Clean", "Saree", 180.0, "pc", 40),
        RateCardItemDto(4, "Steam Iron", "Shirt", 12.0, "pc", 200),
        RateCardItemDto(5, "Wash & Fold", "Mixed", 70.0, "kg", 60),
        RateCardItemDto(6, "Dry Clean", "Blazer", 250.0, "pc", 15)
    )

    val customerHits = listOf(
        CustomerSearchHitDto(ref = "c-77", name = "Anjali Verma", phoneMasked = "98••••4410", due = 420.0, dueBills = 1, orderCount = 14),
        CustomerSearchHitDto(ref = "c-12", name = "Anil Verma", phoneMasked = "97••••1022", orderCount = 2)
    )

    val bills = listOf(
        BillListItemDto("KK-2041", "Anjali Verma", "3 Shirt · 2 Trouser · 1 Saree", "21 Nov, 10:12 AM", "Today, 6 PM", "READY", 620.0, 420.0),
        BillListItemDto("KK-2040", "Rahul Mishra", "2 Blazer", "21 Nov, 9:40 AM", "23 Nov", "IN_WASH", 500.0, 0.0),
        BillListItemDto("KK-2036", "Sneha Pandey", "6 kg Wash & Fold", "20 Nov, 6:05 PM", "Delivered", "DELIVERED", 420.0, 0.0)
    )

    val receipt = OrderReceiptDto(
        number = "KK-2041", name = "Anjali Verma", phone = "",
        text = "Kwik Klin — Bill KK-2041\n3 Shirt, 2 Trouser, 1 Saree\nTotal ₹620 · Paid ₹200 · Due ₹420",
        billUrl = "https://kwikklin.online/b/KK-2041"
    )

    val points = PointsDto(
        monthPoints = 86, good = 21, mid = 3, bad = 1, rewardNote = "100 points = ₹500 bonus",
        recent = listOf(RatingEntryDto("KK-2030", "Yesterday", "good", 5))
    )

    val cash = CashSummaryDto(
        since = "Since 20 Nov, 8 PM", count = 3, cash = 1250.0, upi = 570.0,
        payments = listOf(CashPaymentItemDto("KK-2030", "10:30 AM", "cash", 650.0)),
        recent = listOf(CashHandoverRecordDto("h1", "Owner", 1200.0, 0.0, true, "Yesterday"))
    )

    val expenses = ExpensesResponse(
        month = "November 2026", total = 3450.0, categories = listOf("Fuel", "Detergent", "Repair", "Other"),
        expenses = listOf(
            ExpenseEntryDto("Fuel", 250.0, "2026-11-21", "Bike petrol"),
            ExpenseEntryDto("Detergent", 1200.0, "2026-11-18", "Ariel 10 kg")
        )
    )
}
