package com.rork.ivxholdings.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val IVXColorScheme = darkColorScheme(
    primary = IVXGold,
    onPrimary = IVXDark,
    secondary = IVXGreen,
    onSecondary = IVXDark,
    tertiary = IVXBlue,
    onTertiary = IVXDark,
    error = IVXRed,
    onError = IVXDark,
    background = IVXDark,
    onBackground = IVXOnSurface,
    surface = IVXSurface,
    onSurface = IVXOnSurface,
    surfaceVariant = IVXSurfaceVariant,
    onSurfaceVariant = IVXOnSurfaceMuted,
    outline = IVXOnSurfaceMuted,
)

@Composable
fun AppTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = IVXColorScheme,
        content = content
    )
}
