# ONSR Agent — application mobile

Application Expo (TypeScript strict) pour les agents de terrain ONSR (contrôle routier, infractions, scan de plaque), avec Convex comme backend.

## Stack technique

- Expo SDK 54 (stable)
- TypeScript strict
- Expo Router
- TanStack React Query
- Convex (client + couche API dédiée)
- React Hook Form + Zod
- expo-camera + expo-av + expo-secure-store
- react-native-toast-message
- ESLint + Prettier

## Installation

```bash
npm install
cp .env.example .env
```

## Variables d'environnement

Renseigner `.env` (hotspot Pi, tout local) :

```env
EXPO_PUBLIC_CONVEX_URL=http://10.42.0.1:3210
EXPO_PUBLIC_CONVEX_HTTP_URL=http://10.42.0.1:3211
EXPO_PUBLIC_PYTHON_API_URL=http://10.42.0.1:8000
```

- **3210** : Convex self-hosted (login, infractions, storage)
- **8000** : FastAPI Pi (OCR `/api/plate-ocr`, voix `/api/voice-command`)

La position affichée dans l’app est la **latitude et la longitude** GPS (pas de conversion en adresse postale).

### Voir les dernières modifications dans Expo Go

Si l’interface affiche encore « Main / AI OCR » :

```bash
npm run start:mobile:clean
```

Puis sur le téléphone : **secouer → Reload**, ou fermer Expo Go et rescanner le QR. En bas de l’écran vous devez voir **`ONSR Agent · 2026-06-01 · v4`**.

Mode cloud Convex possible avec `https://….convex.cloud` si Internet disponible.

## Installer l’app sur le téléphone (APK, sans Expo Go)

Application autonome **ONSR Agent** avec icône sur l’écran d’accueil :

1. Vérifiez `.env` (URLs Pi : `10.42.0.1`, etc.)
2. Branchez le téléphone Android en **USB**
3. Activez **Options développeur** → **Débogage USB**, acceptez l’autorisation sur le téléphone
4. Sur le Mac :

```bash
npm run build:android:phone
```

Prérequis : **Android Studio** (SDK + platform-tools `adb`). La première compilation peut prendre 10–20 min.

Après installation, ouvrez **ONSR Agent** dans le tiroir — **Metro n’est plus nécessaire**.

Si vous voyez *« Unable to load script »* : l’ancienne APK était une version **debug sans JavaScript embarqué**. Réinstallez avec `npm run build:android:phone` (build **release** avec le bundle inclus).

## Lancer l'application

```bash
npm run start -- --clear
```

### Téléphone (Expo Go)

```bash
npm run start:mobile
```

Le téléphone doit être sur le **même Wi‑Fi** que le Mac. Si la connexion échoue :

- **Android + câble USB** : `npm run start:usb-android` (active `adb reverse`, puis scannez le QR `localhost`)
- **Réseau isolé (fac/campus)** : `npm run start:tunnel` (nécessite ngrok ; peut échouer hors ligne)
- **iOS** : Réglages → Expo Go → autoriser « Réseau local »
- Mettre à jour **Expo Go** (SDK 54, même version que le projet)

Raccourcis Expo:
- `a` Android
- `i` iOS
- `w` Web

## Vérification qualité

```bash
npm run typecheck
npm run lint
```

## Convex functions utilisées

- `agents.login({ email, password, deviceInfo? })`
- `agents.logout({ agentId, deviceInfo? })`
- `agents.getCurrentAgent({ authUserId })`
- `agents.setPassword({ agentId, newPassword })`
- `vehicules.getByMatricule({ matricule })`
- `vignettes.getByMatricule({ matricule })`
- `vignettes.getActiveByMatricule({ matricule })`
- `infractions.create(...)`
- `infractions.listByMatricule({ matricule })`
- `infractions.updateStatut({ idInfraction, statutInfraction })`
- `audit.logAction(...)`
- `audit.listByActorAgentId({ actorAgentId })`

## Implémenté maintenant

- Login email + mot de passe (validation, loading, erreurs)
- Session SecureStore (token, `agentId`, `authUserId`, profil)
- Dashboard avec actions principales
- Vérification manuelle véhicule
- Consultation véhicule + vignette active + infractions
- Création infraction + changement statut
- Journalisation audit des actions clés
- Profil agent (depuis session + refresh backend)
- Logs agent (`audit.listByActorAgentId`)
- Fondations Live Capture (permissions caméra/micro + état session)
- Écran setup/reset mot de passe (`agents.setPassword`)

## Placeholders OCR (future)

- `src/services/detection/pythonDetection.ts`
  - points d’intégration Python/OCR
  - aucune détection OCR implémentée
- `EXPO_PUBLIC_PYTHON_API_URL` réservé pour intégration ultérieure
