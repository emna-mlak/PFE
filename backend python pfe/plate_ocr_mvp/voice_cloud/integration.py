from __future__ import annotations

from typing import Callable, Dict

from .types import VoiceCommandResult


def dispatch_command(
    result: VoiceCommandResult,
    handlers: Dict[str, Callable[[VoiceCommandResult], None]],
) -> bool:
    """
    Invoke the handler for ``result.command_id`` if present. Keeps plate OCR and FastAPI
    decoupled: register ``take_photo``, ``parking_infraction``, etc. at the app boundary.
    """
    cid = result.command_id
    if not cid:
        return False
    fn = handlers.get(cid)
    if fn is None:
        return False
    fn(result)
    return True
