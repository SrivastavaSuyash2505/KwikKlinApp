package com.kwikklin.crm.ui.components

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kwikklin.crm.data.network.OrderStage
import com.kwikklin.crm.data.network.StaffRole
import com.kwikklin.crm.data.network.SubscriptionPlan
import com.kwikklin.crm.ui.theme.BorderLight
import com.kwikklin.crm.ui.theme.BrandBlue
import com.kwikklin.crm.ui.theme.BrandInk
import com.kwikklin.crm.ui.theme.BrandSoft
import com.kwikklin.crm.ui.theme.GoldAccent
import com.kwikklin.crm.ui.theme.GoldInk
import com.kwikklin.crm.ui.theme.GoldSoft
import com.kwikklin.crm.ui.theme.InkMuted
import com.kwikklin.crm.ui.theme.InkPrimary
import com.kwikklin.crm.ui.theme.NavyBase
import com.kwikklin.crm.ui.theme.NavyDeep
import com.kwikklin.crm.ui.theme.StatusBusy
import com.kwikklin.crm.ui.theme.StatusBusySoft
import com.kwikklin.crm.ui.theme.StatusError
import com.kwikklin.crm.ui.theme.StatusErrorSoft
import com.kwikklin.crm.ui.theme.StatusInfo
import com.kwikklin.crm.ui.theme.StatusInfoSoft
import com.kwikklin.crm.ui.theme.StatusSuccess
import com.kwikklin.crm.ui.theme.StatusSuccessSoft
import com.kwikklin.crm.ui.theme.StatusWarning
import com.kwikklin.crm.ui.theme.StatusWarningSoft
import com.kwikklin.crm.ui.theme.SurfaceWhite
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToLong

private val IndianLocale: Locale = Locale.forLanguageTag("en-IN")

fun formatRupees(amount: Double): String {
    val rounded = amount.roundToLong()
    val formatter = NumberFormat.getNumberInstance(IndianLocale)
    return "₹${formatter.format(rounded)}"
}

fun formatTimeShort(epochMs: Long): String {
    return SimpleDateFormat("dd MMM, hh:mm a", IndianLocale).format(Date(epochMs))
}

fun stageColors(stage: OrderStage): Pair<Color, Color> = when (stage) {
    OrderStage.RECEIVED, OrderStage.PICKUP_ASSIGNED, OrderStage.PICKED_UP -> StatusInfo to StatusInfoSoft
    OrderStage.IN_WASH, OrderStage.IN_DRY, OrderStage.IN_IRON -> StatusBusy to StatusBusySoft
    OrderStage.READY, OrderStage.DELIVERED -> StatusSuccess to StatusSuccessSoft
    OrderStage.OUT_FOR_DELIVERY, OrderStage.ON_HOLD -> StatusWarning to StatusWarningSoft
    OrderStage.CANCELLED -> StatusError to StatusErrorSoft
}

fun roleBadgeColors(role: StaffRole): Pair<Color, Color> = when (role) {
    StaffRole.DELIVERY -> StatusInfo to StatusInfoSoft
    StaffRole.WASHER -> StatusBusy to StatusBusySoft
    StaffRole.IRONER -> StatusWarning to StatusWarningSoft
    StaffRole.SUPERVISOR, StaffRole.MANAGER, StaffRole.ADMIN -> BrandInk to BrandSoft
}

fun planBadgeColors(plan: SubscriptionPlan): Pair<Color, Color> = when (plan) {
    SubscriptionPlan.SOLO -> StatusSuccess to StatusSuccessSoft
    SubscriptionPlan.STARTER -> BrandInk to BrandSoft
    SubscriptionPlan.PRO -> GoldInk to GoldSoft
}

@Composable
fun StatusPill(
    text: String,
    fg: Color,
    bg: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        color = bg,
        shape = RoundedCornerShape(999.dp),
        modifier = modifier
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(fg)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall,
                color = fg,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun UrgentBadge(modifier: Modifier = Modifier) {
    Surface(
        color = StatusErrorSoft,
        border = BorderStroke(1.dp, StatusError.copy(alpha = 0.55f)),
        shape = RoundedCornerShape(999.dp),
        modifier = modifier
    ) {
        Text(
            text = "URGENT",
            style = MaterialTheme.typography.labelSmall,
            color = StatusError,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
        )
    }
}

@Composable
fun PlanPill(
    plan: SubscriptionPlan,
    modifier: Modifier = Modifier
) {
    val (fg, bg) = planBadgeColors(plan)
    Surface(
        color = bg,
        border = BorderStroke(1.dp, fg.copy(alpha = 0.3f)),
        shape = RoundedCornerShape(999.dp),
        modifier = modifier
    ) {
        Text(
            text = "${plan.displayName} Plan",
            style = MaterialTheme.typography.labelSmall,
            color = fg,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp)
        )
    }
}

@Composable
fun NavyHeroSurface(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(NavyDeep, NavyBase, Color(0xFF1A316E))
                )
            )
            .padding(18.dp)
    ) {
        content()
    }
}

@Composable
fun KwikSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    testTag: String,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = { Text(placeholder, color = InkMuted, style = MaterialTheme.typography.bodyMedium) },
        leadingIcon = {
            Icon(
                imageVector = Icons.Outlined.Search,
                contentDescription = "Search",
                tint = InkMuted
            )
        },
        trailingIcon = {
            if (value.isNotEmpty()) {
                IconButton(onClick = { onValueChange("") }) {
                    Icon(
                        imageVector = Icons.Outlined.Close,
                        contentDescription = "Clear search",
                        tint = InkMuted
                    )
                }
            }
        },
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = SurfaceWhite,
            unfocusedContainerColor = SurfaceWhite,
            focusedBorderColor = BrandBlue,
            unfocusedBorderColor = BorderLight,
            focusedTextColor = InkPrimary,
            unfocusedTextColor = InkPrimary
        ),
        modifier = modifier
            .fillMaxWidth()
            .testTag(testTag)
    )
}

@Composable
fun EmptyStateCard(
    icon: ImageVector,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier
) {
    Surface(
        color = SurfaceWhite,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, BorderLight),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(28.dp)
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(52.dp)
                    .clip(CircleShape)
                    .background(BrandSoft)
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = BrandBlue,
                    modifier = Modifier.size(26.dp)
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = InkPrimary
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = InkMuted
            )
        }
    }
}

@Composable
fun ConnectivityOutboxBanner(
    isOnline: Boolean,
    pendingOutboxCount: Int,
    onSyncClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (isOnline && pendingOutboxCount == 0) return

    val bg = if (!isOnline) StatusWarningSoft else StatusInfoSoft
    val fg = if (!isOnline) StatusWarning else StatusInfo
    val icon = if (!isOnline) Icons.Outlined.CloudOff else Icons.Outlined.Sync
    val title = when {
        !isOnline && pendingOutboxCount > 0 ->
            "Offline — $pendingOutboxCount status update(s) queued to sync"
        !isOnline ->
            "No internet — live refresh and payments are paused"
        else ->
            "$pendingOutboxCount queued status update(s) waiting to sync"
    }

    Surface(
        color = bg,
        border = BorderStroke(1.dp, fg.copy(alpha = 0.35f)),
        shape = RoundedCornerShape(14.dp),
        modifier = modifier
            .fillMaxWidth()
            .testTag("connectivity_outbox_banner")
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = fg,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                color = fg,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f)
            )
            if (isOnline && pendingOutboxCount > 0) {
                TextButton(
                    onClick = onSyncClick,
                    modifier = Modifier.testTag("banner_sync_button")
                ) {
                    Text("Sync", color = fg, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
fun OrderPipelineProgress(
    currentStage: OrderStage,
    modifier: Modifier = Modifier
) {
    val pipeline = OrderStage.mainPipeline
    val activeIdx = currentStage.pipelineIndex
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            pipeline.forEachIndexed { index, _ ->
                val filled = activeIdx >= 0 && index <= activeIdx
                val barColor = when {
                    currentStage == OrderStage.CANCELLED -> StatusError.copy(alpha = 0.35f)
                    currentStage == OrderStage.ON_HOLD -> StatusWarning.copy(alpha = 0.45f)
                    filled -> BrandBlue
                    else -> BorderLight
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(6.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(barColor)
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = currentStage.label,
                style = MaterialTheme.typography.labelMedium,
                color = InkPrimary,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = if (activeIdx >= 0) "Step ${activeIdx + 1} of ${pipeline.size}" else currentStage.shortHint,
                style = MaterialTheme.typography.labelSmall,
                color = InkMuted
            )
        }
    }
}

fun dialPhone(context: Context, phone: String) {
    val cleaned = phone.replace(" ", "").trim()
    if (cleaned.isEmpty()) return
    val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$cleaned"))
    runCatching { context.startActivity(intent) }
}

fun openExternalUrl(context: Context, url: String) {
    val trimmed = url.trim()
    if (trimmed.isEmpty()) return
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(trimmed))
    runCatching { context.startActivity(intent) }
}
