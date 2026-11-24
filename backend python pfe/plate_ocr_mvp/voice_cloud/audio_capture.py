from __future__ import annotations

from typing import Optional

import numpy as np

WHISPER_SAMPLE_RATE = 16000


def _require_sounddevice():
    try:
        import sounddevice as sd  # type: ignore[import-untyped]
        return sd
    except ImportError as e:
        raise ImportError(
            "Microphone capture needs sounddevice. pip install sounddevice "
            "(Raspberry Pi: sudo apt install -y portaudio19-dev)"
        ) from e


def record_seconds(
    duration_s: float,
    *,
    samplerate: int = WHISPER_SAMPLE_RATE,
    channels: int = 1,
    device: Optional[int] = None,
) -> np.ndarray:
    """Record mono float32 audio (local mic); audio is then sent to the cloud STT API."""
    sd = _require_sounddevice()
    n_frames = int(duration_s * samplerate)
    audio = sd.rec(
        n_frames,
        samplerate=samplerate,
        channels=channels,
        dtype="float32",
        device=device,
    )
    sd.wait()
    mono = audio.reshape(-1) if channels == 1 else audio[:, 0].copy()
    return np.clip(mono.astype(np.float32), -1.0, 1.0)


def rms_energy(chunk: np.ndarray) -> float:
    if chunk.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(chunk.astype(np.float64)))))


def record_until_silence(
    *,
    max_duration_s: float = 20.0,
    max_wait_voice_s: float = 30.0,
    pre_roll_s: float = 0.2,
    silence_duration_s: float = 1.0,
    silence_rms: float = 0.018,
    voice_rms: float = 0.038,
    block_s: float = 0.05,
    samplerate: int = WHISPER_SAMPLE_RATE,
    device: Optional[int] = None,
    voice_start_blocks: int = 5,
    min_speech_blocks: int = 14,
) -> np.ndarray:
    """
    Enregistrement « jusqu'au silence », avec garde-fous pour éviter les faux départs :

    1. **Déclenchement** seulement après ``voice_start_blocks`` blocs consécutifs au-dessus
       de ``voice_rms`` (évite pics de bruit / un seul bloc).
    2. **Fin sur silence** uniquement après au moins ``min_speech_blocks`` blocs enregistrés
       (évite arrêt immédiat après un faux départ ou une micro-coupure).

    Si aucune voix soutenue avant ``max_wait_voice_s``, retourne un buffer vide.
    """
    sd = _require_sounddevice()
    block_frames = max(1, int(block_s * samplerate))
    pre_roll_blocks = max(1, int(pre_roll_s / block_s))
    max_wait_blocks = max(1, int(max_wait_voice_s / block_s))
    silence_blocks_needed = max(1, int(silence_duration_s / block_s))
    max_recording_blocks = max(1, int(max_duration_s / block_s))

    voice_start_blocks = max(2, voice_start_blocks)
    min_speech_blocks = max(voice_start_blocks + 2, min_speech_blocks)

    ring: list[np.ndarray] = []
    triggered = False
    consecutive_loud = 0
    wait_blocks = 0
    recorded: list[np.ndarray] = []
    quiet_blocks = 0
    blocks_recorded = 0

    while True:
        block = sd.rec(
            block_frames,
            samplerate=samplerate,
            channels=1,
            dtype="float32",
            device=device,
        )
        sd.wait()
        mono = block.reshape(-1).astype(np.float32)
        ring.append(mono)
        if len(ring) > pre_roll_blocks + 400:
            ring.pop(0)

        e = rms_energy(mono)

        if not triggered:
            wait_blocks += 1
            if wait_blocks > max_wait_blocks:
                return np.zeros(0, dtype=np.float32)

            if e >= voice_rms:
                consecutive_loud += 1
            else:
                consecutive_loud = 0

            if consecutive_loud >= voice_start_blocks:
                triggered = True
                take = min(len(ring), pre_roll_blocks + voice_start_blocks)
                recorded = [b.copy() for b in ring[-take:]]
                blocks_recorded = len(recorded)
                quiet_blocks = 0
        else:
            recorded.append(mono.copy())
            blocks_recorded += 1

            if blocks_recorded >= min_speech_blocks:
                if e < silence_rms:
                    quiet_blocks += 1
                else:
                    quiet_blocks = 0
                if quiet_blocks >= silence_blocks_needed:
                    break

            if blocks_recorded >= max_recording_blocks:
                break

    if not recorded:
        return np.zeros(0, dtype=np.float32)
    out = np.concatenate(recorded, axis=0)
    return np.clip(out.astype(np.float32), -1.0, 1.0)
