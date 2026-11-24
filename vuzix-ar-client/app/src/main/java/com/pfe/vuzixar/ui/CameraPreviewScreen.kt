package com.pfe.vuzixar.ui

import android.Manifest
import android.os.Build
import android.view.KeyEvent
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.google.accompanist.permissions.rememberPermissionState
import com.pfe.vuzixar.BuildConfig
import com.pfe.vuzixar.R
import com.pfe.vuzixar.camera.CameraXBindings
import com.pfe.vuzixar.data.config.CaptureConfig
import com.pfe.vuzixar.ui.theme.HudBackground
import com.pfe.vuzixar.ui.theme.StatusCritical
import com.pfe.vuzixar.ui.theme.StatusOk
import com.pfe.vuzixar.ui.theme.StatusWarning

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun CameraPreviewScreen(
    viewModel: MainViewModel,
    modifier: Modifier = Modifier,
) {
    val uiState = viewModel.uiState.collectAsStateWithLifecycle().value
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)
    val locationPermissions = rememberMultiplePermissionsState(
        buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            add(Manifest.permission.ACCESS_COARSE_LOCATION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.NEARBY_WIFI_DEVICES)
            }
        },
    )
    val locationGranted = locationPermissions.allPermissionsGranted
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraPipeline = viewModel.cameraPipeline
    val canStartAnpr = uiState.healthSuccess == true

    LaunchedEffect(locationGranted) {
        if (locationGranted) viewModel.refreshNetworkDiagnostics(context)
    }

    LaunchedEffect(cameraPermission.status.isGranted) {
        if (!cameraPermission.status.isGranted) cameraPermission.launchPermissionRequest()
    }

    Box(modifier = modifier.fillMaxSize().background(Color.Black)) {
        if (cameraPermission.status.isGranted) {
            val previewView = remember {
                PreviewView(context).apply {
                    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                    isClickable = false
                    isFocusable = false
                    isFocusableInTouchMode = false
                }
            }
            LaunchedEffect(previewView) {
                val result = CameraXBindings.bindCamera(
                    context = context,
                    lifecycleOwner = lifecycleOwner,
                    previewView = previewView,
                    analyzer = cameraPipeline.analyzer,
                )
                cameraPipeline.imageCaptureRef.set(result.imageCapture)
            }
            AndroidView(
                factory = { previewView },
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                text = stringResource(R.string.camera_permission_rationale),
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(16.dp),
            )
        }

        AimGuideOverlay(
            modifier = Modifier.align(Alignment.Center),
            enabled = uiState.captureLoopEnabled,
        )

        TopControlPanel(
            uiState = uiState,
            onHealthClick = { viewModel.checkPiHealth() },
            modifier = Modifier.align(Alignment.TopCenter),
        )

        BottomControlPanel(
            uiState = uiState,
            canStartAnpr = canStartAnpr,
            onAnprClick = { viewModel.toggleCaptureLoop() },
            requestAnprFocus = canStartAnpr && !uiState.captureLoopEnabled,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@Composable
private fun TopControlPanel(
    uiState: MainUiState,
    onHealthClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(HudBackground.copy(alpha = 0.6f))
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text("Vuzix AR ${BuildConfig.VERSION_NAME}", color = Color.White, fontSize = 12.sp)
        Text(
            text = stringResource(R.string.touchpad_hint),
            color = Color.Cyan.copy(alpha = 0.9f),
            fontSize = 10.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            uiState.liveStatusLine,
            color = StatusWarning,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )

        VuzixButton(
            text = stringResource(R.string.health_check),
            onClick = onHealthClick,
            enabled = !uiState.healthLoading,
            requestFocusOnMount = true,
            modifier = Modifier.fillMaxWidth().heightIn(min = 42.dp),
        )

        if (uiState.healthLoading) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
                Text(stringResource(R.string.health_loading), color = Color.White, fontSize = 11.sp)
            }
        } else if (uiState.healthMessage != null) {
            Text(
                text = uiState.healthMessage,
                color = if (uiState.healthSuccess == true) StatusOk else StatusCritical,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        if (uiState.captureLoopEnabled) {
            uiState.ocrStatusHint?.let {
                Text(
                    text = it,
                    color = StatusWarning,
                    fontSize = 10.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun BottomControlPanel(
    uiState: MainUiState,
    canStartAnpr: Boolean,
    onAnprClick: () -> Unit,
    requestAnprFocus: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.62f))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        uiState.plateHud?.let { hud ->
            val statusColor = when (hud.rawStatus?.lowercase()) {
                "vehicule_recherche" -> StatusCritical
                "vignette_impayee" -> StatusWarning
                "ok" -> StatusOk
                else -> Color.White
            }
            Text(
                text = hud.plateLine,
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                maxLines = 1,
            )
            Text(
                text = hud.statusLine,
                color = statusColor,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            hud.confidence?.let { c ->
                Text(
                    text = "conf. OCR ${"%.0f".format(c * 100)}%",
                    color = Color.White.copy(alpha = 0.65f),
                    fontSize = 11.sp,
                    textAlign = TextAlign.Center,
                )
            }
            hud.lastError?.let { err ->
                Text(
                    text = err,
                    color = StatusWarning,
                    fontSize = 10.sp,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        when {
            uiState.captureLoopEnabled -> {
                VuzixPrimaryButton(
                    text = stringResource(R.string.stop_capture_loop),
                    onClick = onAnprClick,
                    requestFocusOnMount = true,
                    containerColor = StatusCritical,
                )
                Text(
                    text = uiState.liveStatusLine,
                    color = Color.White,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            canStartAnpr -> {
                VuzixPrimaryButton(
                    text = stringResource(R.string.start_capture_loop),
                    onClick = onAnprClick,
                    requestFocusOnMount = requestAnprFocus,
                    containerColor = StatusOk,
                )
            }
            else -> {
                Text(
                    text = stringResource(R.string.test_pi_first_hint),
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun AimGuideOverlay(
    modifier: Modifier = Modifier,
    enabled: Boolean,
) {
    if (!enabled) return
    val ratio = CaptureConfig.CENTER_CROP_RATIO
    Box(
        modifier = modifier
            .fillMaxWidth(ratio)
            .aspectRatio(16f / 9f)
            .border(width = 2.dp, color = Color.Yellow.copy(alpha = 0.85f)),
    )
}

/** Codes touchpad Vuzix souvent mappés sur Entrée / DPAD. */
fun isVuzixSelectKey(keyCode: Int): Boolean =
    keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
        keyCode == KeyEvent.KEYCODE_ENTER ||
        keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER ||
        keyCode == KeyEvent.KEYCODE_BUTTON_A
