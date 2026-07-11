package com.rork.ivx26android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** IVX brand gold — matches the iOS app and ivxholding.com landing accent. */
val IVXGold = Color(0xFFF5C417)

private val IVXDarkColorScheme = darkColorScheme(
    primary = IVXGold,
    onPrimary = Color.Black,
    secondary = IVXGold,
    onSecondary = Color.Black,
    background = Color.Black,
    onBackground = Color.White,
    surface = Color(0xFF0E0E0E),
    onSurface = Color.White,
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = IVXDarkColorScheme,
        content = content,
    )
}
