package com.pfe.vuzixar

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.pfe.vuzixar.ui.CameraPreviewScreen
import com.pfe.vuzixar.ui.MainViewModel
import com.pfe.vuzixar.ui.isVuzixSelectKey
import com.pfe.vuzixar.ui.theme.VuzixArTheme

class MainActivity : ComponentActivity() {

  private var viewModelRef: MainViewModel? = null

  private val permissionLauncher = registerForActivityResult(
    ActivityResultContracts.RequestMultiplePermissions(),
  ) { results ->
    Log.i(TAG, "Permissions: $results")
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    requestRuntimePermissions()
    enableEdgeToEdge()
    setContent {
      VuzixArTheme {
        val vm: MainViewModel = viewModel()
        viewModelRef = vm
        CameraPreviewScreen(
          viewModel = vm,
          modifier = Modifier.fillMaxSize(),
        )
      }
    }
  }

  /** Raccourci touchpad si le focus Compose ne reçoit pas le tap. */
  override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
    if (isVuzixSelectKey(keyCode)) {
      val vm = viewModelRef ?: return super.onKeyUp(keyCode, event)
      val state = vm.uiState.value
      Log.i(TAG, "Touchpad SELECT keyCode=$keyCode")
      when {
        state.captureLoopEnabled -> vm.toggleCaptureLoop()
        state.healthSuccess == true && !state.captureLoopEnabled -> vm.toggleCaptureLoop()
        !state.healthLoading -> vm.checkPiHealth()
      }
      return true
    }
    return super.onKeyUp(keyCode, event)
  }

  private fun requestRuntimePermissions() {
    val needed = REQUIRED_PERMISSIONS.filter {
      ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }
    if (needed.isNotEmpty()) {
      permissionLauncher.launch(needed.toTypedArray())
    }
  }

  companion object {
    private const val TAG = "VuzixAR/Main"

    private val REQUIRED_PERMISSIONS = arrayOf(
      Manifest.permission.CAMERA,
      Manifest.permission.ACCESS_FINE_LOCATION,
      Manifest.permission.ACCESS_COARSE_LOCATION,
    )
  }
}
