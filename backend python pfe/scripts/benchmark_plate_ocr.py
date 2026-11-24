#!/usr/bin/env python3
"""
Benchmark latence du pipeline plaque (YOLO + PaddleOCR).

Deux modes :
  - local : appelle PlateOCRPipeline in-process (mesure pure inférence, recommandé sur Pi)
  - http  : POST multipart vers /recognize_plate ou /api/plate-ocr (chemin production)

Exemples (sur la Raspberry Pi, dans ~/backend-python-pfe) :

  # Mesure locale — image de test
  source .venv/bin/activate
  python scripts/benchmark_plate_ocr.py --mode local --input chemin/vers/plaque.jpg

  # Capture caméra Pi puis 10 mesures
  python scripts/benchmark_plate_ocr.py --mode local --capture-from-camera --runs 10

  # Mesure HTTP (uvicorn déjà lancé sur :8000)
  python scripts/benchmark_plate_ocr.py --mode http --input chemin/vers/plaque.jpg --url http://127.0.0.1:8000/recognize_plate

Résultats : stdout (tableau) + JSON (--output, défaut outputs/benchmark_plate_ocr.json).
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import statistics
import sys
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@dataclass
class RunSample:
    index: int
    elapsed_ms: float
    status: str | None = None
    plate_text: str | None = None
    yolo_confidence: float | None = None


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    k = (len(ordered) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(ordered) - 1)
    if f == c:
        return ordered[f]
    return ordered[f] + (ordered[c] - ordered[f]) * (k - f)


def _summarize_ms(samples_ms: list[float]) -> dict[str, float]:
    if not samples_ms:
        return {}
    mean = statistics.mean(samples_ms)
    return {
        "count": float(len(samples_ms)),
        "min_ms": min(samples_ms),
        "max_ms": max(samples_ms),
        "mean_ms": mean,
        "median_ms": statistics.median(samples_ms),
        "p90_ms": _percentile(samples_ms, 90),
        "stdev_ms": statistics.pstdev(samples_ms) if len(samples_ms) > 1 else 0.0,
        "effective_fps": round(1000.0 / mean, 3) if mean > 0 else 0.0,
    }


def _load_image_bgr(path: Path):
    import cv2

    image_bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise RuntimeError(f"Could not read image: {path}")
    h, w = image_bgr.shape[:2]
    return image_bgr, w, h


def _is_arm_device() -> bool:
    return platform.machine().lower() in {"aarch64", "arm64", "armv7l"}


def _capture_via_system_python(width: int, height: int, out_path: Path) -> None:
    """Capture JPEG via /usr/bin/python3 + picamera2 (apt), hors venv Paddle."""
    import subprocess
    import textwrap

    out_path.parent.mkdir(parents=True, exist_ok=True)
    script = textwrap.dedent(
        f"""
        import time
        from pathlib import Path
        from picamera2 import Picamera2

        out = Path({str(out_path)!r})
        picam = Picamera2()
        picam.configure(
            picam.create_still_configuration(main={{"size": ({width}, {height})}})
        )
        picam.start()
        time.sleep(1.0)
        picam.capture_file(str(out))
        picam.stop()
        print(out)
        """
    ).strip()
    proc = subprocess.run(
        ["/usr/bin/python3", "-c", script],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0 or not out_path.is_file():
        err = (proc.stderr or proc.stdout or "unknown error").strip()
        raise RuntimeError(
            f"Capture système (/usr/bin/python3 + picamera2) échouée: {err}. "
            "Installez: sudo apt install -y python3-picamera2 libcamera-apps"
        )


def _capture_camera_bgr(width: int, height: int, backend: str):
    import cv2

    picam2 = None
    cap = None
    picam2_error: Exception | None = None
    try:
        if backend in {"auto", "picamera2"}:
            try:
                from picamera2 import Picamera2  # type: ignore[import-untyped]

                picam2 = Picamera2()
                config = picam2.create_preview_configuration(
                    main={"size": (width, height), "format": "RGB888"}
                )
                picam2.configure(config)
                picam2.start()
                time.sleep(1.0)
                frame_rgb = picam2.capture_array()
                frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
                return frame_bgr, width, height, "picamera2"
            except ModuleNotFoundError as exc:
                picam2_error = exc
                snap_dir = PROJECT_ROOT / "outputs" / "benchmark_snapshots"
                snap_dir.mkdir(parents=True, exist_ok=True)
                snap_path = snap_dir / f"benchmark_sys_{int(time.time())}.jpg"
                _capture_via_system_python(width, height, snap_path)
                image_bgr, w, h = _load_image_bgr(snap_path)
                return image_bgr, w, h, "picamera2:system-python"
            except Exception as exc:
                picam2_error = exc
                if backend == "picamera2":
                    raise RuntimeError(
                        f"Picamera2 failed: {exc!s}. "
                        "Sur Pi 5, arrêtez le flux MJPEG si actif: "
                        "sudo systemctl stop terrain-camera-mjpeg terrain-backend-api ; "
                        "ou utilisez --input avec une image."
                    ) from exc

        if _is_arm_device() and backend == "auto":
            hint = (
                f"Picamera2 error: {picam2_error!s}. "
                if picam2_error
                else "Picamera2 unavailable. "
            )
            raise RuntimeError(
                hint
                + "OpenCV ne fonctionne pas avec le Camera Module sur Pi 5. "
                "Essayez: --camera-backend picamera2 après avoir libéré la caméra "
                "(sudo fuser -v /dev/video*), ou --input chemin/image.jpg."
            )

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            raise RuntimeError("OpenCV camera index 0 is not available.")
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        ok, frame_bgr = cap.read()
        if not ok or frame_bgr is None:
            raise RuntimeError("Could not read frame from OpenCV camera.")
        h, w = frame_bgr.shape[:2]
        return frame_bgr, w, h, "opencv"
    finally:
        if picam2 is not None:
            picam2.stop()
        if cap is not None:
            cap.release()


def _build_local_pipeline():
    from dotenv import load_dotenv

    load_dotenv()

    from plate_ocr_mvp.detector import YoloPlateDetectorConfig
    from plate_ocr_mvp.pipeline import PlateOCRPipeline, PlateOCRPipelineConfig

    weights = os.environ.get("YOLO_WEIGHTS", "models/best.pt")
    conf = float(os.environ.get("YOLO_CONF_THRESHOLD", "0.25"))
    imgsz = int(os.environ.get("YOLO_INFER_IMGSZ", "640"))
    augment_raw = os.environ.get("YOLO_AUGMENT", "0")
    augment = augment_raw.strip().lower() in {"1", "true", "yes", "on"}
    paddle_lang = os.environ.get("PADDLE_OCR_LANG", "en")
    outputs_dir = os.environ.get("OUTPUTS_DIR", "outputs")

    pipeline = PlateOCRPipeline(
        PlateOCRPipelineConfig(
            detector_cfg=YoloPlateDetectorConfig(
                weights_path=weights,
                conf_threshold=conf,
                infer_imgsz=imgsz,
                augment=augment,
            ),
            paddle_lang=paddle_lang,
            outputs_dir=outputs_dir,
        )
    )
    config = {
        "weights": weights,
        "yolo_conf": conf,
        "yolo_imgsz": imgsz,
        "yolo_augment": augment,
        "paddle_lang": paddle_lang,
    }
    return pipeline, config


def _run_local_once(pipeline, image_bgr) -> tuple[float, dict[str, Any]]:
    stem = uuid.uuid4().hex[:12]
    t0 = time.perf_counter()
    result = pipeline.process_frame(image_bgr, output_stem=stem)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    payload = pipeline._to_dict(result)
    return elapsed_ms, payload


def _run_http_once(url: str, image_path: Path, timeout_sec: float) -> tuple[float, dict[str, Any]]:
    import requests

    t0 = time.perf_counter()
    with image_path.open("rb") as f:
        resp = requests.post(
            url,
            files={"file": (image_path.name, f, "image/jpeg")},
            timeout=timeout_sec,
        )
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    resp.raise_for_status()
    return elapsed_ms, resp.json()


def _print_report(summary: dict[str, Any]) -> None:
    stats = summary.get("stats", {})
    if not stats:
        print("Aucune mesure.", file=sys.stderr)
        return

    print()
    print("=" * 60)
    print("  BENCHMARK PLAQUE OCR — RÉSULTATS")
    print("=" * 60)
    print(f"  Mode          : {summary.get('mode')}")
    print(f"  Machine       : {summary.get('platform', {}).get('machine')}")
    print(f"  Image         : {summary.get('image', {}).get('source')}")
    print(f"  Dimensions    : {summary.get('image', {}).get('width')} x {summary.get('image', {}).get('height')}")
    print(f"  Runs mesurés  : {int(stats.get('count', 0))} (+ {summary.get('warmup_runs', 0)} warmup)")
    print("-" * 60)
    print(f"  Latence min   : {stats['min_ms']:.1f} ms")
    print(f"  Latence moy.  : {stats['mean_ms']:.1f} ms")
    print(f"  Latence méd.  : {stats['median_ms']:.1f} ms")
    print(f"  Latence P90   : {stats['p90_ms']:.1f} ms")
    print(f"  Latence max   : {stats['max_ms']:.1f} ms")
    print(f"  Écart-type    : {stats['stdev_ms']:.1f} ms")
    print(f"  Débit effectif: {stats['effective_fps']:.3f} analyses/s")
    print("-" * 60)
    last = summary.get("last_result") or {}
    if last.get("plate_text"):
        print(f"  Dernière plaque: {last.get('plate_text')} (status={last.get('status')})")
    print()
    print("  Pour le rapport LaTeX (copier-coller) :")
    print(
        f"  « Latence moyenne {stats['mean_ms']:.0f} ms "
        f"(médiane {stats['median_ms']:.0f} ms, P90 {stats['p90_ms']:.0f} ms), "
        f"soit {stats['effective_fps']:.2f} analyse(s)/s sur {summary.get('platform', {}).get('machine', 'edge')}. »"
    )
    print("=" * 60)
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark latence YOLO + PaddleOCR")
    parser.add_argument(
        "--mode",
        choices=("local", "http"),
        default="local",
        help="local = pipeline in-process ; http = POST API",
    )
    parser.add_argument("--input", help="Image JPEG/PNG/WebP (obligatoire sauf --capture-from-camera)")
    parser.add_argument(
        "--capture-from-camera",
        action="store_true",
        help="Capture une frame Picamera2/OpenCV (Pi) — mode local uniquement",
    )
    parser.add_argument("--camera-width", type=int, default=1280)
    parser.add_argument("--camera-height", type=int, default=720)
    default_cam_backend = os.environ.get("PI_CAMERA_BACKEND", "picamera2" if _is_arm_device() else "auto")
    parser.add_argument(
        "--camera-backend",
        choices=("auto", "picamera2", "opencv"),
        default=default_cam_backend,
    )
    parser.add_argument("--runs", type=int, default=10, help="Nombre de mesures (défaut 10)")
    parser.add_argument("--warmup", type=int, default=2, help="Runs ignorés avant mesure (défaut 2)")
    parser.add_argument(
        "--url",
        default=os.environ.get("OCR_BENCHMARK_URL", "http://127.0.0.1:8000/recognize_plate"),
        help="Endpoint HTTP (mode http)",
    )
    parser.add_argument("--http-timeout-sec", type=float, default=120.0)
    parser.add_argument(
        "--output",
        default="outputs/benchmark_plate_ocr.json",
        help="Fichier JSON de sortie",
    )
    args = parser.parse_args()

    if args.runs < 1:
        parser.error("--runs must be >= 1")
    if args.warmup < 0:
        parser.error("--warmup must be >= 0")
    if args.capture_from_camera and args.mode != "local":
        parser.error("--capture-from-camera requires --mode local")
    if not args.capture_from_camera and not args.input:
        parser.error("Provide --input or --capture-from-camera")

    image_bgr = None
    image_w = image_h = 0
    image_source = ""

    if args.capture_from_camera:
        image_bgr, image_w, image_h, cam_backend = _capture_camera_bgr(
            args.camera_width, args.camera_height, args.camera_backend
        )
        image_source = f"camera:{cam_backend}"
        # Sauvegarde pour reproductibilité / mode http
        snap_dir = PROJECT_ROOT / "outputs" / "benchmark_snapshots"
        snap_dir.mkdir(parents=True, exist_ok=True)
        snap_path = snap_dir / f"benchmark_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}.jpg"
        import cv2

        cv2.imwrite(str(snap_path), image_bgr)
        image_path = snap_path
        print(f"[benchmark] Frame capturée → {snap_path} ({image_w}x{image_h})", flush=True)
    else:
        image_path = Path(args.input).expanduser().resolve()
        if not image_path.is_file():
            parser.error(f"Image not found: {image_path}")
        image_bgr, image_w, image_h = _load_image_bgr(image_path)
        image_source = str(image_path)

    pipeline = None
    pipeline_config: dict[str, Any] = {}
    if args.mode == "local":
        print("[benchmark] Chargement pipeline (YOLO + PaddleOCR)…", flush=True)
        t_load = time.perf_counter()
        pipeline, pipeline_config = _build_local_pipeline()
        load_ms = (time.perf_counter() - t_load) * 1000.0
        print(f"[benchmark] Pipeline prêt en {load_ms:.0f} ms", flush=True)
    else:
        load_ms = None

    samples: list[RunSample] = []
    last_payload: dict[str, Any] = {}

    total_iters = args.warmup + args.runs
    for i in range(total_iters):
        is_warmup = i < args.warmup
        label = "warmup" if is_warmup else f"run {i - args.warmup + 1}/{args.runs}"

        if args.mode == "local":
            assert pipeline is not None and image_bgr is not None
            elapsed_ms, payload = _run_local_once(pipeline, image_bgr)
        else:
            elapsed_ms, payload = _run_http_once(args.url, image_path, args.http_timeout_sec)

        last_payload = payload
        status = str(payload.get("status", ""))
        plate = payload.get("plate_text")
        yolo_conf = payload.get("yolo_confidence")

        if not is_warmup:
            samples.append(
                RunSample(
                    index=i - args.warmup + 1,
                    elapsed_ms=elapsed_ms,
                    status=status,
                    plate_text=str(plate) if plate else None,
                    yolo_confidence=float(yolo_conf) if yolo_conf is not None else None,
                )
            )

        print(
            f"[benchmark] {label:12s}  {elapsed_ms:8.1f} ms  status={status}  plate={plate or '-'}",
            flush=True,
        )

    ms_values = [s.elapsed_ms for s in samples]
    summary: dict[str, Any] = {
        "generated_at_iso": datetime.now(timezone.utc).isoformat(),
        "mode": args.mode,
        "warmup_runs": args.warmup,
        "measured_runs": args.runs,
        "platform": {
            "system": platform.system(),
            "machine": platform.machine(),
            "processor": platform.processor() or platform.machine(),
            "python": platform.python_version(),
        },
        "image": {
            "source": image_source,
            "width": image_w,
            "height": image_h,
        },
        "pipeline_config": pipeline_config if args.mode == "local" else None,
        "http_url": args.url if args.mode == "http" else None,
        "pipeline_load_ms": load_ms,
        "stats": _summarize_ms(ms_values),
        "samples": [asdict(s) for s in samples],
        "last_result": {
            "status": last_payload.get("status"),
            "plate_text": last_payload.get("plate_text"),
            "yolo_confidence": last_payload.get("yolo_confidence"),
            "ocr_confidence": last_payload.get("ocr_confidence"),
        },
        "mjpeg_note": (
            "Le flux MJPEG dashboard (PI_CAMERA_MJPEG_FPS, défaut 12) est indépendant "
            "de ce benchmark qui mesure uniquement YOLO+PaddleOCR par image."
        ),
    }

    out_path = Path(args.output)
    if not out_path.is_absolute():
        out_path = PROJECT_ROOT / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    _print_report(summary)
    print(f"JSON enregistré → {out_path}", flush=True)


if __name__ == "__main__":
    main()
