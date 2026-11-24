from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass(frozen=True)
class Detection:
    bbox_xyxy: Tuple[int, int, int, int]
    confidence: float
    class_id: Optional[int] = None


@dataclass(frozen=True)
class CaptureContext:
    """Métadonnées optionnelles pour une capture contextualisée (photo / vidéo → image)."""

    captured_at_iso: str
    infraction_number: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@dataclass(frozen=True)
class PlateOCRResult:
    status: str  # success | low_confidence | not_detected
    plate_text: str
    confidence: float
    yolo_confidence: float = 0.0
    ocr_confidence: float = 0.0
    cropped_plate_image_path: Optional[str] = None
    cropped_plate_image_base64: Optional[str] = None
    raw_ocr_text: Optional[str] = None
    # Contexte de capture (rempli si le client envoie des métadonnées)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    captured_at_iso: Optional[str] = None
    infraction_number: Optional[str] = None
