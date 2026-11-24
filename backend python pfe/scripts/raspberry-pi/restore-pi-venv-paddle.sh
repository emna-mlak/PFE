#!/usr/bin/env bash
# Restaure le venv Python 3.12 + Paddle 2.6 (OCR) après un venv 3.13 incompatible.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v uv >/dev/null 2>&1; then
  echo "Installation de uv…"
  curl -fsSL https://astral.sh/uv/install.sh | sh
  # shellcheck disable=SC1091
  [[ -f "$HOME/.local/bin/env" ]] && source "$HOME/.local/bin/env"
fi

echo "==> Venv Python 3.12 (Paddle 2.6 — pas disponible sur Python 3.13)"
rm -rf .venv
uv python install 3.12
uv venv --python 3.12 .venv
# shellcheck disable=SC1091
source .venv/bin/activate

# Sur Trixie, « pip » seul peut viser le Python système (PEP 668) — toujours uv pip ou python -m pip du venv.
uv pip install --python "${ROOT}/.venv" -U pip setuptools wheel
uv pip install --python "${ROOT}/.venv" -r requirements.txt
uv pip install --python "${ROOT}/.venv" 'paddleocr>=2.8.1,<3.0.0' 'paddlepaddle==2.6.2'

"${ROOT}/.venv/bin/python" - <<'PY'
import paddle
import paddleocr
print("paddle", paddle.__version__, "paddleocr", paddleocr.__version__)
PY

echo ""
echo "OK — OCR dans .venv. Caméra : service terrain-camera-mjpeg (port 8001, python3 système)."
echo "  sudo systemctl restart terrain-backend-api"
