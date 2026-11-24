from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import cv2

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Raspberry Pi camera loop for local plate detection/OCR."
    )
    parser.add_argument(
        "--interval-sec",
        type=float,
        default=float(os.environ.get("OCR_CAPTURE_INTERVAL_SEC", "1.5")),
        help="Seconds between captures in continuous mode",
    )
    parser.add_argument("--max-frames", type=int, default=0, help="0 means run forever")
    parser.add_argument("--camera-width", type=int, default=1280, help="Camera width")
    parser.add_argument("--camera-height", type=int, default=720, help="Camera height")
    parser.add_argument("--camera-index", type=int, default=0, help="Fallback OpenCV camera index")
    parser.add_argument("--detector-weights", default=os.environ.get("YOLO_WEIGHTS", "models/best.pt"))
    parser.add_argument("--output-dir", default=os.environ.get("OUTPUTS_DIR", "outputs"))
    parser.add_argument("--paddle-lang", default=os.environ.get("PADDLE_OCR_LANG", "en"))
    parser.add_argument("--yolo-conf", type=float, default=float(os.environ.get("YOLO_CONF_THRESHOLD", "0.25")))
    parser.add_argument("--yolo-imgsz", type=int, default=int(os.environ.get("YOLO_INFER_IMGSZ", "960")))
    parser.add_argument("--yolo-augment", action="store_true", default=_env_bool("YOLO_AUGMENT", False))
    parser.add_argument(
        "--on-demand",
        action="store_true",
        help="Wait for Enter and process one capture per request (instead of continuous loop).",
    )
    parser.add_argument(
        "--camera-backend",
        choices=("auto", "picamera2", "opencv"),
        default=os.environ.get("PI_CAMERA_BACKEND", "auto"),
        help="Camera backend preference",
    )
    return parser


def _open_picamera2(width: int, height: int):
    from picamera2 import Picamera2  # type: ignore[import-untyped]

    camera = Picamera2()
    config = camera.create_preview_configuration(
        main={"size": (width, height), "format": "RGB888"}
    )
    camera.configure(config)
    camera.start()
    time.sleep(1.0)
    return camera


def _open_opencv(index: int, width: int, height: int):
    cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        raise RuntimeError(f"OpenCV camera index {index} is not available.")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    return cap


def main() -> None:
    from dotenv import load_dotenv

    load_dotenv()

    from plate_ocr_mvp.detector import YoloPlateDetectorConfig
    from plate_ocr_mvp.pipeline import PlateOCRPipeline, PlateOCRPipelineConfig

    args = _build_parser().parse_args()

    pipeline = PlateOCRPipeline(
        PlateOCRPipelineConfig(
            detector_cfg=YoloPlateDetectorConfig(
                weights_path=args.detector_weights,
                conf_threshold=args.yolo_conf,
                infer_imgsz=args.yolo_imgsz,
                augment=args.yolo_augment,
            ),
            paddle_lang=args.paddle_lang,
            outputs_dir=args.output_dir,
        )
    )

    source_name = "unknown"
    picam2 = None
    cap = None

    try:
        if args.camera_backend in {"auto", "picamera2"}:
            try:
                picam2 = _open_picamera2(args.camera_width, args.camera_height)
                source_name = "picamera2"
            except Exception:
                if args.camera_backend == "picamera2":
                    raise

        if picam2 is None:
            cap = _open_opencv(args.camera_index, args.camera_width, args.camera_height)
            source_name = "opencv"

        processed = 0
        while True:
            if args.on_demand:
                try:
                    input("[pi_camera_loop] Press Enter to capture (Ctrl+C to quit)... ")
                except EOFError:
                    break

            ts = datetime.now(timezone.utc)
            output_stem = f"{ts.strftime('%Y%m%dT%H%M%S')}_{uuid.uuid4().hex[:6]}"

            if picam2 is not None:
                frame_rgb = picam2.capture_array()
                frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
            else:
                assert cap is not None
                ok, frame_bgr = cap.read()
                if not ok or frame_bgr is None:
                    raise RuntimeError("Could not read frame from OpenCV camera.")

            result = pipeline.process_frame(frame_bgr, output_stem=output_stem)
            payload = pipeline._to_dict(result)
            payload["captured_at_iso"] = ts.isoformat()
            payload["camera_backend"] = source_name
            print(json.dumps(payload, ensure_ascii=False), flush=True)

            processed += 1
            if args.max_frames > 0 and processed >= args.max_frames:
                break
            if not args.on_demand:
                time.sleep(max(args.interval_sec, 0.0))
    finally:
        if picam2 is not None:
            picam2.stop()
        if cap is not None:
            cap.release()


if __name__ == "__main__":
    main()
