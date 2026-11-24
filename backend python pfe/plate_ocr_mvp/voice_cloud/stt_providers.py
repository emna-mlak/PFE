from __future__ import annotations

import io
import os
import platform
from pathlib import Path
from abc import ABC, abstractmethod
from typing import Any, Optional, Tuple

from .wav_utils import ensure_wav_bytes


def _is_arm_device() -> bool:
    return platform.machine().lower() in {"aarch64", "arm64", "armv7l"}


def _default_voice_local_model() -> str:
    raw = os.environ.get("VOICE_LOCAL_MODEL")
    if raw and str(raw).strip():
        return str(raw).strip()
    return "base" if _is_arm_device() else "small"


def _resolve_whisper_download_root() -> Optional[Path]:
    """Cache CTranslate2 / Hugging Face Hub under the project (offline Pi)."""
    raw = (
        os.environ.get("VOICE_WHISPER_DOWNLOAD_ROOT", "").strip()
        or os.environ.get("HF_HOME", "").strip()
    )
    if not raw and _is_arm_device():
        raw = "models/whisper"
    if not raw:
        return None
    p = Path(raw).expanduser()
    if not p.is_absolute():
        # plate_ocr_mvp/voice_cloud -> repo root
        repo = Path(__file__).resolve().parents[2]
        p = repo / p
    p.mkdir(parents=True, exist_ok=True)
    hf_home = p / "hf_home"
    hf_home.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(hf_home))
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(hf_home / "hub"))
    return p


def _env_bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() not in {"0", "false", "no", "off"}


class CloudSpeechToText(ABC):
    """Pluggable STT backend (local or cloud)."""

    name: str = "abstract"

    @abstractmethod
    def transcribe(
        self, audio, *, sample_rate: int = 16000
    ) -> Tuple[str, float, Optional[str]]:
        """Returns ``(text, stt_confidence_0_1, detected_language_or_none)``. ``audio`` is float32 mono ndarray or WAV bytes."""


class OpenAIWhisperCloud(CloudSpeechToText):
    """
    OpenAI ``audio.transcriptions`` (Whisper-class model in the cloud).
    Env: ``OPENAI_API_KEY`` (or pass ``api_key``). Docs: platform.openai.com/docs/guides/speech-to-text
    """

    name = "openai_whisper"

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        model: str = "whisper-1",
        language: str = "fr",
    ) -> None:
        self._api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self._api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAIWhisperCloud")
        self._model = model
        self._language = language
        self._client = None

    def _get_client(self):
        if self._client is None:
            from openai import OpenAI  # type: ignore[import-untyped]

            self._client = OpenAI(api_key=self._api_key)
        return self._client

    def transcribe(self, audio, *, sample_rate: int = 16000) -> Tuple[str, float, Optional[str]]:
        wav_bytes = ensure_wav_bytes(audio, sample_rate)
        return self.transcribe_file_bytes(wav_bytes, filename="audio.wav")

    def transcribe_file_bytes(
        self,
        file_bytes: bytes,
        *,
        filename: str = "audio.wav",
    ) -> Tuple[str, float, Optional[str]]:
        """
        Transcribe already-encoded audio file bytes (wav/m4a/mp3/… supported by OpenAI).
        Useful for mobile uploads where conversion on server is not needed.
        """
        client = self._get_client()
        buf = io.BytesIO(file_bytes)
        buf.name = filename
        tr = client.audio.transcriptions.create(
            model=self._model,
            file=buf,
            language=self._language,
        )
        text = (getattr(tr, "text", None) or "").strip()
        # OpenAI does not expose word-level confidence; use heuristic when non-empty.
        conf = 0.92 if text else 0.0
        return text, conf, self._language


class GeminiSpeechToText(CloudSpeechToText):
    """
    Speech-to-text via Google Gemini multimodal API (audio in, text out).

    API key resolution (first match wins):
      1. Constructor ``api_key=...``
      2. ``VOICE_GEMINI_API_KEY`` — dedicated key for voice STT
      3. ``GEMINI_API_KEY`` — shared fallback

    Env:
      - ``VOICE_GEMINI_MODEL`` (optional, default ``gemini-2.5-flash``)
      - ``VOICE_GEMINI_LANGUAGE`` optional BCP-47 hint stored on results when the API does not return a language field.
    """

    name = "gemini"

    _STT_PROMPT = (
        "Transcribe the speech in this audio exactly. "
        "Output only the spoken words, with no labels, timestamps, or commentary."
    )

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        language_hint: Optional[str] = None,
    ) -> None:
        self._api_key = api_key or os.environ.get("VOICE_GEMINI_API_KEY") or os.environ.get(
            "GEMINI_API_KEY"
        )
        if not self._api_key:
            raise ValueError(
                "Set VOICE_GEMINI_API_KEY or GEMINI_API_KEY for GeminiSpeechToText"
            )
        self._model = model or os.environ.get("VOICE_GEMINI_MODEL", "gemini-2.5-flash")
        self._language_hint = language_hint or os.environ.get("VOICE_GEMINI_LANGUAGE", "fr")
        self._client = None

    def _get_client(self):
        if self._client is None:
            from google import genai

            self._client = genai.Client(api_key=self._api_key)
        return self._client

    def transcribe(self, audio, *, sample_rate: int = 16000) -> Tuple[str, float, Optional[str]]:
        wav_bytes = ensure_wav_bytes(audio, sample_rate)
        from google.genai import types

        client = self._get_client()
        response = client.models.generate_content(
            model=self._model,
            contents=[
                self._STT_PROMPT,
                types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
            ],
        )
        text = (getattr(response, "text", None) or "").strip()
        conf = 0.9 if text else 0.0
        lang = self._language_hint
        return text, conf, lang


class LocalWhisperSTT(CloudSpeechToText):
    """
    Local/offline STT using faster-whisper (no external API calls).

    Env:
      - ``VOICE_LOCAL_MODEL``: ``tiny`` | ``base`` | ``small`` | path to local CTranslate2 dir.
      - ``VOICE_WHISPER_DOWNLOAD_ROOT``: cache dir (default ``models/whisper`` under repo).
      - ``VOICE_WHISPER_LOCAL_FILES_ONLY``: ``1`` = never hit Hugging Face Hub (Pi offline).
      - ``VOICE_LOCAL_DEVICE``: ``cpu`` (default) or ``cuda``.
      - ``VOICE_LOCAL_COMPUTE_TYPE``: e.g. ``int8`` (cpu default), ``float16`` for cuda.
      - ``VOICE_LOCAL_LANGUAGE``: language hint, default ``fr``.
    """

    name = "local_whisper"

    def __init__(
        self,
        *,
        model: Optional[str] = None,
        device: Optional[str] = None,
        compute_type: Optional[str] = None,
        language: Optional[str] = None,
    ) -> None:
        self._model_name = model or _default_voice_local_model()
        self._device = (device or os.environ.get("VOICE_LOCAL_DEVICE", "cpu")).strip().lower()
        default_compute = "int8" if self._device == "cpu" else "float16"
        self._compute_type = compute_type or os.environ.get("VOICE_LOCAL_COMPUTE_TYPE", default_compute)
        self._language = language or os.environ.get("VOICE_LOCAL_LANGUAGE", "fr")
        self._download_root = _resolve_whisper_download_root()
        self._local_files_only = _env_bool("VOICE_WHISPER_LOCAL_FILES_ONLY", False)
        self._model = None

    def _whisper_model_kwargs(self) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "device": self._device,
            "compute_type": self._compute_type,
        }
        if self._download_root is not None:
            kwargs["download_root"] = str(self._download_root)
        if self._local_files_only:
            kwargs["local_files_only"] = True
        return kwargs

    def _get_model(self):
        if self._model is None:
            try:
                from faster_whisper import WhisperModel  # type: ignore[import-untyped]

                self._model = WhisperModel(
                    self._model_name,
                    **self._whisper_model_kwargs(),
                )
            except Exception as exc:
                err = str(exc).lower()
                if "name resolution" in err or "huggingface" in err or "hub" in err or "connect" in err:
                    raise RuntimeError(
                        "Whisper model not available offline. On the Pi (with Internet once): "
                        "cd ~/backend-python-pfe && source .venv/bin/activate && "
                        "python scripts/download_whisper_model.py --model "
                        f"{self._model_name!r}. "
                        "Then set VOICE_WHISPER_LOCAL_FILES_ONLY=1 in .env and restart terrain-backend-api."
                    ) from exc
                raise
        return self._model

    def transcribe(self, audio, *, sample_rate: int = 16000) -> Tuple[str, float, Optional[str]]:
        wav_bytes = ensure_wav_bytes(audio, sample_rate)

        # faster-whisper accepts file paths; decode wav bytes into float32 mono for in-memory usage.
        import wave

        import numpy as np

        with wave.open(io.BytesIO(wav_bytes), "rb") as w:
            sr = w.getframerate()
            ch = w.getnchannels()
            sw = w.getsampwidth()
            n = w.getnframes()
            raw = w.readframes(n)
        if sw != 2:
            raise ValueError("LocalWhisperSTT expects 16-bit PCM WAV input")
        pcm = np.frombuffer(raw, dtype=np.int16)
        if ch == 2:
            pcm = pcm.reshape(-1, 2).mean(axis=1).astype(np.int16)
        audio_f32 = pcm.astype(np.float32) / 32768.0

        model = self._get_model()
        segments, info = model.transcribe(
            audio_f32,
            language=self._language,
            beam_size=1,
            vad_filter=True,
        )
        parts = [seg.text.strip() for seg in segments if getattr(seg, "text", "").strip()]
        text = " ".join(parts).strip()
        conf = 0.85 if text else 0.0
        detected = getattr(info, "language", None) or self._language
        return text, conf, detected


def create_stt_from_env() -> CloudSpeechToText:
    """
    Factory for switching providers without changing session code.

    Env:
      - ``VOICE_STT_PROVIDER``: ``local`` (default), ``openai`` or ``gemini``.
      - ``VOICE_STRICT_OFFLINE``: when true (default), blocks all cloud STT providers.
      - ``VOICE_LOCAL_MODEL``: local Whisper model name (default ``small``).
      - ``VOICE_LOCAL_DEVICE``: ``cpu`` (default) or ``cuda``.
      - ``VOICE_LOCAL_COMPUTE_TYPE``: default ``int8`` on cpu.
      - ``OPENAI_API_KEY``: required for OpenAI.
      - ``VOICE_OPENAI_MODEL``: optional, default ``whisper-1``.
      - ``GEMINI_API_KEY``: Gemini (default shared key).
      - ``VOICE_GEMINI_API_KEY``: optional; if set, used for voice STT instead of ``GEMINI_API_KEY``.
      - ``VOICE_GEMINI_MODEL``: optional, default ``gemini-2.5-flash``.
    """
    strict_offline = _env_bool("VOICE_STRICT_OFFLINE", True)
    provider = (os.environ.get("VOICE_STT_PROVIDER") or "local").strip().lower()
    if strict_offline and provider != "local":
        raise ValueError(
            "VOICE_STRICT_OFFLINE is enabled. Cloud STT providers are blocked. "
            "Set VOICE_STT_PROVIDER=local."
        )
    if provider == "local":
        return LocalWhisperSTT()
    if provider == "openai":
        model = os.environ.get("VOICE_OPENAI_MODEL", "whisper-1")
        return OpenAIWhisperCloud(model=model)
    if provider == "gemini":
        return GeminiSpeechToText()
    raise ValueError(
        f"Unknown VOICE_STT_PROVIDER={provider!r}. Supported: local, openai, gemini. "
        "Add a CloudSpeechToText subclass and extend create_stt_from_env()."
    )
