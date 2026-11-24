#!/usr/bin/env bash
# Installation une fois sur la Raspberry Pi : démarre l’API FastAPI au boot (systemd).
# Usage sur la Pi (depuis le clone du dépôt, ex. ~/backend-python-pfe) :
#   chmod +x scripts/raspberry-pi/install-terrain-backend-service.sh
#   sudo ./scripts/raspberry-pi/install-terrain-backend-service.sh
#
# Prérequis : .venv créé, pip install -r requirements.txt, .env du projet (PI_CAMERA_MJPEG=1, etc.)
# Si vous utilisez déjà Docker sur le port 8000, ne lancez pas ce script (conflit de port).
# L’unité systemd utilise PermissionsStartOnly + fuser sur 8000 en ExecStartPre (root) pour éviter EADDRINUSE.
# Bridge OCR séparé : voir scripts/raspberry-pi/pfe-vision.service.example (--input backend-mjpeg, pas picamera2).

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Utilisez : sudo bash $0"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_SRC="${SCRIPT_DIR}/terrain-backend-api.service"
SERVICE_DST="/etc/systemd/system/terrain-backend-api.service"

if [[ ! -f "${SERVICE_SRC}" ]]; then
  echo "Fichier introuvable : ${SERVICE_SRC}"
  exit 1
fi

if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Ports}}' 2>/dev/null | grep -qE ':8000->'; then
  echo "Attention : un conteneur Docker semble publier le port 8000."
  echo "Arrêtez-le avant d’installer ce service, ou adaptez la stack (un seul backend sur 8000)."
  exit 1
fi

cp -f "${SERVICE_SRC}" "${SERVICE_DST}"
chmod 644 "${SERVICE_DST}"
systemctl daemon-reload

# Libérer le port 8000 si un ancien uvicorn / autre processus écoute encore (sinon uvicorn échoue).
if ss -tlnp 2>/dev/null | grep -qE ':8000\b'; then
  echo "Port 8000 déjà utilisé — arrêt des processus sur ce port (fuser)…"
  fuser -k 8000/tcp 2>/dev/null || true
  sleep 2
fi

systemctl enable terrain-backend-api.service
systemctl restart terrain-backend-api.service

echo "Attente de l'écoute sur le port 8000 (import léger app.py)…"
ok=0
for i in $(seq 1 45); do
  if ss -tlnp 2>/dev/null | grep -q ':8000'; then
    ok=1
    break
  fi
  sleep 1
done

echo "--- terrain-backend-api.service ---"
systemctl --no-pager -l status terrain-backend-api.service || true
echo
if [[ "${ok}" -eq 1 ]]; then
  echo "Vérification : curl -sS --max-time 12 http://127.0.0.1:8000/health"
  curl -sS --max-time 12 "http://127.0.0.1:8000/health" && echo || echo "(curl échoué)"
else
  echo "Le port 8000 n'est pas passé en LISTEN après 45 s — voir journal :"
  journalctl -u terrain-backend-api.service -e --no-pager | tail -80
fi
echo "(journal complet : journalctl -u terrain-backend-api.service -e --no-pager)"
