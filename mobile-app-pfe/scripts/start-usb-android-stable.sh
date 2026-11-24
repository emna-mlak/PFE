#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v adb >/dev/null 2>&1; then
  echo "adb introuvable."
  exit 1
fi

DEVICES="$(adb devices | awk 'NR>1 && $2=="device" { print $1 }')"
if [[ -z "${DEVICES}" ]]; then
  echo "Aucun téléphone Android USB détecté."
  adb devices
  exit 1
fi

lsof -ti:8081 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

export CI=1
export FAST_REFRESH=false
export EXPO_NO_TYPESCRIPT_SETUP=1

adb reverse tcp:8081 tcp:8081
echo "Mode STABLE + USB — QR exp://127.0.0.1:8081"
echo "Attendez le 1er « Android Bundled (1438 modules) » + 10 s."
echo ""

exec npx expo start --localhost --max-workers 1 "$@"
