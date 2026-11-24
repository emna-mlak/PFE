from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional

import numpy as np

from .audio_capture import WHISPER_SAMPLE_RATE, record_seconds, record_until_silence
from .commands import CommandMatcher
from .stt_providers import CloudSpeechToText, create_stt_from_env
from .types import VoiceCommandResult


class CloudVoiceSession:
    """
    Orchestrates: local mic capture → WAV → cloud STT → French command matching.

    Plate OCR stays separate: use ``integration.dispatch_command`` with your handlers.
    """

    def __init__(
        self,
        stt: Optional[CloudSpeechToText] = None,
        matcher: Optional[CommandMatcher] = None,
        *,
        language_hint: str = "fr",
    ) -> None:
        self.stt = stt or create_stt_from_env()
        self.matcher = matcher or CommandMatcher()
        self._language_hint = language_hint

    def process_audio(
        self,
        audio_float32_mono: np.ndarray,
        *,
        sample_rate: int = WHISPER_SAMPLE_RATE,
    ) -> VoiceCommandResult:
        text, stt_conf, detected_lang = self.stt.transcribe(
            audio_float32_mono, sample_rate=sample_rate
        )
        cmd_id, cmd_conf = self.matcher.match(text)
        return VoiceCommandResult(
            transcription=text,
            command_id=cmd_id,
            stt_confidence=stt_conf,
            command_confidence=cmd_conf if cmd_id else 0.0,
            language=detected_lang or self._language_hint,
            stt_provider=self.stt.name,
        )

    def process_wav_bytes(self, wav_bytes: bytes) -> VoiceCommandResult:
        """If you already have WAV bytes from another source (e.g. uploaded file)."""
        import io
        import wave

        with wave.open(io.BytesIO(wav_bytes), "rb") as w:
            sr = w.getframerate()
            ch = w.getnchannels()
            sw = w.getsampwidth()
            n = w.getnframes()
            raw = w.readframes(n)
        if sw != 2:
            raise ValueError("Only 16-bit PCM WAV is supported in process_wav_bytes")
        pcm = np.frombuffer(raw, dtype=np.int16)
        if ch == 2:
            pcm = pcm.reshape(-1, 2).mean(axis=1).astype(np.int16)
        f32 = pcm.astype(np.float32) / 32768.0
        return self.process_audio(f32, sample_rate=sr)

    def process_uploaded_audio(
        self,
        file_bytes: bytes,
        *,
        filename: str = "audio.wav",
    ) -> VoiceCommandResult:
        """
        Process uploaded audio from mobile/web clients.

        - OpenAI provider: sends original encoded file directly (wav/m4a/mp3/…).
        - Other providers: expects 16-bit PCM WAV and falls back to ``process_wav_bytes``.
        """
        transcribe_file = getattr(self.stt, "transcribe_file_bytes", None)
        if callable(transcribe_file):
            text, stt_conf, detected_lang = transcribe_file(
                file_bytes,
                filename=Path(filename).name or "audio.wav",
            )
            cmd_id, cmd_conf = self.matcher.match(text)
            return VoiceCommandResult(
                transcription=text,
                command_id=cmd_id,
                stt_confidence=stt_conf,
                command_confidence=cmd_conf if cmd_id else 0.0,
                language=detected_lang or self._language_hint,
                stt_provider=self.stt.name,
            )
        return self.process_wav_bytes(file_bytes)

    def listen_once_fixed(self, duration_s: float = 3.0, **record_kw) -> VoiceCommandResult:
        audio = record_seconds(duration_s, **record_kw)
        return self.process_audio(audio)

    def listen_until_silence(self, **vad_kw) -> VoiceCommandResult:
        """
        Enregistre après détection de voix jusqu'au silence (fin de phrase).
        Paramètres passés à ``record_until_silence`` (max_duration_s, silence_duration_s, …).
        """
        audio = record_until_silence(**vad_kw)
        return self.process_audio(audio)

    def run_loop(
        self,
        on_result: Callable[[VoiceCommandResult], None],
        *,
        fixed_duration_s: float = 3.0,
        use_vad: bool = False,
        stop_on_keyboard_interrupt: bool = True,
    ) -> None:
        while True:
            try:
                if use_vad:
                    on_result(self.listen_until_silence())
                else:
                    on_result(self.listen_once_fixed(fixed_duration_s))
            except KeyboardInterrupt:
                if stop_on_keyboard_interrupt:
                    break
                raise
