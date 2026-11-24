#!/usr/bin/env python3
"""
Pre-download faster-whisper (CTranslate2) weights for offline use on Raspberry Pi.

Run once while the Pi has Internet (USB tethering, Wi-Fi with DNS):

  cd ~/backend-python-pfe
  source .venv/bin/activate
  python scripts/download_whisper_model.py --model base

Then in .env:

  VOICE_LOCAL_MODEL=base
  VOICE_WHISPER_DOWNLOAD_ROOT=models/whisper
  VOICE_WHISPER_LOCAL_FILES_ONLY=1

  sudo systemctl restart terrain-backend-api
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def main() -> None:
    from dotenv import load_dotenv

    load_dotenv(PROJECT_ROOT / ".env")

    parser = argparse.ArgumentParser(description="Cache Whisper model for offline STT")
    parser.add_argument(
        "--model",
        default=os.environ.get("VOICE_LOCAL_MODEL", "base"),
        help="tiny | base | small | medium (default: base, or VOICE_LOCAL_MODEL)",
    )
    parser.add_argument(
        "--download-root",
        default=os.environ.get("VOICE_WHISPER_DOWNLOAD_ROOT", "models/whisper"),
        help="Cache directory under repo (default models/whisper)",
    )
    parser.add_argument(
        "--device",
        default=os.environ.get("VOICE_LOCAL_DEVICE", "cpu"),
    )
    parser.add_argument(
        "--compute-type",
        default=os.environ.get("VOICE_LOCAL_COMPUTE_TYPE", "int8"),
    )
    args = parser.parse_args()

    root = Path(args.download_root).expanduser()
    if not root.is_absolute():
        root = PROJECT_ROOT / root
    root.mkdir(parents=True, exist_ok=True)
    hf_home = root / "hf_home"
    hf_home.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(hf_home)
    os.environ["HUGGINGFACE_HUB_CACHE"] = str(hf_home / "hub")

    print(f"[download_whisper] model={args.model!r} cache={root}", flush=True)
    print("[download_whisper] This requires Internet (Hugging Face Hub).", flush=True)

    from faster_whisper import WhisperModel  # noqa: PLC0415

    model = WhisperModel(
        args.model,
        device=args.device,
        compute_type=args.compute_type,
        download_root=str(root),
    )
    # Touch inference so weights are fully ready
    import numpy as np

    silence = np.zeros(16000, dtype=np.float32)
    list(model.transcribe(silence, language="fr", beam_size=1))

    print("[download_whisper] OK — add to ~/backend-python-pfe/.env :", flush=True)
    print(f"  VOICE_LOCAL_MODEL={args.model}", flush=True)
    print(f"  VOICE_WHISPER_DOWNLOAD_ROOT={args.download_root}", flush=True)
    print("  VOICE_WHISPER_LOCAL_FILES_ONLY=1", flush=True)
    print("  sudo systemctl restart terrain-backend-api", flush=True)


if __name__ == "__main__":
    main()
