#!/usr/bin/env bash
# Trixie : caméra = Python système (libcamera 0.7 apt) ; OCR = venv 3.12 + paddle 2.6.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "==> 1/3 Paquets caméra (apt)"
sudo apt update
sudo apt install -y libcamera-apps python3-libcamera python3-picamera2 python3-opencv || true

echo "==> Test Picamera2 (python3 système)"
python3 -c "from picamera2 import Picamera2; print('system picamera2 OK')"

echo "==> 2/3 Restauration venv Paddle 3.12 (pas paddle 2.6 sur 3.13)"
bash "${ROOT}/scripts/raspberry-pi/restore-pi-venv-paddle.sh"

echo "==> 3/3 Service MJPEG sidecar (port 8001)"
if [[ -f /etc/systemd/system/terrain-camera-mjpeg.service ]]; then
  sudo systemctl daemon-reload
  sudo systemctl enable --now terrain-camera-mjpeg
else
  echo "Installer le service :"
  echo "  sudo cp ${ROOT}/scripts/raspberry-pi/terrain-camera-mjpeg.service /etc/systemd/system/"
  echo "  sudo systemctl daemon-reload && sudo systemctl enable --now terrain-camera-mjpeg"
fi

ENV_FILE="${ROOT}/.env"
touch "${ENV_FILE}"
grep -q '^PI_CAMERA_MJPEG=' "${ENV_FILE}" && sed -i 's/^PI_CAMERA_MJPEG=.*/PI_CAMERA_MJPEG=0/' "${ENV_FILE}" || echo 'PI_CAMERA_MJPEG=0' >> "${ENV_FILE}"
grep -q '^PI_CAMERA_BACKEND=' "${ENV_FILE}" && sed -i 's/^PI_CAMERA_BACKEND=.*/PI_CAMERA_BACKEND=picamera2/' "${ENV_FILE}" || echo 'PI_CAMERA_BACKEND=picamera2' >> "${ENV_FILE}"

sudo systemctl restart terrain-backend-api 2>/dev/null || true
sleep 2

echo ""
echo "Test caméra sidecar :"
curl -sS --max-time 5 http://127.0.0.1:8001/health || echo "(sidecar pas encore démarré)"
curl -sS --max-time 45 http://127.0.0.1:8001/camera/mjpeg -o /tmp/mjpeg_sidecar.bin || true
ls -l /tmp/mjpeg_sidecar.bin 2>/dev/null || true
echo ""
echo "Sur le Mac : CAMERA_UPSTREAM=http://10.42.0.1:8001/camera/mjpeg npm run proxy:all"
