#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

CLEAR_CACHE=""
for arg in "$@"; do
  if [[ "$arg" == "--clear" ]]; then
    CLEAR_CACHE="--clear"
  fi
done

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [[ -z "${LAN_IP}" ]]; then
  LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi

if lsof -ti:8081 >/dev/null 2>&1; then
  echo "Metro tourne déjà sur 8081."
  echo "Si l'app affiche encore « Main / AI OCR » ou d'anciens textes :"
  echo "  npm run start:mobile:clean"
  echo "  puis sur le téléphone : secouer → Reload (ou fermer Expo Go et rescanner le QR)"
else
  echo "Démarrage de Metro…"
fi

echo ""
echo "=== Expo Go — téléphone (SDK 54) ==="
echo ""
if [[ -n "${LAN_IP}" ]]; then
  echo "IP Mac : ${LAN_IP}  →  exp://${LAN_IP}:8081"
  export REACT_NATIVE_PACKAGER_HOSTNAME="${LAN_IP}"
else
  echo "Aucune IP Wi‑Fi détectée."
fi
echo ""
echo "IMPORTANT — éviter « bundle is updating » en boucle :"
echo "  1. Attendez la 1re ligne « Android Bundled … (1438 modules) » (~6 s)"
echo "  2. Scannez le QR seulement APRÈS (pas pendant le rebuild)"
echo "  3. N'utilisez --clear que si l'app bug : npm run start:mobile:clean"
echo "  4. Ne sauvegardez pas de fichiers dans Cursor pendant le chargement"
echo ""
echo "Mode stable (sans Fast Refresh) : npm run start:mobile:stable"
echo ""

exec npx expo start --lan ${CLEAR_CACHE}
