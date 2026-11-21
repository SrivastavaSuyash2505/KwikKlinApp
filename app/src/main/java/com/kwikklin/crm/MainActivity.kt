package com.kwikklin.crm

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.kwikklin.crm.ui.SessionState
import com.kwikklin.crm.ui.StaffViewModel
import com.kwikklin.crm.ui.UiEvent
import com.kwikklin.crm.ui.components.dialPhone
import com.kwikklin.crm.ui.screens.ChangePasswordDialog
import com.kwikklin.crm.ui.screens.LoginScreen
import com.kwikklin.crm.ui.screens.NetworkErrorScreen
import com.kwikklin.crm.ui.screens.SplashScreen
import com.kwikklin.crm.ui.screens.StaffAppShell
import com.kwikklin.crm.ui.theme.KwikKlinTheme
import com.kwikklin.crm.ui.theme.PageCanvas

class MainActivity : ComponentActivity() {

    private val viewModel: StaffViewModel by viewModels {
        val app = application as KwikKlinApplication
        StaffViewModel.Factory(applicationContext, app.staffRepository)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            KwikKlinTheme {
                KwikKlinStaffRoot(viewModel = viewModel)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        viewModel.onAppForegroundChanged(true)
    }

    override fun onStop() {
        super.onStop()
        viewModel.onAppForegroundChanged(false)
    }
}

@Composable
private fun KwikKlinStaffRoot(viewModel: StaffViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is UiEvent.Toast -> {
                    snackbarHostState.showSnackbar(
                        message = event.message,
                        duration = if (event.isError) SnackbarDuration.Long else SnackbarDuration.Short
                    )
                }
                is UiEvent.DialPhone -> dialPhone(context, event.phone)
                is UiEvent.OpenNewBillTab, is UiEvent.BillCreated,
                UiEvent.PasswordChanged, UiEvent.CashHandoverDone -> Unit
            }
        }
    }

    when (val session = state.session) {
        SessionState.Splash -> {
            SplashScreen()
        }

        is SessionState.LoggedOut -> {
            Scaffold(
                containerColor = PageCanvas,
                contentWindowInsets = WindowInsets.safeDrawing,
                snackbarHost = { SnackbarHost(hostState = snackbarHostState) }
            ) { innerPadding ->
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                ) {
                    LoginScreen(
                        serverBaseUrl = state.serverBaseUrl,
                        sessionReason = session.reason,
                        loginError = state.loginError,
                        isSubmitting = state.isSubmitting,
                        isCheckingHealth = state.isCheckingHealth,
                        healthCheck = state.healthCheck,
                        onLogin = { phone, password -> viewModel.login(phone, password) },
                        otpFlow = state.otpFlow,
                        onSendOtp = { phone -> viewModel.sendLoginOtp(phone) },
                        onVerifyOtp = { code -> viewModel.verifyLoginOtp(code) },
                        onResendOtp = { viewModel.resendLoginOtp() },
                        onCancelOtp = { viewModel.cancelLoginOtp() },
                        onSelectOtpShop = { shopId -> viewModel.selectOtpShop(shopId) },
                        onUpdateServerUrl = { viewModel.updateServerBaseUrl(it) },
                        onCheckHealth = { viewModel.checkServerHealth(it) }
                    )
                }
            }
            if (state.mustChangePassword) {
                ChangePasswordDialog(
                    mandatory = true,
                    isSubmitting = state.isSubmitting,
                    onDismiss = {},
                    onSubmit = { oldPass, newPass -> viewModel.changePassword(oldPass, newPass) }
                )
            }
        }

        is SessionState.NetworkFailure -> {
            Scaffold(
                containerColor = PageCanvas,
                contentWindowInsets = WindowInsets.safeDrawing,
                snackbarHost = { SnackbarHost(hostState = snackbarHostState) }
            ) { innerPadding ->
                NetworkErrorScreen(
                    message = session.message,
                    serverBaseUrl = state.serverBaseUrl,
                    onRetry = { viewModel.bootstrap() },
                    onSignOut = { viewModel.logout() },
                    modifier = Modifier.padding(innerPadding)
                )
            }
        }

        is SessionState.Authenticated -> {
            StaffAppShell(
                me = session.me,
                state = state,
                viewModel = viewModel,
                snackbarHostState = snackbarHostState
            )
        }
    }
}
