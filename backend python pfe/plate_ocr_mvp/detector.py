from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

import cv2
import numpy as np
from ultralytics import YOLO

from .types import Detection


@dataclass
class YoloPlateDetectorConfig:
    weights_path: str
    conf_threshold: float = 0.25
    iou_threshold: float = 0.45
    plate_class_id: Optional[int] = None
    # Higher imgsz = better small-object detection. 960 or 1280 recommended.
    infer_imgsz: int = 1280
    # Run inference with test-time augmentation (flip + multi-scale)
    augment: bool = True


class YoloPlateDetector:
    def __init__(self, config: YoloPlateDetectorConfig) -> None:
        self.config = config
        self.model = YOLO(config.weights_path)

        resolved: Optional[int] = config.plate_class_id
        names = getattr(self.model, "names", None)
        if resolved is None and names:
            try:
                num_classes = len(names)
            except TypeError:
                num_classes = None
            if num_classes == 1:
                resolved = 0
            elif num_classes is not None and num_classes > 1:
                raise ValueError(
                    "YOLO model has multiple classes but pipeline expects plate-only. "
                    "Pass plate_class_id explicitly."
                )
        self._plate_class_id = resolved

    def _validate_plate_aspect(self, x1: int, y1: int, x2: int, y2: int) -> bool:
        """Reject detections that don't look like a plate (aspect ratio filter)."""
        w = max(1, x2 - x1)
        h = max(1, y2 - y1)
        ratio = w / h
        # Tunisian plates are wide rectangles: ratio typically 3:1 to 6:1
        return 1.5 <= ratio <= 8.0

    def detect(self, image_bgr: np.ndarray) -> List[Detection]:
        results = self.model.predict(
            source=image_bgr,
            conf=self.config.conf_threshold,
            iou=self.config.iou_threshold,
            imgsz=self.config.infer_imgsz,
            augment=self.config.augment,
            verbose=False,
        )

        detections: List[Detection] = []
        for r in results:
            if r.boxes is None or len(r.boxes) == 0:
                continue
            for b in r.boxes:
                cls_id = int(b.cls.item()) if b.cls is not None else None
                if self._plate_class_id is not None and cls_id != self._plate_class_id:
                    continue
                conf = float(b.conf.item()) if b.conf is not None else 0.0
                x1, y1, x2, y2 = [int(v) for v in b.xyxy[0].tolist()]

                if not self._validate_plate_aspect(x1, y1, x2, y2):
                    continue

                detections.append(Detection(
                    bbox_xyxy=(x1, y1, x2, y2),
                    confidence=conf,
                    class_id=cls_id,
                ))
        return detections