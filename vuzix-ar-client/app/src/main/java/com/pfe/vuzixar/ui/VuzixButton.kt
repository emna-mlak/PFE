package com.pfe.vuzixar.ui

import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Bouton compatible touchpad Vuzix : focus visible + Entrée / DPAD_CENTER = clic.
 */
@Composable
fun VuzixButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    requestFocusOnMount: Boolean = false,
    colors: ButtonColors = ButtonDefaults.buttonColors(),
) {
    val focusRequester = remember { FocusRequester() }
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused = interactionSource.collectIsFocusedAsState().value

    LaunchedEffect(requestFocusOnMount, enabled) {
        if (requestFocusOnMount && enabled) {
            focusRequester.requestFocus()
        }
    }

    Button(
        onClick = onClick,
        enabled = enabled,
        interactionSource = interactionSource,
        colors = colors,
        modifier = modifier
            .focusRequester(focusRequester)
            .focusable(interactionSource = interactionSource)
            .onKeyEvent { event ->
                if (!enabled) return@onKeyEvent false
                if (event.type == KeyEventType.KeyUp &&
                    (event.key == Key.Enter || event.key == Key.DirectionCenter || event.key == Key.NumPadEnter)
                ) {
                    onClick()
                    true
                } else {
                    false
                }
            }
            .then(
                if (isFocused) {
                    Modifier.border(width = 4.dp, color = Color.Yellow)
                } else {
                    Modifier
                },
            ),
    ) {
        Text(text = text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun VuzixPrimaryButton(
    text: String,
    onClick: () -> Unit,
    requestFocusOnMount: Boolean = false,
    containerColor: Color,
) {
    VuzixButton(
        text = text,
        onClick = onClick,
        requestFocusOnMount = requestFocusOnMount,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp),
        colors = ButtonDefaults.buttonColors(containerColor = containerColor),
    )
}
