#!/usr/bin/env bash
# Recrée le venv Pi + PaddleOCR 2.x (évite SIGSEGV Paddle 3.x).
# Debian Trixie + caméra : préférer fix-pi-camera.sh (venv --system-site-packages + picamera2 apt).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if python3 -c "import libcamera" 2>/dev/null && python3 -c "from picamera2 import Picamera2" 2>/dev/null; then
  echo "==> Picamera2 système détecté — pour la caméra, utilisez plutôt :"
  echo "    bash scripts/raspberry-pi/fix-pi-camera.sh"
  echo "    (venv --system-site-packages ; évite rpi-libcamera pip sur Trixie)"
  echo ""
fi

pick_python() {
  if [[ -n "${PYTHON:-}" ]] && command -v "$PYTHON" >/dev/null 2>&1; then
    echo "$PYTHON"
    return 0
  fi
  local cand ver major minor
  for cand in python3.12 python3.11 python3.10 python3; do
    if ! command -v "$cand" >/dev/null 2>&1; then
      continue
    fi
    ver="$("$cand" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    major="${ver%%.*}"
    minor="${ver#*.}"
    if [[ "$major" -eq 3 && "$minor" -ge 13 ]]; then
      echo "  (ignore $cand → Python $ver, incompatible Paddle 2.6)" >&2
      continue
    fi
    if [[ "$major" -eq 3 && "$minor" -ge 10 ]]; then
      echo "$cand"
      return 0
    fi
  done
  return 1
}

install_python_via_uv() {
  if ! command -v uv >/dev/null 2>&1; then
    echo "==> Installation de uv (gestionnaire Python)…"
    curl -fsSL https://astral.sh/uv/install.sh | sh
    # shellcheck disable=SC1091
    [[ -f "$HOME/.local/bin/env" ]] && source "$HOME/.local/bin/env"
  fi
  if ! command -v uv >/dev/null 2>&1; then
    echo "Erreur : uv non disponible après installation."
    return 1
  fi
  echo "==> Téléchargement de Python 3.12 via uv (peut prendre 1–2 min)…"
  uv python install 3.12
  uv python find 3.12
}

PY="$(pick_python || true)"
if [[ -z "${PY:-}" ]]; then
  echo "Aucun Python 3.10–3.12 trouvé sur le système (Trixie = souvent 3.13 seulement)."
  if install_python_via_uv; then
    UV_PY="$(uv python find 3.12)"
    echo "==> Venv avec uv + $UV_PY"
    rm -rf .venv
    uv venv --python 3.12 .venv
    # shellcheck disable=SC1091
    source .venv/bin/activate
    uv pip install -U pip setuptools wheel
    uv pip install -r requirements.txt
    uv pip install 'paddleocr>=2.8.1,<3.0.0' 'paddlepaddle==2.6.2'
  else
    echo ""
    echo "Installez Python 3.12 manuellement, puis relancez ce script :"
    echo "  curl -fsSL https://astral.sh/uv/install.sh | sh && source ~/.local/bin/env"
    echo "  uv python install 3.12"
    echo "  PYTHON=\$(uv python find 3.12) bash scripts/install_pi_venv.sh"
    echo ""
    echo "Ou avec pyenv (compilation ~30–60 min sur Pi) :"
    echo "  curl -fsSL https://pyenv.run | bash"
    echo "  pyenv install 3.12.8 && pyenv shell 3.12.8"
    exit 1
  fi
else
  echo "==> Venv avec $PY ($("$PY" --version))"
  rm -rf .venv
  "$PY" -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install -U pip setuptools wheel
  pip install -r requirements.txt
  pip install 'paddleocr>=2.8.1,<3.0.0' 'paddlepaddle==2.6.2'
fi

python - <<'PY'
import paddle
import paddleocr
from plate_ocr_mvp.local_ocr import _paddleocr_major_version, OCR_PIPELINE_REVISION
print("paddlepaddle:", paddle.__version__)
print("paddleocr:", paddleocr.__version__, "major=", _paddleocr_major_version())
print("ocr_pipeline_revision:", OCR_PIPELINE_REVISION)
if _paddleocr_major_version() >= 3:
    raise SystemExit("ERREUR: paddleocr 3.x encore installé — relancer pip install 'paddleocr<3'")
print("OK — environnement Pi prêt.")
PY

echo ""
echo "Mettre à jour systemd si le chemin venv a changé, puis :"
echo "  sudo systemctl restart terrain-backend-api"
