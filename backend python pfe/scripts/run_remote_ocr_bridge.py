from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Optional

import cv2
import requests

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _is_video_or_stream(path: str) -> bool:
    p = path.strip().lower()
    if p in {"picamera2", "camera", "rpi-camera"}:
        return True
    if p.startswith(("http://", "https://", "rtsp://")):
        return True
    return Path(path).suffix.lower() in {".mp4", ".mov", ".mkv", ".avi", ".webm"}


def _is_picamera2_source(path: str) -> bool:
    return path.strip().lower() in {"picamera2", "camera", "rpi-camera"}


def _resolve_bridge_input(raw: str) -> str:
    """
    Alias pratique quand FastAPI sert déjà /camera/mjpeg (Picamera2) : un second Picamera2()
    dans ce script provoque « Device or resource busy ». Utiliser alors OpenCV sur l'URL MJPEG.
    """
    key = raw.strip().lower()
    if key in {"backend-mjpeg", "local-mjpeg", "api-mjpeg"}:
        return os.environ.get("BACKEND_MJPEG_URL", "http://127.0.0.1:8000/camera/mjpeg").strip()
    return raw.strip()


def _compact_to_display(compact: str) -> str:
    c = re.sub(r"[^0-9A-Z]", "", (compact or "").upper())
    m = re.fullmatch(r"(\d{3})TUN(\d{3,4})", c, flags=re.IGNORECASE)
    if not m:
        return compact.strip().upper()
    return f"{m.group(1)} TUN {m.group(2)}"


def _search_keys(compact: str, display: str) -> list[str]:
    out: list[str] = []
    for item in (compact, display, display.replace(" ", "-")):
        s = (item or "").strip().upper()
        if s and s not in out:
            out.append(s)
    return out


def _lookup_vehicle_backend(
    *,
    backend_url: str,
    backend_secret: str,
    matricule_compact: str,
    matricule_display: str,
    timeout_sec: float,
) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    headers = {"Content-Type": "application/json"}
    if backend_secret:
        headers["Authorization"] = f"Bearer {backend_secret}"
        headers["X-Vehicle-Secret"] = backend_secret

    payload = {
        "matricule": matricule_compact,
        "matriculeSearchKeys": _search_keys(matricule_compact, matricule_display),
    }
    try:
        resp = requests.post(
            backend_url,
            headers=headers,
            json=payload,
            timeout=max(0.5, float(timeout_sec)),
        )
        resp.raise_for_status()
        parsed = resp.json() if resp.text else {}
        if not isinstance(parsed, dict):
            return None, "Backend response is not a JSON object."
        return parsed, None
    except requests.RequestException as exc:
        return None, f"Backend lookup error: {exc}"
    except Exception as exc:  # noqa: BLE001
        return None, f"Backend parse error: {exc}"


def _publish_dashboard_event(
    *,
    publish_url: str,
    publish_secret: str,
    payload: dict[str, Any],
    timeout_sec: float,
) -> Optional[str]:
    headers = {"Content-Type": "application/json"}
    if publish_secret:
        headers["X-Alerts-Secret"] = publish_secret
        headers["Authorization"] = f"Bearer {publish_secret}"
    try:
        resp = requests.post(
            publish_url,
            headers=headers,
            json=payload,
            timeout=max(0.5, float(timeout_sec)),
        )
        resp.raise_for_status()
        return None
    except requests.RequestException as exc:
        return f"Alerts publish error: {exc}"
    except Exception as exc:  # noqa: BLE001
        return f"Alerts publish parse error: {exc}"


def _resolve_vehicle_status_from_payload(payload: dict[str, Any]) -> str:
    status = str(payload.get("vehicleStatus") or "").strip().lower()
    if status:
        return status

    explicit_wanted = payload.get("vehiculeRecherche")
    if explicit_wanted is True:
        return "vehicule_recherche"
    legacy_vehicle_status = str(payload.get("statutVehicule") or "").strip().lower()
    if legacy_vehicle_status == "recherche":
        return "vehicule_recherche"
    return "indisponible"


def main() -> None:
    from dotenv import load_dotenv

    load_dotenv(PROJECT_ROOT / ".env")
    from plate_ocr_mvp.tts_service import announce_unpaid_vignette_if_needed

    parser = argparse.ArgumentParser(
        description=(
            "Bridge simple: video/stream -> OCR HTTP LAN -> backend local -> TTS local "
            "(sans YOLO local sur Raspberry Pi)."
        )
    )
    parser.add_argument(
        "--input",
        required=True,
        help=(
            "Vidéo, flux, index caméra OpenCV, picamera2, ou alias backend-mjpeg "
            "(http://127.0.0.1:8000/camera/mjpeg — même caméra que l'API MJPEG, sans second Picamera2)."
        ),
    )
    parser.add_argument(
        "--ocr-url",
        default=os.environ.get("OCR_SERVICE_URL", "http://127.0.0.1:8000/recognize_plate"),
        help="OCR LAN endpoint (POST multipart field name: file)",
    )
    parser.add_argument(
        "--backend-url",
        default=os.environ.get("CONVEX_VEHICLE_HTTP_URL", "").strip(),
        help="Local backend URL for vehicle/vignette lookup",
    )
    parser.add_argument(
        "--backend-secret",
        default=os.environ.get("CONVEX_VEHICLE_HTTP_SECRET", "").strip(),
        help="Optional local backend secret",
    )
    parser.add_argument("--sample-every-ms", type=float, default=450.0)
    parser.add_argument("--frame-step", type=int, default=2)
    parser.add_argument("--max-frames", type=int, default=0, help="0 means until end")
    parser.add_argument("--camera-width", type=int, default=1280, help="Pi camera width")
    parser.add_argument("--camera-height", type=int, default=720, help="Pi camera height")
    parser.add_argument("--camera-index", type=int, default=0, help="OpenCV camera index fallback")
    parser.add_argument("--ocr-timeout-sec", type=float, default=2.0)
    parser.add_argument("--backend-timeout-sec", type=float, default=2.0)
    parser.add_argument(
        "--alerts-publish-url",
        default=os.environ.get("ALERTS_PUBLISH_URL", "http://127.0.0.1:8000/api/alerts/vehicle-event").strip(),
        help="Local backend endpoint that publishes events to dashboard WebSocket clients.",
    )
    parser.add_argument(
        "--alerts-secret",
        default=(
            os.environ.get("ALERTS_PUBLISH_SECRET", "").strip()
            or os.environ.get("CONVEX_VEHICLE_HTTP_SECRET", "").strip()
        ),
        help="Secret for alerts publish endpoint (defaults to ALERTS_PUBLISH_SECRET or CONVEX_VEHICLE_HTTP_SECRET).",
    )
    parser.add_argument("--alerts-timeout-sec", type=float, default=2.0)
    parser.add_argument("--ocr-confidence-min", type=float, default=0.75)
    parser.add_argument("--lookup-cooldown-sec", type=float, default=3.0)
    parser.add_argument(
        "--on-demand",
        action="store_true",
        help="Wait for Enter and process one OCR request per trigger.",
    )
    parser.add_argument("--print-all", action="store_true")
    args = parser.parse_args()

    input_resolved = _resolve_bridge_input(args.input)
    if not _is_video_or_stream(input_resolved):
        parser.error("--input must be a video file, stream URL, picamera2, or backend-mjpeg.")
    if not args.backend_url:
        parser.error("Missing backend URL. Provide --backend-url or CONVEX_VEHICLE_HTTP_URL.")

    use_picamera2 = _is_picamera2_source(input_resolved)
    picam2 = None
    cap = None
    source_name = input_resolved
    if use_picamera2:
        try:
            from picamera2 import Picamera2  # type: ignore[import-untyped]
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "picamera2 package not available. Install it on Raspberry Pi "
                "or use a video/stream input."
            ) from exc
        picam2 = Picamera2()
        config = picam2.create_preview_configuration(
            main={"size": (int(args.camera_width), int(args.camera_height)), "format": "RGB888"}
        )
        picam2.configure(config)
        picam2.start()
        time.sleep(1.0)
        source_name = "picamera2"
    else:
        cap = cv2.VideoCapture(input_resolved)
        if not cap.isOpened():
            try:
                cam_index = int(input_resolved)
                cap = cv2.VideoCapture(cam_index)
                source_name = f"opencv:{cam_index}"
            except ValueError:
                pass
        if cap is None or not cap.isOpened():
            cap = cv2.VideoCapture(int(args.camera_index))
            source_name = f"opencv:{int(args.camera_index)}"
        if cap is None or not cap.isOpened():
            raise FileNotFoundError(
                f"Could not open input: {input_resolved} (or fallback camera index {args.camera_index})."
            )
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, int(args.camera_width))
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, int(args.camera_height))

    print(
        "[remote_bridge] start:",
        json.dumps(
            {
                "input": args.input,
                "input_resolved": input_resolved,
                "source": source_name,
                "ocr_url": args.ocr_url,
                "backend_url": args.backend_url,
                "sample_every_ms": args.sample_every_ms,
                "ocr_conf_min": args.ocr_confidence_min,
                "alerts_publish_url": args.alerts_publish_url,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )

    frame_idx = 0
    processed = 0
    last_sample_ts = 0.0
    last_lookup_ts: dict[str, float] = {}

    try:
        while True:
            if args.on_demand:
                try:
                    input("[remote_bridge] Press Enter to process one frame (Ctrl+C to quit)... ")
                except EOFError:
                    break

            if picam2 is not None:
                frame_rgb = picam2.capture_array()
                frame = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
                ok = frame is not None
            else:
                assert cap is not None
                ok, frame = cap.read()
            if not ok or frame is None:
                if picam2 is not None:
                    continue
                break
            frame_idx += 1
            if args.frame_step > 1 and (frame_idx % args.frame_step) != 0:
                continue
            if args.max_frames > 0 and processed >= args.max_frames:
                break

            now = time.monotonic()
            if (not args.on_demand) and ((now - last_sample_ts) * 1000.0 < float(args.sample_every_ms)):
                continue
            last_sample_ts = now
            processed += 1

            ok_jpg, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
            if not ok_jpg:
                if args.print_all:
                    print("[remote_bridge] skip: jpeg encoding failed", flush=True)
                continue

            try:
                ocr_resp = requests.post(
                    args.ocr_url,
                    files={"file": ("frame.jpg", encoded.tobytes(), "image/jpeg")},
                    timeout=max(0.5, float(args.ocr_timeout_sec)),
                )
                ocr_resp.raise_for_status()
                ocr_data = ocr_resp.json()
            except Exception as exc:  # noqa: BLE001
                if args.print_all:
                    print(f"[remote_bridge] OCR unavailable: {exc}", flush=True)
                continue

            if not isinstance(ocr_data, dict) or not ocr_data.get("detected"):
                if args.print_all:
                    print("[remote_bridge] skip: no plate detected", flush=True)
                continue

            compact = re.sub(r"[^0-9A-Z]", "", str(ocr_data.get("matricule") or "").upper())
            conf = float(ocr_data.get("confidence") or 0.0)
            if conf < float(args.ocr_confidence_min):
                if args.print_all:
                    print(f"[remote_bridge] skip low confidence: {conf:.3f}", flush=True)
                continue

            display = str(ocr_data.get("display") or "").strip() or _compact_to_display(compact)
            m = re.fullmatch(r"(\d{3})TUN(\d{3,4})", compact, flags=re.IGNORECASE)
            if not m:
                if args.print_all:
                    print(f"[remote_bridge] skip invalid plate format: {compact}", flush=True)
                continue
            compact = f"{m.group(1)}TUN{m.group(2)}"
            display = _compact_to_display(compact)

            prev_lookup = last_lookup_ts.get(compact, 0.0)
            if (now - prev_lookup) < float(args.lookup_cooldown_sec):
                if args.print_all:
                    print(f"[remote_bridge] skip lookup cooldown: {display}", flush=True)
                continue
            last_lookup_ts[compact] = now

            vehicle, backend_error = _lookup_vehicle_backend(
                backend_url=args.backend_url,
                backend_secret=args.backend_secret,
                matricule_compact=compact,
                matricule_display=display,
                timeout_sec=float(args.backend_timeout_sec),
            )
            if backend_error:
                print(f"[remote_bridge] backend error for {display}: {backend_error}", flush=True)
                continue

            vehicle_payload: dict[str, Any] = dict(vehicle or {})
            vehicle_payload.setdefault("matricule", compact)
            vehicle_payload.setdefault("secondaryText", display)
            vehicle_payload["vehicleStatus"] = _resolve_vehicle_status_from_payload(vehicle_payload)
            spoken = announce_unpaid_vignette_if_needed(vehicle_payload)
            publish_error = _publish_dashboard_event(
                publish_url=args.alerts_publish_url,
                publish_secret=args.alerts_secret,
                payload=vehicle_payload,
                timeout_sec=float(args.alerts_timeout_sec),
            )
            if publish_error and args.print_all:
                print(f"[remote_bridge] {publish_error}", flush=True)

            print(
                "[remote_bridge] event",
                json.dumps(
                    {
                        "plate": display,
                        "ocr_confidence": round(conf, 4),
                        "vehicleStatus": vehicle_payload.get("vehicleStatus"),
                        "tts_spoken": bool(spoken),
                        "dashboard_published": publish_error is None,
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
    finally:
        if picam2 is not None:
            picam2.stop()
        if cap is not None:
            cap.release()

    print(
        "[remote_bridge] done:",
        json.dumps({"frames_seen": frame_idx, "frames_sampled": processed}, ensure_ascii=False),
        flush=True,
    )


if __name__ == "__main__":
    main()
