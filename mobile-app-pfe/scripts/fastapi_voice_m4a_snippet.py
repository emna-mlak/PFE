# FastAPI: ne pas utiliser wave.open() / scipy.io.wavfile sur l'upload brut depuis Android (M4A/AAC).
# Dépendances: pip install pydub
# Système: ffmpeg doit être installé (brew install ffmpeg / apt install ffmpeg).
#
# Exemple: remplacer la lecture WAV par ceci avant STT / traitement.

from __future__ import annotations

import io
from typing import Tuple

from pydub import AudioSegment


def load_upload_as_wav_pcm16_mono(
    content: bytes,
    filename: str,
    target_sample_rate_hz: int = 16_000,
) -> Tuple[bytes, int]:
    """
    Retourne (pcm16_mono_bytes, sample_rate) prêts pour beaucoup de pipelines STT.
    """
    ext = (filename or "").lower().rsplit(".", 1)[-1]
    fmt_map = {
        "wav": "wav",
        "m4a": "mp4",
        "mp4": "mp4",
        "aac": "aac",
        "webm": "webm",
        "ogg": "ogg",
        "mp3": "mp3",
    }
    fmt = fmt_map.get(ext, "mp4")
    seg = AudioSegment.from_file(io.BytesIO(content), format=fmt)
    seg = seg.set_channels(1).set_frame_rate(target_sample_rate_hz)
    return seg.raw_data, target_sample_rate_hz
