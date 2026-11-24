#!/usr/bin/env bash
# Mode terrain : Metro ne pousse plus de rebundles au téléphone (CI=1).
# À utiliser pour tester OCR / infractions sans « bundle is updating ».
set -euo pipefail

cd "$(dirname "$0")/.."

lsof -ti:8081 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [[ -z "${LAN_IP}" ]]; then
  LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi

if [[ -n "${LAN_IP}" ]]; then
  export REACT_NATIVE_PACKAGER_HOSTNAME="${LAN_IP}"
fi

export CI=1
export FAST_REFRESH=false
export EXPO_NO_TYPESCRIPT_SETUP=1

echo ""
echo "=== Mode STABLE (tests OCR sur téléphone) ==="
echo ""
echo "IP Mac → exp://${LAN_IP:-?}:8081"
echo ""
echo "Metro en mode CI : pas de rebundle / Fast Refresh vers le téléphone."
echo ""
echo "Procédure :"
echo "  1. Attendez UNE ligne « Android Bundled … (1438 modules) »"
echo "  2. Attendez 10 s sans nouvelle ligne « Bundled »"
echo "  3. Ouvrez Expo Go et scannez le QR (ou rouvrez le projet)"
echo "  4. Préférez GALERIE plutôt que caméra (évite redémarrage Android)"
echo "  5. Ne secouez pas le téléphone (pas de Reload)"
echo ""
echo "USB Android : npm run start:usb-android:stable"
echo ""

exec npx expo start --lan --max-workers 1 "$@"
