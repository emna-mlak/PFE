package com.pfe.vuzixar.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkScheme = darkColorScheme(
    primary = HudAccent,
    onPrimary = HudBackground,
    background = HudBackground,
    onBackground = androidx.compose.ui.graphics.Color.White,
    surface = HudBackground,
)

@Composable
fun VuzixArTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkScheme,
        content = content,
    )
}
