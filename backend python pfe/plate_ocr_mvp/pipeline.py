from __future__ import annotations

import base64
import os
from dataclasses import dataclass, replace
from typing import Dict, Optional

import cv2
import numpy as np

from .capture_exif import encode_jpeg_bgr_with_capture_exif
from .detector import YoloPlateDetector, YoloPlateDetectorConfig
from .local_ocr import LocalPlateOCR
from .postprocess import clean_plate_text
from .types import CaptureContext, PlateOCRResult
from .utils import encode_image_to_base64_jpeg, safe_crop_xyxy


@dataclass(frozen=True)
class PlateOCRPipelineConfig:
    detector_cfg: YoloPlateDetectorConfig
    paddle_lang: str = "en"
    save_cropped_plate: bool = True
    outputs_dir: str = "outputs"
    crop_padding_ratio: float = 0.06


def _with_capture_context(r: PlateOCRResult, ctx: Optional[CaptureContext]) -> PlateOCRResult:
    if ctx is None:
        return r
    return replace(
        r,
        latitude=ctx.latitude,
        longitude=ctx.longitude,
        captured_at_iso=ctx.captured_at_iso,
        infraction_number=ctx.infraction_number,
    )


class PlateOCRPipeline:
    def __init__(self, cfg: PlateOCRPipelineConfig) -> None:
        self.cfg = cfg
        self.detector = YoloPlateDetector(cfg.detector_cfg)
        self.ocr = LocalPlateOCR(paddle_lang=cfg.paddle_lang)

    @staticmethod
    def _to_dict(r: PlateOCRResult) -> Dict:
        return {
            "status": r.status,
            "plate_text": r.plate_text,
            "confidence": round(r.confidence, 4),
            "yolo_confidence": round(r.yolo_confidence, 4),
            "ocr_confidence": round(r.ocr_confidence, 4),
            "cropped_plate_image_path": r.cropped_plate_image_path,
            "cropped_plate_image_base64": r.cropped_plate_image_base64,
            "raw_ocr_text": r.raw_ocr_text,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "captured_at_iso": r.captured_at_iso,
            "infraction_number": r.infraction_number,
        }

    def _write_crop_to_disk(
        self,
        crop_bgr: np.ndarray,
        cropped_path: str,
        context: Optional[CaptureContext],
    ) -> str:
        os.makedirs(self.cfg.outputs_dir, exist_ok=True)
        if context is not None:
            jpeg_bytes = encode_jpeg_bgr_with_capture_exif(
                crop_bgr,
                captured_at_iso=context.captured_at_iso,
                infraction_number=context.infraction_number,
                latitude=context.latitude,
                longitude=context.longitude,
            )
            with open(cropped_path, "wb") as f:
                f.write(jpeg_bytes)
        else:
            cv2.imwrite(cropped_path, crop_bgr)
        return cropped_path

    @staticmethod
    def _crop_to_base64(crop_bgr: np.ndarray, context: Optional[CaptureContext]) -> str:
        if context is not None:
            jpeg_bytes = encode_jpeg_bgr_with_capture_exif(
                crop_bgr,
                captured_at_iso=context.captured_at_iso,
                infraction_number=context.infraction_number,
                latitude=context.latitude,
                longitude=context.longitude,
            )
            return base64.b64encode(jpeg_bytes).decode("utf-8")
        return encode_image_to_base64_jpeg(crop_bgr)

    def process_frame(
        self,
        frame_bgr: np.ndarray,
        *,
        output_stem: str = "frame",
        context: Optional[CaptureContext] = None,
    ) -> PlateOCRResult:
        detections = self.detector.detect(frame_bgr)
        if not detections:
            return _with_capture_context(
                PlateOCRResult(status="not_detected", plate_text="", confidence=0.0),
                context,
            )

        best_det = max(detections, key=lambda d: d.confidence)
        x1, y1, x2, y2 = best_det.bbox_xyxy

        crop_bgr = safe_crop_xyxy(frame_bgr, x1, y1, x2, y2, padding_ratio=self.cfg.crop_padding_ratio)
        if crop_bgr is None or crop_bgr.size == 0:
            return _with_capture_context(
                PlateOCRResult(
                    status="low_confidence",
                    plate_text="",
                    confidence=0.0,
                    yolo_confidence=best_det.confidence,
                ),
                context,
            )

        cropped_path = None
        if self.cfg.save_cropped_plate:
            cropped_path = os.path.join(self.cfg.outputs_dir, f"{output_stem}_plate.jpg")
            self._write_crop_to_disk(crop_bgr, cropped_path, context)
        cropped_b64 = self._crop_to_base64(crop_bgr, context)

        raw_text, ocr_conf = self.ocr.recognize(crop_bgr)
        cleaned = clean_plate_text(raw_text)

        yolo_conf = float(best_det.confidence)

        if not cleaned:
            return _with_capture_context(
                PlateOCRResult(
                    status="low_confidence",
                    plate_text="",
                    confidence=0.0,
                    yolo_confidence=yolo_conf,
                    ocr_confidence=ocr_conf,
                    cropped_plate_image_path=cropped_path,
                    cropped_plate_image_base64=cropped_b64,
                    raw_ocr_text=raw_text,
                ),
                context,
            )

        return _with_capture_context(
            PlateOCRResult(
                status="success",
                plate_text=cleaned,
                confidence=yolo_conf,
                yolo_confidence=yolo_conf,
                ocr_confidence=ocr_conf,
                cropped_plate_image_path=cropped_path,
                cropped_plate_image_base64=cropped_b64,
                raw_ocr_text=raw_text,
            ),
            context,
        )

    def process_image(self, image_path: str, *, context: Optional[CaptureContext] = None) -> Dict:
        image_bgr = cv2.imread(image_path)
        if image_bgr is None:
            raise FileNotFoundError(f"Could not read image: {image_path}")
        stem = os.path.splitext(os.path.basename(image_path))[0]
        return self._to_dict(self.process_frame(image_bgr, output_stem=stem, context=context))

    def process_video(
        self,
        video_path: str,
        *,
        max_frames: int = 30,
        frame_step: int = 1,
        output_stem: str = "video",
        context: Optional[CaptureContext] = None,
    ) -> Dict:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise FileNotFoundError(f"Could not open video: {video_path}")

        best: Optional[PlateOCRResult] = None
        idx = 0
        processed = 0

        while processed < max_frames:
            if not cap.grab():
                break
            if idx % frame_step != 0:
                idx += 1
                continue
            ret, frame = cap.retrieve()
            if not ret or frame is None:
                break
            processed += 1
            res = self.process_frame(frame, output_stem=f"{output_stem}_f{idx:04d}", context=context)
            if best is None or res.confidence > best.confidence:
                best = res
            idx += 1

        cap.release()
        if best is None:
            return self._to_dict(
                _with_capture_context(
                    PlateOCRResult(status="not_detected", plate_text="", confidence=0.0),
                    context,
                )
            )
        return self._to_dict(best)
