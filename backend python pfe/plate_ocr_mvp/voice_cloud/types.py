from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class VoiceCommandResult:
    """Structured output after cloud STT + command matching."""

    transcription: str
    command_id: Optional[str]
    stt_confidence: float
    command_confidence: float
    language: Optional[str]
    stt_provider: str
