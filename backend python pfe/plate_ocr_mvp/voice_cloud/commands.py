from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Sequence, Tuple

# Stable IDs for app handlers (extend as needed).
DEFAULT_COMMAND_PHRASES: Dict[str, Tuple[str, ...]] = {
    "take_photo": (
        "prendre photo",
        "prends une photo",
        "prend une photo",
        "prendre une photo",
        "une photo",
    ),
    "parking_infraction": (
        "infraction stationnement",
        "infraction de stationnement",
        "signaler une infraction de stationnement",
    ),
}


def normalize_french_text(text: str) -> str:
    """Lowercase, strip accents, collapse whitespace."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_like = "".join(c for c in nfkd if not unicodedata.combining(c))
    ascii_like = ascii_like.lower()
    ascii_like = re.sub(r"\s+", " ", ascii_like).strip()
    return ascii_like


class CommandMatcher:
    """Map transcript to a command id: substring match, else fuzzy ratio vs phrases."""

    def __init__(
        self,
        command_phrases: Optional[Dict[str, Sequence[str]]] = None,
        *,
        fuzzy_threshold: float = 0.72,
    ) -> None:
        raw = command_phrases or DEFAULT_COMMAND_PHRASES
        self._by_id: Dict[str, List[str]] = {}
        for cid, phrases in raw.items():
            normed = [normalize_french_text(p) for p in phrases if p and p.strip()]
            normed.sort(key=len, reverse=True)
            self._by_id[cid] = normed
        self._fuzzy_threshold = fuzzy_threshold

    def match(self, transcription: str) -> Tuple[Optional[str], float]:
        t = normalize_french_text(transcription)
        if not t:
            return None, 0.0

        best_id: Optional[str] = None
        best_score = 0.0

        for cid, phrases in self._by_id.items():
            for phrase in phrases:
                if not phrase:
                    continue
                if phrase in t:
                    return cid, 1.0
                ratio = SequenceMatcher(None, phrase, t).ratio()
                if ratio > best_score:
                    best_score = ratio
                    best_id = cid

        if best_id is not None and best_score >= self._fuzzy_threshold:
            return best_id, float(best_score)
        return None, float(best_score)
