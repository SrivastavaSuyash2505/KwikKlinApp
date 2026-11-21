package com.kwikklin.crm.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val KwikKlinLightColorScheme = lightColorScheme(
    primary = BrandStrong,
    onPrimary = Color.White,
    primaryContainer = BrandSoft,
    onPrimaryContainer = BrandInk,
    secondary = NavyBase,
    onSecondary = Color.White,
    secondaryContainer = NavySoft,
    onSecondaryContainer = NavyDeep,
    tertiary = StatusBusy,
    onTertiary = Color.White,
    tertiaryContainer = StatusBusySoft,
    onTertiaryContainer = StatusBusy,
    background = PaperBackground,
    onBackground = InkPrimary,
    surface = SurfaceWhite,
    onSurface = InkPrimary,
    surfaceVariant = Color(0xFFEDF1F9),
    onSurfaceVariant = InkSecondary,
    outline = BorderLight,
    outlineVariant = BorderSoft,
    error = StatusError,
    onError = Color.White,
    errorContainer = StatusErrorSoft,
    onErrorContainer = StatusError,
    // Material 3 draws dialogs, menus, switches, chips and sheets from these tokens.
    // Left unset they fall back to M3's baseline lavender/pink palette, which clashed
    // with the brand (e.g. pinkish AlertDialog backgrounds and switch tracks).
    surfaceTint = BrandStrong,
    surfaceDim = Color(0xFFE2E7F0),
    surfaceBright = SurfaceWhite,
    surfaceContainerLowest = SurfaceWhite,
    surfaceContainerLow = Color(0xFFF8FAFD),
    surfaceContainer = Color(0xFFF2F5FB),
    surfaceContainerHigh = SurfaceWhite,
    surfaceContainerHighest = Color(0xFFE6EBF3),
    inverseSurface = NavyDeep,
    inverseOnSurface = Color.White,
    inversePrimary = BrandOnNavy,
    scrim = Color.Black
)

val KwikKlinShapes = Shapes(
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(22.dp)
)

@Composable
fun KwikKlinTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = KwikKlinLightColorScheme,
        typography = KwikKlinTypography,
        shapes = KwikKlinShapes,
        content = content
    )
}
