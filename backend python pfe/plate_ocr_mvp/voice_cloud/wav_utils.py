from __future__ import annotations

import io
import wave
from typing import Union

import numpy as np

from .audio_capture import WHISPER_SAMPLE_RATE


def float32_mono_to_wav_bytes(
    audio: np.ndarray,
    sample_rate: int = WHISPER_SAMPLE_RATE,
) -> bytes:
    """PCM int16 WAV in memory for upload to cloud STT APIs."""
    mono = np.clip(audio.astype(np.float64), -1.0, 1.0)
    pcm = (mono * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


AudioInput = Union[bytes, np.ndarray]


def ensure_wav_bytes(audio: AudioInput, sample_rate: int = WHISPER_SAMPLE_RATE) -> bytes:
    if isinstance(audio, np.ndarray):
        return float32_mono_to_wav_bytes(audio, sample_rate)
    return audio
