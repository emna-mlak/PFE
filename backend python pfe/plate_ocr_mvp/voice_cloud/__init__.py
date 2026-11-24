from .commands import CommandMatcher, DEFAULT_COMMAND_PHRASES, normalize_french_text
from .integration import dispatch_command
from .session import CloudVoiceSession
from .stt_providers import (
    CloudSpeechToText,
    GeminiSpeechToText,
    LocalWhisperSTT,
    OpenAIWhisperCloud,
    create_stt_from_env,
)
from .types import VoiceCommandResult

__all__ = [
    "CloudSpeechToText",
    "CloudVoiceSession",
    "CommandMatcher",
    "DEFAULT_COMMAND_PHRASES",
    "GeminiSpeechToText",
    "LocalWhisperSTT",
    "OpenAIWhisperCloud",
    "VoiceCommandResult",
    "create_stt_from_env",
    "dispatch_command",
    "normalize_french_text",
]
