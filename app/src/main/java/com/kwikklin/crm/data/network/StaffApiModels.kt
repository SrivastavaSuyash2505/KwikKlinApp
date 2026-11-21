package com.kwikklin.crm.data.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Staff roles supported by Kwik Klin's /staff/api backend.
 * Distinct from subscription plans (Solo / Starter / Pro).
 */
enum class StaffRole(val wireValue: String, val displayLabel: String) {
    DELIVERY("DELIVERY", "Delivery Boy"),
    WASHER("WASHER", "Washerman"),
    IRONER("IRONER", "Iron Boy"),
    SUPERVISOR("SUPERVISOR", "Supervisor"),
    MANAGER("MANAGER", "Manager"),
    ADMIN("ADMIN", "Owner / Admin");

    companion object {
        fun fromWire(value: String?): StaffRole {
            return entries.firstOrNull { it.wireValue.equals(value?.trim(), ignoreCase = true) }
                ?: DELIVERY
        }
    }
}

/**
 * Subscription plan tiers returned by the backend (me.plan / me.plan_tier).
 * Never conflated with staff roles.
 */
enum class SubscriptionPlan(val wireKey: String, val displayName: String) {
    SOLO("solo", "Solo"),
    STARTER("starter", "Starter"),
    PRO("pro", "Pro");

    companion object {
        fun fromBackend(plan: String?, planTier: String?, soloFlag: Boolean): SubscriptionPlan {
            val candidate = (planTier ?: plan ?: "").trim().lowercase()
            return when {
                soloFlag || candidate.contains("solo") -> SOLO
                candidate.contains("pro") -> PRO
                else -> STARTER
            }
        }
    }
}

/**
 * Exact backend Order State Machine preserved from Kwik Klin FastAPI backend.
 */
enum class OrderStage(
    val wireValue: String,
    val label: String,
    val shortHint: String,
    val pipelineIndex: Int
) {
    RECEIVED("RECEIVED", "Received", "Order logged", 0),
    PICKUP_ASSIGNED("PICKUP_ASSIGNED", "Pickup Scheduled", "Pickup assigned", 1),
    PICKED_UP("PICKED_UP", "Picked Up", "Collected from customer", 2),
    IN_WASH("IN_WASH", "Washing", "In wash cycle", 3),
    IN_DRY("IN_DRY", "Drying", "Drying clothes", 4),
    IN_IRON("IN_IRON", "Ironing", "Press & finish", 5),
    READY("READY", "Ready", "Ready for delivery", 6),
    OUT_FOR_DELIVERY("OUT_FOR_DELIVERY", "Out for Delivery", "On the way to customer", 7),
    DELIVERED("DELIVERED", "Delivered", "Handed to customer", 8),
    ON_HOLD("ON_HOLD", "On Hold", "Paused at shop", -1),
    CANCELLED("CANCELLED", "Cancelled", "Order cancelled", -2);

    companion object {
        val mainPipeline: List<OrderStage> = listOf(
            RECEIVED, PICKUP_ASSIGNED, PICKED_UP, IN_WASH, IN_DRY,
            IN_IRON, READY, OUT_FOR_DELIVERY, DELIVERED
        )

        fun fromWire(value: String?): OrderStage {
            return entries.firstOrNull { it.wireValue.equals(value?.trim(), ignoreCase = true) }
                ?: RECEIVED
        }
    }
}

// ─── Request DTOs ───────────────────────────────────────────────────────────

@Serializable
data class LoginRequest(
    val phone: String,
    val password: String
)

@Serializable
data class ChangePasswordRequest(
    @SerialName("old_password") val oldPassword: String,
    @SerialName("new_password") val newPassword: String
)

@Serializable
data class StatusUpdateRequest(
    val status: String
)

@Serializable
data class AdvanceStageRequest(
    val to: String
)

@Serializable
data class NotHomeRequest(
    val note: String = ""
)

@Serializable
data class WashCountItem(
    val line: Int,
    val piece: Int? = null,
    val got: Int
)

@Serializable
data class StartWashingRequest(
    val counts: List<WashCountItem>? = null
)

@Serializable
data class DeliverPickItem(
    val line: Int,
    val piece: Int? = null,
    val qty: Int
)

@Serializable
data class DeliverOrderRequest(
    val items: List<DeliverPickItem>? = null
)

@Serializable
data class CollectPaymentRequest(
    val amount: Double,
    val method: String,
    @SerialName("settle_previous") val settlePrevious: Boolean = false,
    @SerialName("client_ref") val clientRef: String
)

@Serializable
data class CashHandoverRequest(
    @SerialName("handed_cash") val handedCash: Double,
    val note: String = ""
)

@Serializable
data class TaskDoneRequest(
    val note: String = ""
)

@Serializable
data class TaskAskRequest(
    val text: String
)

@Serializable
data class TaskCancelRequestBody(
    val reason: String
)

@Serializable
data class SaveLocationRequest(
    val lat: Double,
    val lng: Double,
    @SerialName("accuracy_m") val accuracyM: Double? = null
)

// ─── Response DTOs ──────────────────────────────────────────────────────────

@Serializable
data class ApiErrorDto(
    val detail: String? = null,
    val message: String? = null,
    val error: String? = null
)

@Serializable
data class GenericActionResponse(
    val ok: Boolean = true,
    val status: String? = null,
    val detail: String? = null,
    val message: String? = null,
    val pending: Int? = null,
    @SerialName("delivered_now") val deliveredNow: Int? = null,
    val due: Double? = null,
    @SerialName("customer_ref") val customerRef: String? = null,
    @SerialName("customer_name") val customerName: String? = null,
    @SerialName("customer_has_location") val customerHasLocation: Boolean? = null,
    @SerialName("can_message") val canMessage: Boolean? = null
)

@Serializable
data class PlanValidityDto(
    val plan: String? = null,
    @SerialName("days_left") val daysLeft: Int? = null,
    val status: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null
)

@Serializable
data class StaffMeDto(
    val name: String = "",
    val phone: String = "",
    val role: String = "DELIVERY",
    val shop: String = "",
    val plan: String = "",
    @SerialName("plan_tier") val planTier: String? = null,
    val solo: Boolean = false,
    @SerialName("is_owner") val isOwner: Boolean = false,
    @SerialName("is_manager") val isManager: Boolean = false,
    val features: List<String> = emptyList(),
    @SerialName("can_bill") val canBill: Boolean = false,
    @SerialName("can_money") val canMoney: Boolean = false,
    @SerialName("can_contact") val canContact: Boolean = false,
    @SerialName("can_ask") val canAsk: Boolean = false,
    @SerialName("can_expense") val canExpense: Boolean = false,
    @SerialName("show_route") val showRoute: Boolean = false,
    @SerialName("garment_tags") val garmentTags: Boolean = false,
    @SerialName("must_change_password") val mustChangePassword: Boolean = false,
    @SerialName("ui_lang") val uiLang: String = "en",
    @SerialName("plan_validity") val planValidity: PlanValidityDto? = null,
    val urgent: UrgentConfigDto? = null,
    val bill: BillConfigDto? = null
) {
    val staffRole: StaffRole get() = StaffRole.fromWire(role)
    val subscriptionPlan: SubscriptionPlan get() = SubscriptionPlan.fromBackend(plan, planTier, solo)

    fun hasFeature(key: String): Boolean = features.any { it.equals(key, ignoreCase = true) }

    /** Exact web parity: ME.can_bill && ME.features.includes("billing") */
    val canCreateBill: Boolean
        get() = canBill && hasFeature("billing") &&
            staffRole != StaffRole.WASHER && staffRole != StaffRole.IRONER

    /**
     * Strict role-privacy gate: Washerman & Iron Boy never see billing/payment or unrestricted phone.
     */
    val allowFinancialVisibility: Boolean
        get() = (canMoney || canCreateBill) && staffRole != StaffRole.WASHER && staffRole != StaffRole.IRONER

    val allowCustomerCall: Boolean
        get() = canContact && staffRole != StaffRole.WASHER && staffRole != StaffRole.IRONER

    val allowCancelApprovalRequest: Boolean
        get() = hasFeature("cancel_approval") || staffRole == StaffRole.DELIVERY || isManager || isOwner
}

@Serializable
data class TodayDto(
    val pending: Int = 0,
    @SerialName("done_today") val doneToday: Int = 0,
    @SerialName("due_today") val dueToday: Double = 0.0,
    @SerialName("collected_today") val collectedToday: Double = 0.0,
    @SerialName("can_collect") val canCollect: Boolean = false,
    @SerialName("cash_to_confirm") val cashToConfirm: Int = 0,
    @SerialName("shop_pending") val shopPending: Int = 0,
    val late: Int = 0
)

@Serializable
data class ClothesSummaryDto(
    val total: Int = 0,
    val delivered: Int = 0,
    val pending: Int = 0,
    val held: Int = 0,
    @SerialName("returned_pending") val returnedPending: Int = 0
)

@Serializable
data class RouteStopDto(
    val kind: String = "",
    val number: String = "",
    val customer: String = "",
    val items: String = "",
    val due: Double = 0.0,
    val address: String = "",
    val urgent: Boolean = false,
    val delivery: String = "",
    @SerialName("done_at") val doneAt: String = "",
    val status: String = "RECEIVED",
    val next: String? = null,
    val clothes: ClothesSummaryDto? = null,
    @SerialName("nav_url") val navUrl: String? = null,
    @SerialName("pin_saved") val pinSaved: Boolean = false,
    val waypoint: String? = null,
    @SerialName("customer_ref") val customerRef: String? = null
) {
    val stage: OrderStage get() = OrderStage.fromWire(status)
}

@Serializable
data class RouteResponse(
    val stops: List<RouteStopDto> = emptyList(),
    val total: Int = 0
)

@Serializable
data class TaskDto(
    val code: String = "",
    val title: String = "",
    val kind: String = "general",
    val status: String = "OPEN",
    val urgent: Boolean = false,
    @SerialName("age_hours") val ageHours: Double? = null,
    @SerialName("eta_text") val etaText: String? = null,
    val reply: String? = null,
    @SerialName("cancel_requested") val cancelRequested: Boolean = false,
    @SerialName("cancel_reason") val cancelReason: String? = null,
    val order: String? = null,
    val customer: String? = null,
    val address: String? = null,
    @SerialName("done_at") val doneAt: String? = null
)

@Serializable
data class TasksResponse(
    val tasks: List<TaskDto> = emptyList(),
    val total: Int = 0
)

@Serializable
data class NotificationItemDto(
    val code: String = "",
    val title: String = "",
    val text: String = "",
    val at: String = "",
    val urgent: Boolean = false,
    val kind: String? = null,
    val order: String? = null
)

@Serializable
data class NotificationsResponse(
    val unread: Int = 0,
    val items: List<NotificationItemDto> = emptyList()
)

@Serializable
data class BootResponse(
    val me: StaffMeDto,
    val today: TodayDto = TodayDto(),
    val route: RouteResponse = RouteResponse(),
    val tasks: TasksResponse = TasksResponse(),
    val notifications: NotificationsResponse = NotificationsResponse()
)

@Serializable
data class OrderPieceDto(
    val piece: Int = 0,
    val type: String = "",
    val qty: Int = 0,
    val pending: Int = 0,
    val deliverable: Int? = null,
    val held: Int = 0
)

@Serializable
data class OrderLineDto(
    val line: Int = 0,
    val name: String = "",
    val service: String = "",
    val qty: Int = 0,
    val weight: Double? = null,
    val bag: Boolean = false,
    val delivered: Int = 0,
    val pending: Int = 0,
    val deliverable: Int? = null,
    val held: Int = 0,
    val returned: Int = 0,
    @SerialName("hold_reason") val holdReason: String? = null,
    @SerialName("return_reason") val returnReason: String? = null,
    val pieces: List<OrderPieceDto>? = null
)

@Serializable
data class OrderDetailDto(
    val number: String = "",
    val customer: String = "",
    val status: String = "RECEIVED",
    val next: String? = null,
    val urgent: Boolean = false,
    val delivery: String = "",
    val address: String = "",
    @SerialName("nav_url") val navUrl: String? = null,
    val total: Double = 0.0,
    val paid: Double = 0.0,
    val due: Double = 0.0,
    @SerialName("can_collect") val canCollect: Boolean = false,
    @SerialName("urgent_charge") val urgentCharge: Double = 0.0,
    val notes: String = "",
    val clothes: ClothesSummaryDto? = null,
    val lines: List<OrderLineDto> = emptyList(),
    @SerialName("customer_ref") val customerRef: String? = null
) {
    val stage: OrderStage get() = OrderStage.fromWire(status)
}

@Serializable
data class OrderCallResponse(
    val phone: String = ""
)

@Serializable
data class OrderDuesResponse(
    val due: Double = 0.0,
    @SerialName("previous_due") val previousDue: Double = 0.0,
    @SerialName("previous_bills") val previousBills: Int = 0
)

@Serializable
data class TaskMessageItemDto(
    val who: String = "",
    val text: String = "",
    val at: String = "",
    val mine: Boolean = false
)

@Serializable
data class TaskMessagesResponse(
    val code: String = "",
    val title: String = "",
    val messages: List<TaskMessageItemDto> = emptyList()
)

@Serializable
data class CashPaymentItemDto(
    val order: String = "",
    val at: String = "",
    val method: String = "cash",
    val amount: Double = 0.0
)

@Serializable
data class CashHandoverRecordDto(
    val id: String = "",
    val to: String = "",
    @SerialName("handed_cash") val handedCash: Double = 0.0,
    val short: Double = 0.0,
    val confirmed: Boolean = false,
    val at: String = ""
)

@Serializable
data class CashSummaryDto(
    val since: String = "",
    val count: Int = 0,
    val cash: Double = 0.0,
    val upi: Double = 0.0,
    val payments: List<CashPaymentItemDto> = emptyList(),
    val recent: List<CashHandoverRecordDto> = emptyList()
)

@Serializable
data class RatingEntryDto(
    val order: String = "",
    val at: String = "",
    val rating: String = "",
    val points: Int = 0
)

@Serializable
data class PointsDto(
    @SerialName("month_points") val monthPoints: Int = 0,
    val good: Int = 0,
    val mid: Int = 0,
    val bad: Int = 0,
    @SerialName("reward_note") val rewardNote: String = "",
    val recent: List<RatingEntryDto> = emptyList()
)

// ─── Web-Parity Billing, Rate Card, Customer Search, Receipt & Expenses ─────

@Serializable
data class UrgentConfigDto(
    val type: String = "percent", // "percent" or "flat"
    val value: Double = 50.0,
    val days: Int = 1
)

@Serializable
data class BillConfigDto(
    @SerialName("gst_default_on") val gstDefaultOn: Boolean = false,
    @SerialName("gst_percent") val gstPercent: Double = 0.0
)

@Serializable
data class RateCardItemDto(
    val id: Int = 0,
    val service: String = "",
    val garment: String = "",
    val rate: Double = 0.0,
    val unit: String = "pc",
    val uses: Int = 0
)

@Serializable
data class CustomerSearchHitDto(
    val ref: String = "",
    val name: String = "",
    @SerialName("phone_masked") val phoneMasked: String = "",
    val due: Double = 0.0,
    @SerialName("due_bills") val dueBills: Int = 0,
    @SerialName("order_count") val orderCount: Int = 0,
    @SerialName("last_order_at") val lastOrderAt: String? = null,
    @SerialName("has_location") val hasLocation: Boolean? = null
)

@Serializable
data class CustomerRewardDto(
    val code: String = "",
    val reward: String = "",
    @SerialName("expires_at") val expiresAt: String? = null
)

@Serializable
data class CustomerRewardsResponse(
    val available: List<CustomerRewardDto> = emptyList()
)

@Serializable
data class UsualItemDto(
    val service: String = "",
    val garment: String = ""
)

@Serializable
data class UsualItemsResponse(
    val items: List<UsualItemDto> = emptyList()
)

@Serializable
data class PickupBillContextDto(
    @SerialName("task_code") val taskCode: String = "",
    @SerialName("customer_ref") val customerRef: String = "",
    @SerialName("customer_name") val customerName: String = "",
    @SerialName("phone_masked") val phoneMasked: String = "",
    val address: String = "",
    val due: Double = 0.0
)

@Serializable
data class BillLineItemRequest(
    val service: String,
    val garment: String,
    val qty: Double,
    val rate: Double? = null
)

@Serializable
data class CreateBillRequest(
    @SerialName("customer_ref") val customerRef: String = "",
    @SerialName("customer_phone") val customerPhone: String = "",
    @SerialName("customer_name") val customerName: String = "",
    val advance: Double = 0.0,
    @SerialName("advance_method") val advanceMethod: String = "CASH",
    @SerialName("advance_upi") val advanceUpi: Double = 0.0,
    @SerialName("payment_note") val paymentNote: String = "",
    @SerialName("discount_amount") val discountAmount: Double = 0.0,
    @SerialName("discount_percent") val discountPercent: Double = 0.0,
    @SerialName("coupon_code") val couponCode: String = "",
    @SerialName("needs_pickup") val needsPickup: Boolean = false,
    val fulfilment: String = "walkin",
    @SerialName("pickup_task_code") val pickupTaskCode: String = "",
    val urgent: Boolean = false,
    @SerialName("urgent_charge") val urgentCharge: Double? = null,
    @SerialName("delivery_charge") val deliveryCharge: Double = 0.0,
    @SerialName("gst_percent") val gstPercent: Double = 0.0,
    @SerialName("expected_delivery") val expectedDelivery: String? = null,
    @SerialName("delivery_time") val deliveryTime: String = "",
    val notes: String = "",
    @SerialName("idempotency_key") val idempotencyKey: String,
    val items: List<BillLineItemRequest>
)

@Serializable
data class CreateBillResponse(
    @SerialName("order_number") val orderNumber: String = "",
    val total: Double = 0.0,
    val due: Double = 0.0,
    @SerialName("previous_due") val previousDue: Double = 0.0,
    @SerialName("grand_total") val grandTotal: Double = 0.0,
    val status: String = "",
    @SerialName("bill_url") val billUrl: String = "",
    @SerialName("pickup_completed") val pickupCompleted: Boolean = false,
    @SerialName("customer_ref") val customerRef: String? = null,
    @SerialName("customer_name") val customerName: String? = null
)

@Serializable
data class BillListItemDto(
    val number: String = "",
    val customer: String = "",
    val items: String = "",
    val created: String = "",
    val delivery: String = "",
    val status: String = "RECEIVED",
    val total: Double = 0.0,
    val due: Double = 0.0
) {
    val stage: OrderStage get() = OrderStage.fromWire(status)
}

@Serializable
data class BillsListResponse(
    val bills: List<BillListItemDto> = emptyList(),
    val total: Int = 0
)

@Serializable
data class OrderReceiptDto(
    val number: String = "",
    val name: String = "",
    val phone: String = "",
    val text: String = "",
    @SerialName("bill_url") val billUrl: String = "",
    @SerialName("print_text") val printText: String = ""
)

@Serializable
data class ExpenseEntryDto(
    val category: String = "",
    val amount: Double = 0.0,
    @SerialName("spent_on") val spentOn: String = "",
    val description: String = ""
)

@Serializable
data class ExpensesResponse(
    val month: String = "",
    val total: Double = 0.0,
    @SerialName("backdate_days") val backdateDays: Int = 7,
    val categories: List<String> = emptyList(),
    val expenses: List<ExpenseEntryDto> = emptyList()
)

@Serializable
data class CreateExpenseRequest(
    val category: String,
    val amount: Double,
    @SerialName("spent_on") val spentOn: String? = null,
    val description: String = ""
)

