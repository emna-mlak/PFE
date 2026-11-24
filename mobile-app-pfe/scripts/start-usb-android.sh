#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v adb >/dev/null 2>&1; then
  echo "adb introuvable. Installez Android platform-tools ou Android Studio."
  exit 1
fi

DEVICES="$(adb devices | awk 'NR>1 && $2=="device" { print $1 }')"
if [[ -z "${DEVICES}" ]]; then
  echo "Aucun téléphone Android détecté en USB."
  echo "Activez Options développeur → Débogage USB, acceptez la clé RSA, rebranchez."
  adb devices
  exit 1
fi

echo ""
echo "=== Android USB ==="
adb reverse tcp:8081 tcp:8081
echo "adb reverse : téléphone:8081 → Mac:8081"
echo "QR : exp://127.0.0.1:8081"
echo "Attendez « Android Bundled … (1438 modules) » avant d'ouvrir Expo Go."
echo ""

exec npx expo start --localhost "$@"
