# Vuzix AR Client (Approche 3 — STEP 1)

Application Android **Kotlin** embarquée sur **Vuzix Blade**, indépendante de `mobile-app-pfe`.

Les lunettes agissent comme caméra distante ; toute l’IA reste sur la **Raspberry Pi** (`http://10.42.0.1:8000`).

## STEP 1 — livré

- Projet Android Studio, CameraX preview, `GET /health`, architecture de base

## STEP 2 — livré

- **ImageAnalysis** 640×480 → JPEG (~72 %)
- **POST /recognize_plate** (multipart `file`)
- Boucle 2 FPS, **une requête à la fois** (frames ignorées si upload en cours)
- HUD texte : plaque + statut (`vehicleStatus` Pi)

## Non inclus (STEP 3+)

- Overlay AR avancé, couleurs plein écran
- TTS, WebSocket

## Arborescence

```
vuzix-ar-client/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── java/com/pfe/vuzixar/
│           ├── MainActivity.kt
│           ├── VuzixArApplication.kt
│           ├── camera/
│           │   ├── CameraPipeline.kt
│           │   ├── CameraXBindings.kt
│           │   ├── FrameCaptureScheduler.kt
│           │   ├── FrameEncoder.kt
│           │   ├── JpegFrameStore.kt
│           │   └── PlateAnalysisAnalyzer.kt
│           ├── data/repository/PlateRecognitionRepository.kt
│           ├── data/
│           │   ├── api/
│           │   │   ├── ApiService.kt
│           │   │   ├── RetrofitClient.kt
│           │   │   └── model/HealthResponse.kt
│           │   └── config/NetworkConfig.kt
│           └── ui/
│               ├── CameraPreviewScreen.kt
│               ├── MainViewModel.kt
│               └── theme/
├── gradle/libs.versions.toml
└── settings.gradle.kts
```

## Ouvrir dans Android Studio

1. **File → Open** → dossier `vuzix-ar-client`
2. Laisser Gradle synchroniser (JDK 17)
3. Connecter les lunettes Vuzix au hotspot Pi
4. Run sur l’appareil Vuzix (USB ou Wi‑Fi ADB)
5. Appuyer **Tester Pi (/health)** — doit afficher `Pi : ok | OCR ready: …`
6. **Démarrer ANPR 2 FPS** — pointer vers une plaque ; le HUD affiche `display` + statut

### Flux STEP 2

```
CameraX ImageAnalysis (RGBA 640×480)
  → FrameEncoder (JPEG)
  → JpegFrameStore (1 slot)
  → FrameCaptureScheduler (500 ms)
  → PlateRecognitionRepository → POST /recognize_plate
  → PlateHudDisplay dans le HUD
```

### Logs debug (logcat)

Filtrer : `VuzixAR` (tags `VuzixAR/Retrofit`, `VuzixAR/Http`, `VuzixAR/Network`, `VuzixAR/ViewModel`, `VuzixAR/Repo`)

Au démarrage, vérifier :
`Retrofit init | base=http://10.42.0.1:8000/ | GET http://10.42.0.1:8000/health`

Si échec TCP : l’app lie désormais OkHttp au **réseau Wi‑Fi** (`bindProcessToNetwork`).

## URL Pi

Définie dans `app/build.gradle.kts` :

```kotlin
buildConfigField("String", "PI_BASE_URL", "\"http://10.42.0.1:8000/\"")
```

## Prérequis terrain

- Lunettes sur le hotspot de la Pi
- FastAPI déjà démarré sur la Pi (non modifié par ce projet)
- `adb reverse` **non requis** en production (IP hotspot directe)
