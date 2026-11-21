package com.kwikklin.crm.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.foundation.border
import androidx.compose.foundation.Image
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import com.kwikklin.crm.R
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.MarkChatRead
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import com.kwikklin.crm.ui.theme.BorderSoft
import com.kwikklin.crm.ui.theme.BrandInk
import com.kwikklin.crm.ui.theme.BrandLine
import com.kwikklin.crm.ui.theme.BrandOnNavy
import com.kwikklin.crm.ui.theme.GoldAccent
import com.kwikklin.crm.ui.theme.GoldInk
import com.kwikklin.crm.ui.theme.GoldSoft
import com.kwikklin.crm.ui.theme.InkSecondary
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import com.kwikklin.crm.ui.OtpFlowState
import com.kwikklin.crm.ui.theme.WhatsAppGreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.kwikklin.crm.data.crm.CrmHealthResult
import com.kwikklin.crm.ui.theme.BorderLight
import com.kwikklin.crm.ui.theme.BrandBlue
import com.kwikklin.crm.ui.theme.BrandSoft
import com.kwikklin.crm.ui.theme.InkMuted
import com.kwikklin.crm.ui.theme.InkPrimary
import com.kwikklin.crm.ui.theme.NavyBase
import com.kwikklin.crm.ui.theme.NavyDeep
import com.kwikklin.crm.ui.theme.PageCanvas
import com.kwikklin.crm.ui.theme.StatusError
import com.kwikklin.crm.ui.theme.StatusErrorSoft
import com.kwikklin.crm.ui.theme.StatusSuccess
import com.kwikklin.crm.ui.theme.StatusSuccessSoft
import com.kwikklin.crm.ui.theme.SurfaceWhite

/** Screen 1: Splash Screen */
/** The original round Kwik Klin logo (app/site/assets/img/logo.png) on a soft white halo. */
@Composable
fun KwikKlinLogo(size: Dp, modifier: Modifier = Modifier) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(size)
            .shadow(elevation = 10.dp, shape = CircleShape, ambientColor = Color.Black, spotColor = Color.Black)
            .clip(CircleShape)
            .background(Color.White)
            .padding(3.dp)
    ) {
        Image(
            painter = painterResource(id = R.drawable.kk_logo),
            contentDescription = "Kwik Klin logo",
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxSize()
                .clip(CircleShape)
        )
    }
}

@Composable
fun SplashScreen(modifier: Modifier = Modifier) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(colors = listOf(NavyDeep, NavyBase, Color(0xFF17316B)))
            )
            .padding(24.dp)
            .testTag("splash_screen")
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            KwikKlinLogo(size = 104.dp)
            Spacer(modifier = Modifier.height(18.dp))
            Text(
                text = "Kwik Klin",
                style = MaterialTheme.typography.headlineLarge,
                color = Color.White,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "Owners · Managers · Staff",
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.78f)
            )
            Spacer(modifier = Modifier.height(28.dp))
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 3.dp,
                modifier = Modifier.size(28.dp)
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "Verifying your session…",
                style = MaterialTheme.typography.labelMedium,
                color = Color.White.copy(alpha = 0.7f)
            )
        }
    }
}

/** Screen 2: Sign-in — WhatsApp OTP first, password kept as fallback. Used by every role. */
@Composable
fun LoginScreen(
    serverBaseUrl: String,
    sessionReason: String?,
    loginError: String?,
    isSubmitting: Boolean,
    isCheckingHealth: Boolean,
    healthCheck: CrmHealthResult?,
    onLogin: (phone: String, password: String) -> Unit,
    onUpdateServerUrl: (String) -> Unit,
    onCheckHealth: (String) -> Unit,
    modifier: Modifier = Modifier,
    otpFlow: OtpFlowState? = null,
    onSendOtp: (phone: String) -> Unit = {},
    onVerifyOtp: (code: String) -> Unit = {},
    onResendOtp: () -> Unit = {},
    onCancelOtp: () -> Unit = {},
    onSelectOtpShop: (shopId: String) -> Unit = {}
) {
    var phone by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var showPassword by rememberSaveable { mutableStateOf(false) }
    var usePassword by rememberSaveable { mutableStateOf(false) }
    var showServerConfig by rememberSaveable { mutableStateOf(false) }
    var editableServerUrl by rememberSaveable(serverBaseUrl) { mutableStateOf(serverBaseUrl) }
    var showForgotDialog by rememberSaveable { mutableStateOf(false) }

    val stepLabel = when {
        otpFlow != null -> "Step 2 of 2 · WhatsApp code"
        usePassword -> "Password sign-in"
        else -> "Step 1 of 2 · Mobile number"
    }
    val serverHost = serverBaseUrl.removePrefix("https://").removePrefix("http://").trimEnd('/')

    Box(
        contentAlignment = Alignment.TopCenter,
        modifier = modifier
            .fillMaxSize()
            .background(PageCanvas)
            .imePadding()
            .verticalScroll(rememberScrollState())
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 520.dp)
        ) {
            LoginHero()

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .offset(y = (-36).dp)
                    .padding(horizontal = 20.dp)
            ) {
                Surface(
                    color = SurfaceWhite,
                    shape = RoundedCornerShape(24.dp),
                    border = BorderStroke(1.dp, BorderLight),
                    shadowElevation = 6.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(horizontal = 22.dp, vertical = 22.dp)) {
                        StepChip(label = stepLabel)
                        Spacer(modifier = Modifier.height(14.dp))

                        // OTP-step errors render inline next to the code field; everything else goes in the banner.
                        val bannerError = loginError ?: if (otpFlow == null) sessionReason else null
                        if (!bannerError.isNullOrBlank()) {
                            LoginErrorBanner(message = bannerError, modifier = Modifier.testTag("login_error_banner"))
                            Spacer(modifier = Modifier.height(16.dp))
                        }

                        when {
                            otpFlow != null -> OtpCodeForm(
                                flow = otpFlow,
                                onVerify = onVerifyOtp,
                                onResend = onResendOtp,
                                onChangeNumber = onCancelOtp,
                                onSelectShop = onSelectOtpShop
                            )
                            usePassword -> PasswordForm(
                                phone = phone,
                                onPhoneChange = { phone = it },
                                password = password,
                                onPasswordChange = { password = it },
                                showPassword = showPassword,
                                onToggleShowPassword = { showPassword = !showPassword },
                                isSubmitting = isSubmitting,
                                onLogin = { onLogin(phone, password) },
                                onForgotPassword = { showForgotDialog = true },
                                onUseWhatsApp = { usePassword = false }
                            )
                            else -> OtpPhoneForm(
                                phone = phone,
                                onPhoneChange = { phone = it },
                                isSubmitting = isSubmitting,
                                onSendCode = { onSendOtp(phone) },
                                onUsePassword = { usePassword = true }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        imageVector = Icons.Outlined.VerifiedUser,
                        contentDescription = null,
                        tint = StatusSuccess,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (usePassword && otpFlow == null) "Encrypted sign-in · session stays on this phone"
                        else "One-time code from Kwik Klin's WhatsApp · valid 5 minutes",
                        style = MaterialTheme.typography.labelSmall,
                        color = InkMuted
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Connected to $serverHost",
                        style = MaterialTheme.typography.labelSmall,
                        color = InkMuted
                    )
                    TextButton(
                        onClick = { showServerConfig = !showServerConfig },
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                        modifier = Modifier
                            .height(32.dp)
                            .testTag("toggle_server_config_button")
                    ) {
                        Icon(Icons.Outlined.Dns, contentDescription = null, modifier = Modifier.size(14.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(if (showServerConfig) "Hide" else "Change", style = MaterialTheme.typography.labelSmall)
                    }
                }

                if (showServerConfig) {
                    Spacer(modifier = Modifier.height(8.dp))
                    ServerConfigCard(
                        editableServerUrl = editableServerUrl,
                        onEditableServerUrlChange = { editableServerUrl = it },
                        isCheckingHealth = isCheckingHealth,
                        healthCheck = healthCheck,
                        onUpdateServerUrl = onUpdateServerUrl,
                        onCheckHealth = onCheckHealth
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }

    if (showForgotDialog) {
        AlertDialog(
            onDismissRequest = { showForgotDialog = false },
            title = { Text("Account & Password Recovery") },
            text = {
                Text(
                    "Forgot your password? You do not need it: go back and sign in with a WhatsApp code sent to your registered mobile number.\n\n" +
                        "Owners manage their password from the Kwik Klin dashboard. " +
                        "Staff passwords are set by the shop owner or manager, who can reset them from the Staff page."
                )
            },
            confirmButton = {
                TextButton(onClick = { showForgotDialog = false }) {
                    Text("Got it")
                }
            }
        )
    }
}

/** Navy hero with the brand mark. Role-neutral: owners, managers and staff all sign in here. */
@Composable
private fun LoginHero() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 36.dp, bottomEnd = 36.dp))
            .background(Brush.linearGradient(listOf(NavyDeep, NavyBase, Color(0xFF1A316E))))
    ) {
        // Soft decorative circles
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = 50.dp, y = (-60).dp)
                .size(190.dp)
                .background(Color.White.copy(alpha = 0.05f), CircleShape)
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .offset(x = (-40).dp, y = 30.dp)
                .size(140.dp)
                .background(BrandBlue.copy(alpha = 0.18f), CircleShape)
        )
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 44.dp, bottom = 68.dp, start = 24.dp, end = 24.dp)
        ) {
            KwikKlinLogo(size = 96.dp)
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = "Kwik Klin",
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Owners · Managers · Staff",
                style = MaterialTheme.typography.labelLarge,
                color = BrandOnNavy
            )
        }
    }
}

@Composable
private fun StepChip(label: String) {
    Surface(
        color = BrandSoft,
        shape = RoundedCornerShape(999.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = BrandInk,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        )
    }
}

@Composable
private fun LoginErrorBanner(message: String, modifier: Modifier = Modifier) {
    Surface(
        color = StatusErrorSoft,
        border = BorderStroke(1.dp, StatusError.copy(alpha = 0.35f)),
        shape = RoundedCornerShape(14.dp),
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(14.dp)
        ) {
            Icon(
                imageVector = Icons.Outlined.ErrorOutline,
                contentDescription = null,
                tint = StatusError,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = StatusError,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
private fun ServerConfigCard(
    editableServerUrl: String,
    onEditableServerUrlChange: (String) -> Unit,
    isCheckingHealth: Boolean,
    healthCheck: CrmHealthResult?,
    onUpdateServerUrl: (String) -> Unit,
    onCheckHealth: (String) -> Unit
) {
    Surface(
        color = SurfaceWhite,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, BorderLight),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Connected Kwik Klin Server",
                style = MaterialTheme.typography.titleSmall,
                color = InkPrimary,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = editableServerUrl,
                onValueChange = onEditableServerUrlChange,
                singleLine = true,
                label = { Text("Server URL") },
                shape = RoundedCornerShape(12.dp),
                colors = loginFieldColors(),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("login_server_url_input")
            )
            Spacer(modifier = Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { onUpdateServerUrl(editableServerUrl) },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .testTag("login_save_server_button")
                ) {
                    Text("Save & Test")
                }
                TextButton(
                    onClick = { onCheckHealth(editableServerUrl) },
                    enabled = !isCheckingHealth,
                    modifier = Modifier.height(48.dp)
                ) {
                    Text(if (isCheckingHealth) "Checking…" else "Test")
                }
            }
            healthCheck?.let { res ->
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = if (res.isHealthy) StatusSuccessSoft else StatusErrorSoft,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = res.message,
                        style = MaterialTheme.typography.labelMedium,
                        color = if (res.isHealthy) StatusSuccess else StatusError,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun loginFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = BrandBlue,
    unfocusedBorderColor = BorderLight,
    focusedContainerColor = SurfaceWhite,
    unfocusedContainerColor = PageCanvas
)

@Composable
private fun LoginPhoneField(
    phone: String,
    onPhoneChange: (String) -> Unit,
    imeAction: ImeAction,
    onImeAction: () -> Unit
) {
    OutlinedTextField(
        value = phone,
        onValueChange = { new -> onPhoneChange(new.filter { it.isDigit() || it == '+' }.take(13)) },
        label = { Text("Mobile number") },
        placeholder = { Text("98765 43210") },
        prefix = if (phone.startsWith("+")) null else {
            { Text("+91 ", color = InkSecondary, fontWeight = FontWeight.SemiBold) }
        },
        leadingIcon = {
            Icon(Icons.Outlined.Phone, contentDescription = null, tint = InkMuted)
        },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = imeAction),
        keyboardActions = KeyboardActions(onDone = { onImeAction() }, onNext = { onImeAction() }),
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
        colors = loginFieldColors(),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("login_phone_input")
    )
}

/** Primary CTA shared by all three forms. */
@Composable
private fun LoginPrimaryButton(
    text: String,
    busyText: String,
    busy: Boolean,
    enabled: Boolean,
    container: Color,
    testTag: String,
    icon: ImageVector? = null,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = container,
            disabledContainerColor = container.copy(alpha = 0.35f),
            disabledContentColor = Color.White
        ),
        modifier = Modifier
            .fillMaxWidth()
            .height(54.dp)
            .testTag(testTag)
    ) {
        if (busy) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.5.dp,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(busyText, fontWeight = FontWeight.SemiBold)
        } else {
            if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
            }
            Text(text, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
        }
    }
}

/** OTP step 1: phone number → "Send code on WhatsApp". */
@Composable
private fun OtpPhoneForm(
    phone: String,
    onPhoneChange: (String) -> Unit,
    isSubmitting: Boolean,
    onSendCode: () -> Unit,
    onUsePassword: () -> Unit
) {
    val canSend = !isSubmitting && phone.filter { it.isDigit() }.length >= 10

    Text(
        text = "Welcome back",
        style = MaterialTheme.typography.titleLarge,
        color = InkPrimary,
        fontWeight = FontWeight.Bold
    )
    Spacer(modifier = Modifier.height(4.dp))
    Text(
        text = "Enter your registered mobile number. We will WhatsApp you a one-time code — no password needed.",
        style = MaterialTheme.typography.bodySmall,
        color = InkSecondary
    )
    Spacer(modifier = Modifier.height(18.dp))

    LoginPhoneField(
        phone = phone,
        onPhoneChange = onPhoneChange,
        imeAction = ImeAction.Done,
        onImeAction = { if (canSend) onSendCode() }
    )

    Spacer(modifier = Modifier.height(18.dp))

    LoginPrimaryButton(
        text = "Send code on WhatsApp",
        busyText = "Sending code…",
        busy = isSubmitting,
        enabled = canSend,
        container = WhatsAppGreen,
        testTag = "login_send_otp_button",
        icon = Icons.Outlined.ChatBubbleOutline,
        onClick = onSendCode
    )

    Spacer(modifier = Modifier.height(12.dp))

    DividerWithLabel("or")

    Spacer(modifier = Modifier.height(4.dp))
    TextButton(
        onClick = onUsePassword,
        modifier = Modifier
            .fillMaxWidth()
            .testTag("use_password_button")
    ) {
        Icon(Icons.Outlined.Lock, contentDescription = null, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(6.dp))
        Text("Sign in with password", fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun DividerWithLabel(label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth()
    ) {
        HorizontalDivider(modifier = Modifier.weight(1f), color = BorderLight)
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = InkMuted,
            modifier = Modifier.padding(horizontal = 12.dp)
        )
        HorizontalDivider(modifier = Modifier.weight(1f), color = BorderLight)
    }
}

/** Six digit boxes drawn over an invisible text field, so the keyboard and paste still work. */
@Composable
private fun OtpCodeBoxes(
    code: String,
    onCodeChange: (String) -> Unit,
    enabled: Boolean,
    isError: Boolean,
    onDone: () -> Unit,
    modifier: Modifier = Modifier
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()

    BasicTextField(
        value = code,
        onValueChange = { new -> onCodeChange(new.filter { it.isDigit() }.take(6)) },
        enabled = enabled,
        singleLine = true,
        interactionSource = interaction,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onDone() }),
        textStyle = TextStyle(color = Color.Transparent, fontSize = 1.sp),
        cursorBrush = SolidColor(Color.Transparent),
        modifier = modifier.testTag("login_otp_input"),
        decorationBox = { innerTextField ->
            Box(modifier = Modifier.fillMaxWidth()) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    repeat(6) { index ->
                        val digit = code.getOrNull(index)
                        val active = enabled && focused &&
                            (index == code.length || (code.length == 6 && index == 5))
                        val borderColor = when {
                            isError -> StatusError
                            active -> BrandBlue
                            digit != null -> BrandLine
                            else -> BorderLight
                        }
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .weight(1f)
                                .height(58.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(
                                    when {
                                        !enabled -> BorderSoft
                                        digit != null -> BrandSoft
                                        else -> PageCanvas
                                    }
                                )
                                .border(
                                    width = if (active || isError) 2.dp else 1.dp,
                                    color = borderColor,
                                    shape = RoundedCornerShape(12.dp)
                                )
                        ) {
                            Text(
                                text = digit?.toString() ?: "",
                                style = MaterialTheme.typography.headlineSmall,
                                color = if (enabled) InkPrimary else InkMuted,
                                fontWeight = FontWeight.Bold
                            )
                            if (active && digit == null) {
                                Box(
                                    modifier = Modifier
                                        .width(2.dp)
                                        .height(24.dp)
                                        .background(BrandBlue)
                                )
                            }
                        }
                    }
                }
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .alpha(0f)
                ) {
                    innerTextField()
                }
            }
        }
    )
}

/** OTP step 2: 6-digit code, resend countdown, optional shop chooser. */
@Composable
private fun OtpCodeForm(
    flow: OtpFlowState,
    onVerify: (String) -> Unit,
    onResend: () -> Unit,
    onChangeNumber: () -> Unit,
    onSelectShop: (String) -> Unit
) {
    var code by rememberSaveable(flow.sentAtMillis) { mutableStateOf(flow.pendingCode) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val context = LocalContext.current

    // One-second ticker for the resend / expiry countdown; stops once the code has expired.
    LaunchedEffect(flow.sentAtMillis) {
        now = System.currentTimeMillis()
        while (isActive && (now - flow.sentAtMillis) / 1000 < flow.expiresInSeconds) {
            delay(1000)
            now = System.currentTimeMillis()
        }
    }
    val elapsed = ((now - flow.sentAtMillis) / 1000).toInt().coerceAtLeast(0)
    val resendIn = (flow.resendAfterSeconds - elapsed).coerceAtLeast(0)
    val expiresIn = (flow.expiresInSeconds - elapsed).coerceAtLeast(0)
    val expired = expiresIn == 0 || flow.attemptsLeft == 0
    val busy = flow.isVerifying || flow.isSending
    val canVerify = !busy && !expired && code.length == 6
    val whatsAppLaunch = remember(context) {
        context.packageManager.getLaunchIntentForPackage("com.whatsapp")
            ?: context.packageManager.getLaunchIntentForPackage("com.whatsapp.w4b")
    }

    Text(
        text = "Enter the code",
        style = MaterialTheme.typography.titleLarge,
        color = InkPrimary,
        fontWeight = FontWeight.Bold
    )
    Spacer(modifier = Modifier.height(6.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = Icons.Outlined.MarkChatRead,
            contentDescription = null,
            tint = WhatsAppGreen,
            modifier = Modifier.size(18.dp)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = "Sent on WhatsApp to ${flow.maskedPhone}",
            style = MaterialTheme.typography.bodySmall,
            color = InkSecondary,
            modifier = Modifier.testTag("otp_sent_to_label")
        )
    }
    Spacer(modifier = Modifier.height(18.dp))

    OtpCodeBoxes(
        code = code,
        onCodeChange = { digits ->
            code = digits
            if (digits.length == 6 && !busy && !expired) onVerify(digits)
        },
        enabled = !expired,
        isError = flow.error != null,
        onDone = { if (canVerify) onVerify(code) },
        modifier = Modifier.fillMaxWidth()
    )

    flow.error?.let { err ->
        Spacer(modifier = Modifier.height(8.dp))
        val suffix = flow.attemptsLeft?.takeIf { it > 0 }?.let { " · $it attempts left" }.orEmpty()
        Text(
            text = err + suffix,
            style = MaterialTheme.typography.bodySmall,
            color = StatusError,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.testTag("otp_error_text")
        )
    }

    Spacer(modifier = Modifier.height(10.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = Icons.Outlined.Timer,
            contentDescription = null,
            tint = if (expired) StatusError else InkMuted,
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = if (expired) "Code expired — request a new one."
            else "Code expires in ${expiresIn / 60}:${"%02d".format(expiresIn % 60)}",
            style = MaterialTheme.typography.labelMedium,
            color = if (expired) StatusError else InkMuted,
            modifier = Modifier.testTag("otp_expiry_label")
        )
    }

    if (flow.shops.isNotEmpty()) {
        Spacer(modifier = Modifier.height(16.dp))
        Surface(
            color = GoldSoft,
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, GoldAccent.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Text(
                    text = "This number works at more than one laundry",
                    style = MaterialTheme.typography.labelLarge,
                    color = GoldInk,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "Pick the shop you want to sign in to:",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkSecondary
                )
                Spacer(modifier = Modifier.height(10.dp))
                flow.shops.forEachIndexed { index, shop ->
                    OutlinedButton(
                        onClick = { onSelectShop(shop.id) },
                        enabled = !busy,
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, BrandLine),
                        colors = ButtonDefaults.outlinedButtonColors(containerColor = SurfaceWhite, contentColor = InkPrimary),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                            .padding(bottom = if (index == flow.shops.lastIndex) 0.dp else 0.dp)
                            .testTag("otp_shop_${shop.id}")
                    ) {
                        Icon(Icons.Outlined.Storefront, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(shop.name.ifBlank { shop.id }, maxLines = 1, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = InkMuted)
                    }
                    if (index != flow.shops.lastIndex) Spacer(modifier = Modifier.height(8.dp))
                }
            }
        }
    }

    Spacer(modifier = Modifier.height(18.dp))

    LoginPrimaryButton(
        text = "Verify & Sign In",
        busyText = "Verifying…",
        busy = flow.isVerifying,
        enabled = canVerify,
        container = BrandBlue,
        testTag = "login_verify_otp_button",
        onClick = { onVerify(code) }
    )

    if (whatsAppLaunch != null) {
        Spacer(modifier = Modifier.height(10.dp))
        OutlinedButton(
            onClick = { runCatching { context.startActivity(whatsAppLaunch) } },
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, WhatsAppGreen.copy(alpha = 0.6f)),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = WhatsAppGreen),
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
                .testTag("open_whatsapp_button")
        ) {
            Icon(Icons.Outlined.ChatBubbleOutline, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Open WhatsApp to copy the code", fontWeight = FontWeight.SemiBold)
        }
    }

    Spacer(modifier = Modifier.height(6.dp))

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth()
    ) {
        TextButton(
            onClick = onResend,
            enabled = !busy && (resendIn == 0 || expired),
            modifier = Modifier.testTag("resend_otp_button")
        ) {
            Icon(Icons.Outlined.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                when {
                    flow.isSending -> "Sending…"
                    expired -> "Send new code"
                    resendIn > 0 -> "Resend in ${resendIn}s"
                    else -> "Resend code"
                },
                fontWeight = FontWeight.SemiBold
            )
        }
        TextButton(
            onClick = onChangeNumber,
            enabled = !busy,
            modifier = Modifier.testTag("change_number_button")
        ) {
            Icon(Icons.Outlined.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(4.dp))
            Text("Change number", fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Fallback: classic phone + password sign in (still needed for shops that prefer it). */
@Composable
private fun PasswordForm(
    phone: String,
    onPhoneChange: (String) -> Unit,
    password: String,
    onPasswordChange: (String) -> Unit,
    showPassword: Boolean,
    onToggleShowPassword: () -> Unit,
    isSubmitting: Boolean,
    onLogin: () -> Unit,
    onForgotPassword: () -> Unit,
    onUseWhatsApp: () -> Unit
) {
    val canSubmit = !isSubmitting && phone.isNotBlank() && password.isNotBlank()

    Text(
        text = "Sign in with password",
        style = MaterialTheme.typography.titleLarge,
        color = InkPrimary,
        fontWeight = FontWeight.Bold
    )
    Spacer(modifier = Modifier.height(4.dp))
    Text(
        text = "Use your registered mobile number and password.",
        style = MaterialTheme.typography.bodySmall,
        color = InkSecondary
    )
    Spacer(modifier = Modifier.height(18.dp))

    LoginPhoneField(
        phone = phone,
        onPhoneChange = onPhoneChange,
        imeAction = ImeAction.Next,
        onImeAction = {}
    )

    Spacer(modifier = Modifier.height(12.dp))

    OutlinedTextField(
        value = password,
        onValueChange = onPasswordChange,
        label = { Text("Password") },
        leadingIcon = {
            Icon(Icons.Outlined.Lock, contentDescription = null, tint = InkMuted)
        },
        trailingIcon = {
            IconButton(
                onClick = onToggleShowPassword,
                modifier = Modifier.testTag("toggle_password_visibility")
            ) {
                Icon(
                    imageVector = if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                    contentDescription = if (showPassword) "Hide password" else "Show password",
                    tint = InkMuted
                )
            }
        },
        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { if (canSubmit) onLogin() }),
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
        colors = loginFieldColors(),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("login_password_input")
    )

    Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
        TextButton(
            onClick = onForgotPassword,
            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
            modifier = Modifier
                .height(36.dp)
                .testTag("forgot_password_button")
        ) {
            Text("Forgot password?", style = MaterialTheme.typography.labelMedium)
        }
    }

    Spacer(modifier = Modifier.height(8.dp))

    LoginPrimaryButton(
        text = "Sign In",
        busyText = "Signing in…",
        busy = isSubmitting,
        enabled = canSubmit,
        container = BrandBlue,
        testTag = "login_submit_button",
        onClick = onLogin
    )

    Spacer(modifier = Modifier.height(12.dp))

    DividerWithLabel("or")

    Spacer(modifier = Modifier.height(4.dp))
    TextButton(
        onClick = onUseWhatsApp,
        colors = ButtonDefaults.textButtonColors(contentColor = WhatsAppGreen),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("use_whatsapp_button")
    ) {
        Icon(Icons.Outlined.ChatBubbleOutline, contentDescription = null, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(6.dp))
        Text("Get a code on WhatsApp instead", fontWeight = FontWeight.SemiBold)
    }
}

/** Screen 3: Mandatory or Voluntary Change Password Dialog */
@Composable
fun ChangePasswordDialog(
    mandatory: Boolean,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (oldPassword: String, newPassword: String) -> Unit
) {
    var oldPassword by rememberSaveable { mutableStateOf("") }
    var newPassword by rememberSaveable { mutableStateOf("") }
    var confirmPassword by rememberSaveable { mutableStateOf("") }
    var localError by rememberSaveable { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!mandatory) onDismiss() },
        title = {
            Text(
                text = if (mandatory) "Set Your New Password" else "Change Password",
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (mandatory) {
                    Text(
                        text = "Your shop owner requires you to change your temporary password before continuing.",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted
                    )
                }
                OutlinedTextField(
                    value = oldPassword,
                    onValueChange = { oldPassword = it; localError = null },
                    label = { Text("Current Password") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("old_password_input")
                )
                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it; localError = null },
                    label = { Text("New Password (min 6 chars)") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("new_password_input")
                )
                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it; localError = null },
                    label = { Text("Confirm New Password") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("confirm_password_input")
                )
                if (!localError.isNullOrBlank()) {
                    Text(
                        text = localError!!,
                        style = MaterialTheme.typography.labelMedium,
                        color = StatusError
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    when {
                        oldPassword.isBlank() -> localError = "Enter your current password."
                        newPassword.length < 6 -> localError = "New password must be at least 6 characters."
                        newPassword != confirmPassword -> localError = "New passwords do not match."
                        else -> onSubmit(oldPassword, newPassword)
                    }
                },
                enabled = !isSubmitting,
                modifier = Modifier.testTag("change_password_submit_button")
            ) {
                Text(if (isSubmitting) "Saving…" else "Update Password")
            }
        },
        dismissButton = {
            if (!mandatory) {
                TextButton(onClick = onDismiss) {
                    Text("Cancel")
                }
            }
        }
    )
}

/** Screen 14: Dedicated Internet / Sync Error Recovery Screen */
@Composable
fun NetworkErrorScreen(
    message: String,
    serverBaseUrl: String,
    onRetry: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .fillMaxSize()
            .background(PageCanvas)
            .padding(24.dp)
            .testTag("network_error_screen")
    ) {
        Surface(
            color = SurfaceWhite,
            shape = RoundedCornerShape(22.dp),
            border = BorderStroke(1.dp, BorderLight),
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 420.dp)
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(26.dp)
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(64.dp)
                        .clip(CircleShape)
                        .background(BrandSoft)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CloudOff,
                        contentDescription = "Connection Error",
                        tint = BrandBlue,
                        modifier = Modifier.size(32.dp)
                    )
                }
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Unable to Reach Kwik Klin",
                    style = MaterialTheme.typography.titleLarge,
                    color = InkPrimary,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Server: $serverBaseUrl",
                    style = MaterialTheme.typography.labelSmall,
                    color = InkMuted,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(22.dp))
                Button(
                    onClick = onRetry,
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .testTag("network_error_retry_button")
                ) {
                    Icon(Icons.Outlined.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Retry Connection", fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedButton(
                    onClick = onSignOut,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("network_error_sign_out_button")
                ) {
                    Text("Switch Account / Server URL")
                }
            }
        }
    }
}
