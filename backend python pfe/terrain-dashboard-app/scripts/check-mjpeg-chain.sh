#!/usr/bin/env bash
# Vérifie la chaîne MJPEG Mac → proxy :8780 → Pi :8000 (ou sidecar :8001).
# Usage (Mac sur RPi-Hotspot) :
#   cd terrain-dashboard-app && bash scripts/check-mjpeg-chain.sh
#   CAMERA_UPSTREAM=http://10.42.0.1:8001/camera/mjpeg bash scripts/check-mjpeg-chain.sh

set -euo pipefail

PI_HOST="${PI_HOST:-10.42.0.1}"
PI_PORT="${PI_PORT:-8001}"
SIDECAR_PORT="${SIDECAR_PORT:-8001}"
API_PORT="${API_PORT:-8000}"
PROXY_PORT="${CAMERA_PROXY_PORT:-8780}"
UPSTREAM="${CAMERA_UPSTREAM:-http://${PI_HOST}:${SIDECAR_PORT}/camera/mjpeg}"
PROXY="http://127.0.0.1:${PROXY_PORT}"

red() { printf '\033[0;31m%s\033[0m\n' "$*"; }
grn() { printf '\033[0;32m%s\033[0m\n' "$*"; }
ylw() { printf '\033[1;33m%s\033[0m\n' "$*"; }

echo "=== Chaîne MJPEG ==="
echo "  Sidecar Pi : http://${PI_HOST}:${SIDECAR_PORT}/camera/mjpeg  (terrain-camera-mjpeg)"
echo "  API Pi     : http://${PI_HOST}:${API_PORT}/camera/mjpeg  (si PI_CAMERA_MJPEG=1 + picamera2 venv)"
echo "  Proxy Mac  : ${PROXY}/camera/mjpeg  (upstream: ${UPSTREAM})"
echo

health="$(curl -q -sS --max-time 8 "http://${PI_HOST}:${API_PORT}/health" 2>/dev/null || true)"
if [[ -z "${health}" ]]; then
  red "KO  Pi :${API_PORT}/health injoignable"
else
  grn "OK  Pi API /health"
  echo "    ${health}"
fi

side_health="$(curl -q -sS --max-time 5 "http://${PI_HOST}:${SIDECAR_PORT}/health" 2>/dev/null || true)"
if [[ -n "${side_health}" ]]; then
  grn "OK  Sidecar :${SIDECAR_PORT}/health → ${side_health}"
else
  ylw "WARN  Sidecar :${SIDECAR_PORT} absent — sudo systemctl enable --now terrain-camera-mjpeg"
fi
echo

test_stream() {
  local label="$1"
  local url="$2"
  local tmp
  tmp="$(mktemp)"
  local code size
  code="$(curl -q -sS -o "${tmp}" -w '%{http_code}' --max-time 25 "${url}" 2>/dev/null || echo 000)"
  size="$(wc -c < "${tmp}" | tr -d ' ')"
  rm -f "${tmp}"
  echo "${label} → HTTP ${code}, ${size} octets (25 s max)"
  if [[ "${code}" == "200" && "${size}" -gt 5000 ]]; then
    grn "OK  ${label}"
    return 0
  fi
  red "KO  ${label}"
  return 1
}

side_ok=0
api_ok=0
test_stream "Sidecar GET" "http://${PI_HOST}:${SIDECAR_PORT}/camera/mjpeg" && side_ok=1 || true
test_stream "API GET" "http://${PI_HOST}:${API_PORT}/camera/mjpeg" && api_ok=1 || true
echo

if [[ "${side_ok}" -eq 0 && "${api_ok}" -eq 0 ]]; then
  ylw "Aucun flux Pi — sidecar : journalctl -u terrain-camera-mjpeg -n 30"
fi

proxy_health="$(curl -q -sS --max-time 5 "${PROXY}/health" 2>/dev/null || true)"
if [[ -z "${proxy_health}" ]]; then
  ylw "WARN  Proxy :${PROXY_PORT} absent — lancer : npm run proxy:all"
else
  grn "OK  Proxy /health"
  echo "    ${proxy_health}"
fi

tmp_px="$(mktemp)"
code_px="$(curl -q -sS -o "${tmp_px}" -w '%{http_code}' --max-time 90 "${PROXY}/camera/mjpeg" 2>/dev/null || echo 000)"
size_px="$(wc -c < "${tmp_px}" | tr -d ' ')"
rm -f "${tmp_px}"
echo "Proxy GET /camera/mjpeg → HTTP ${code_px}, ${size_px} octets"
if [[ "${code_px}" == "200" && "${size_px}" -gt 5000 ]]; then
  grn "OK  Chaîne complète Mac → dashboard utilisable"
else
  ylw "Si Pi OK mais proxy KO : relancer CAMERA_UPSTREAM=${UPSTREAM} npm run proxy:all"
fi
