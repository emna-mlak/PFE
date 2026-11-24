# Démarrage terrain — tablette Android sans Mac

Guide pour rouler **uniquement avec la Raspberry Pi + une tablette** : pas de `expo start`, pas de `proxy:all`, pas de Chrome sur Mac.

Pour le développement sur Mac, voir [DEMARRAGE_MAC.md](./DEMARRAGE_MAC.md).

## Architecture

```
[Téléphone USB] → Internet (optionnel)
        ↓
[Raspberry Pi 5]  hotspot RPi-Hotspot — 10.42.0.1
  • FastAPI :8000   OCR, WebSocket /alerts, /camera/mjpeg
  • Convex local    véhicules / vignettes
        ↓ Wi‑Fi
[Tablette Android]  app installée (APK), pas Expo Go
```

| Rôle | Où | Techno |
|------|-----|--------|
| Backend + vision + TTS agent | Pi | FastAPI, YOLO, PaddleOCR, espeak-ng |
| Données véhicule | Pi | Convex self-hosted |
| Dashboard + alertes vocales tablette | Tablette | APK Expo (build), `expo-speech` |

## Ce qu’il ne faut plus utiliser en terrain

| Outil | Pourquoi l’éviter |
|-------|-------------------|
| **Expo Go** | Charge le JS depuis Metro sur le Mac |
| **`npx expo start`** | Serveur de dev sur le Mac |
| **`npm run proxy:all`** | Proxies pour Chrome sur Mac |
| **`EXPO_PUBLIC_WS_URL=ws://127.0.0.1:8765`** | Boucle locale du Mac, pas la Pi |
| **`EXPO_PUBLIC_CAMERA_PROXY_URL=…8780`** | Proxy caméra Mac |

## 1. Raspberry Pi (une fois, puis à chaque boot)

### Services

```bash
cd ~/backend-python-pfe   # chemin réel sur la Pi
sudo ./scripts/raspberry-pi/install-terrain-backend-service.sh
sudo systemctl enable --now terrain-backend-api
```

### `.env` sur la Pi (`~/backend-python-pfe/.env`)

Exemple minimal :

```env
PI_CAMERA_MJPEG=1
YOLO_WEIGHTS=models/best.pt
CONVEX_VEHICLE_HTTP_URL=http://127.0.0.1:3211/vehicleLookup
CONVEX_VEHICLE_HTTP_SECRET=…
ALERTS_PUBLISH_SECRET=…
```

### Vérifications (SSH ou clavier sur la Pi)

```bash
curl -sS http://127.0.0.1:8000/health
# Attendu : "status":"ok", "camera_mjpeg_enabled":true si MJPEG activé

curl -sS -I --max-time 10 http://127.0.0.1:8000/camera/mjpeg
# Attendu : HTTP/1.1 200, Content-Type: multipart/x-mixed-replace
```

Optionnel : service vision `scripts/raspberry-pi/pfe-vision.service.example` si tu utilises le bridge caméra hors API seule.

## 2. Build de l’app tablette (une fois — Mac ou cloud)

Expo sert à **construire** l’APK, pas à tourner pendant la patrouille.

### Variables figées pour le build

Créer ou éditer `terrain-dashboard-app/.env` **avant** le build :

```env
EXPO_PUBLIC_BACKEND_HOST=10.42.0.1
EXPO_PUBLIC_API_PORT=8000

# Laisser vides (connexion directe Pi, pas de proxy Mac) :
EXPO_PUBLIC_WS_URL=
EXPO_PUBLIC_CAMERA_PROXY_URL=
EXPO_PUBLIC_CAMERA_STREAM_URL=
```

L’app résoudra alors :

- WebSocket : `ws://10.42.0.1:8000/alerts`
- Caméra : `http://10.42.0.1:8000/camera/mjpeg`

Si l’IP du hotspot change, refaire un build avec la nouvelle IP ou utiliser un hostname mDNS (`emna2.local`) si stable sur ton réseau.

### Option A — EAS Build (recommandé, sans garder Metro ouvert)

```bash
cd "/Users/mac/Desktop/backend python pfe/terrain-dashboard-app"
npm install
npx eas-cli login
npx eas build --platform android --profile preview
```

Télécharger l’APK depuis le lien Expo et l’installer sur la tablette (`adb install` ou fichier partagé).

Profils définis dans [eas.json](./eas.json) (`preview` = APK interne).

### Option B — Build local sur Mac (une fois)

```bash
cd "/Users/mac/Desktop/backend python pfe/terrain-dashboard-app"
npm install
npx expo prebuild --platform android
npx expo run:android --variant release
```

L’APK se trouve sous `android/app/build/outputs/apk/release/`.

## 3. Journée type sans Mac

1. Allumer la **Raspberry Pi** (hotspot **RPi-Hotspot** actif).
2. Brancher le **téléphone en USB** si tu veux Internet sur la Pi (partage USB).
3. Tablette → Wi‑Fi **RPi-Hotspot**.
4. Ouvrir l’**app installée** (icône dashboard), pas Expo Go.
5. L’agent entend les alertes **espeak** sur la Pi ; la tablette reçoit les événements en WebSocket et parle via **expo-speech**.

### Vérifier depuis la tablette (navigateur ou app « Ping & DNS »)

- Ping `10.42.0.1` doit répondre.
- Si la caméra reste noire : confirmer `PI_CAMERA_MJPEG=1` et `curl` MJPEG sur la Pi.

## 4. Pièges fréquents

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| WebSocket ne se connecte pas | Mauvaise IP / pas sur le hotspot | `EXPO_PUBLIC_BACKEND_HOST=10.42.0.1`, même Wi‑Fi |
| `ws://127.0.0.1:8765` dans les logs | Ancien `.env` proxy Mac | Vider `EXPO_PUBLIC_WS_URL`, rebuild APK |
| Caméra noire sur APK | Cleartext HTTP bloqué ou MJPEG off | `usesCleartextTraffic` dans `app.json` ; `PI_CAMERA_MJPEG=1` |
| App blanche avec Expo Go sans Mac | Metro arrêté | Installer l’**APK** buildée |
| Alertes silencieuses sur tablette | Volume / TTS OS | Monter le volume média ; tester bouton TTS en dev |

## 5. Mode kiosk (optionnel)

- Android : écran toujours allumé, lancer l’app au démarrage (launcher kiosk / « épingler l’app »).
- Voir aussi [README.md](./README.md) (notes terrain).

## Expo : continuer ou pas ?

| Mode | Sans Mac au quotidien ? |
|------|-------------------------|
| **Expo + APK installée** | Oui — Expo = outil de build et de code |
| **Expo Go + `expo start` sur Mac** | Non |
| **Expo web + Chrome localhost** | Non |

**Recommandation :** garder Expo pour développer le dashboard ; en patrouille, utiliser **une APK** pointée vers `10.42.0.1` et tout le backend sur la Pi.

## Fichiers liés

| Fichier | Rôle |
|---------|------|
| [`.env.example`](./.env.example) | Variables `EXPO_PUBLIC_*` |
| [`eas.json`](./eas.json) | Profils build Android |
| [`src/config/alertsWsUrl.ts`](./src/config/alertsWsUrl.ts) | Résolution WebSocket |
| [`src/config/cameraStreamUrl.ts`](./src/config/cameraStreamUrl.ts) | URL flux caméra |
