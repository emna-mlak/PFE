from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _is_video(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in {".mp4", ".mov", ".mkv", ".avi", ".webm"}


def main() -> None:
    from dotenv import load_dotenv
    load_dotenv()

    from plate_ocr_mvp.detector import YoloPlateDetectorConfig
    from plate_ocr_mvp.pipeline import PlateOCRPipeline, PlateOCRPipelineConfig

    parser = argparse.ArgumentParser(description="License Plate Detection + OCR (Gemini)")
    parser.add_argument("--input", required=True, help="Path to image or video")
    parser.add_argument("--detector-weights", default="models/best.pt", help="YOLO weights (.pt)")
    parser.add_argument("--output-dir", default="outputs", help="Where to save cropped plates")
    parser.add_argument("--yolo-conf", type=float, default=0.25, help="YOLO confidence threshold")
    parser.add_argument("--max-frames", type=int, default=30, help="Max frames (video only)")
    parser.add_argument("--frame-step", type=int, default=1, help="Process every Nth frame (video only)")
    parser.add_argument("--latitude", type=float, default=None, help="GPS (capture contextualisée)")
    parser.add_argument("--longitude", type=float, default=None, help="GPS (capture contextualisée)")
    parser.add_argument("--captured-at", type=str, default=None, help="ISO-8601 datetime")
    parser.add_argument("--infraction-number", type=str, default=None, help="N° d'infraction")
    args = parser.parse_args()

    from plate_ocr_mvp.types import CaptureContext
    from datetime import datetime, timezone
    import uuid

    ctx = None
    if any(
        v is not None
        for v in (args.latitude, args.longitude, args.captured_at, args.infraction_number)
    ):
        ctx = CaptureContext(
            latitude=args.latitude,
            longitude=args.longitude,
            captured_at_iso=(
                args.captured_at
                if args.captured_at
                else datetime.now(timezone.utc).isoformat()
            ),
            infraction_number=(
                args.infraction_number.strip()
                if args.infraction_number and args.infraction_number.strip()
                else f"INF-{uuid.uuid4().hex[:12].upper()}"
            ),
        )

    pipeline = PlateOCRPipeline(PlateOCRPipelineConfig(
        detector_cfg=YoloPlateDetectorConfig(
            weights_path=args.detector_weights,
            conf_threshold=args.yolo_conf,
        ),
        outputs_dir=args.output_dir,
    ))

    if _is_video(args.input):
        result = pipeline.process_video(
            args.input,
            max_frames=args.max_frames,
            frame_step=args.frame_step,
            context=ctx,
        )
    else:
        result = pipeline.process_image(args.input, context=ctx)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
