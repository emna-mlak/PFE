#!/usr/bin/env bash
# Compile une APK Android et l’installe sur le téléphone branché en USB (adb).
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v adb >/dev/null 2>&1; then
  echo "Erreur : adb introuvable. Installez Android platform-tools (Android Studio)."
  exit 1
fi

DEVICES="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
if [[ -z "${DEVICES}" ]]; then
  echo "Aucun téléphone détecté. Branchez-le en USB, activez le débogage USB, acceptez l’autorisation."
  adb devices -l
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Attention : fichier .env absent — l’APK n’aura pas les URLs Pi/Convex."
  echo "Copiez .env.example vers .env avant de compiler."
fi

echo "=== 1/3 Prebuild Android (icône ONSR, permissions) ==="
npx expo prebuild --platform android --clean

echo ""
echo "=== 2/3 Compilation APK (JS inclus, sans Metro) ==="
cd android
./gradlew assembleRelease
cd ..

APK="android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "${APK}" ]]; then
  echo "APK introuvable : ${APK}"
  exit 1
fi

echo ""
echo "=== 3/3 Installation sur le téléphone ==="
adb install -r "${APK}"

echo ""
echo "Terminé. Ouvrez « ONSR Agent » dans le tiroir d’applications."
echo "Modifié le .env ? Relancez : npm run build:android:phone"
