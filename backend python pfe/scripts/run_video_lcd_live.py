from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import requests

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Strict size gate defaults: wait for vehicle proximity before OCR buffering.
MIN_CROP_WIDTH = 60
MIN_CROP_HEIGHT = 20


@dataclass
class CropSample:
    crop_bgr: Any
    det_conf: float
    sharpness: float
    frame_idx: int


@dataclass
class TrackState:
    track_id: int
    bbox_xyxy: tuple[int, int, int, int]
    last_seen_frame: int
    first_seen_frame: int
    misses: int = 0
    hits: int = 1
    samples: list[CropSample] = field(default_factory=list)
    prev_center_y: float | None = None
    last_center_y: float | None = None
    line_crossed: bool = False
    emitted: bool = False
    ocr_tick: int = 0


def _is_video_or_stream(path: str) -> bool:
    p = path.strip().lower()
    if p.startswith(("http://", "https://", "rtsp://")):
        return True
    return Path(path).suffix.lower() in {".mp4", ".mov", ".mkv", ".avi", ".webm"}


def _resize_for_detector(frame_bgr: Any, max_width: int) -> tuple[Any, float]:
    h, w = frame_bgr.shape[:2]
    if max_width <= 0 or w <= max_width:
        return frame_bgr, 1.0
    scale = max_width / float(w)
    nh = max(1, int(round(h * scale)))
    resized = cv2.resize(frame_bgr, (int(max_width), nh), interpolation=cv2.INTER_AREA)
    return resized, scale


def _compact_to_display(compact: str) -> str:
    c = re.sub(r"[^0-9A-Z]", "", (compact or "").upper())
    m = re.fullmatch(r"(\d{3})TUN(\d{3,4})", c, flags=re.IGNORECASE)
    if not m:
        return c
    return f"{m.group(1)} TUN {m.group(2)}"


def _normalize_display_plate(display: str) -> str:
    s = (display or "").strip().upper()
    m = re.fullmatch(r"(\d{1,3})\s*TUN\s*(\d{1,4})", s)
    if not m:
        return s
    region = m.group(1).zfill(3)
    serial = m.group(2).zfill(4)
    return f"{region} TUN {serial}"


def _compact_tunisian_plate(text: str) -> str:
    raw = (text or "").strip().upper()
    c = re.sub(r"[^0-9A-Z]", "", raw)
    m = re.fullmatch(r"(\d{3})TUN(\d{3,4})", c, flags=re.IGNORECASE)
    if not m:
        return ""
    return f"{m.group(1)}TUN{m.group(2)}"


def _search_keys(compact: str, display: str) -> list[str]:
    out: list[str] = []
    for item in (compact, display, display.replace(" ", "-")):
        s = (item or "").strip().upper()
        if s and s not in out:
            out.append(s)
    return out


def _laplacian_sharpness(crop_bgr: Any) -> float:
    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _push_sample_with_cap(track: TrackState, sample: CropSample, max_samples: int) -> None:
    track.samples.append(sample)
    if len(track.samples) <= max_samples:
        return
    # Keep the strongest sharp samples to increase OCR quality.
    track.samples.sort(key=lambda s: s.sharpness, reverse=True)
    del track.samples[max_samples:]


def _lookup_vehicle_backend(
    *,
    backend_url: str,
    backend_secret: str,
    matricule_compact: str,
    matricule_display: str,
    timeout_sec: float,
) -> tuple[dict[str, Any] | None, str | None]:
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
) -> str | None:
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

    def _is_unpaid(value: Any) -> bool:
        s = str(value or "").strip().lower().replace("é", "e")
        return s in {"impaye", "impayee", "non_payee", "nonpayee", "unpaid", "due"}

    def _is_paid(value: Any) -> bool:
        s = str(value or "").strip().lower().replace("é", "e")
        return s in {"paye", "payee", "paid", "ok", "reglee", "reglee"}

    vignettes = payload.get("vignettes")
    if isinstance(vignettes, list):
        found_paid = False
        for item in vignettes:
            if not isinstance(item, dict):
                continue
            if _is_unpaid(item.get("statutPaiement")):
                return "vignette_impayee"
            if _is_paid(item.get("statutPaiement")):
                found_paid = True
        if found_paid:
            return "ok"

    vignette = payload.get("vignette")
    if isinstance(vignette, dict):
        if _is_unpaid(vignette.get("statutPaiement")) or _is_unpaid(vignette.get("status")):
            return "vignette_impayee"
        if _is_paid(vignette.get("statutPaiement")) or _is_paid(vignette.get("status")):
            return "ok"

    return "indisponible"


def _iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    iw = max(0, inter_x2 - inter_x1)
    ih = max(0, inter_y2 - inter_y1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(1, (ax2 - ax1) * (ay2 - ay1))
    area_b = max(1, (bx2 - bx1) * (by2 - by1))
    return inter / float(area_a + area_b - inter)


def _serial_distance(a: str, b: str) -> int:
    # Small Levenshtein for short serial strings (3-4 chars).
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    dp = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        prev = dp[0]
        dp[0] = i
        for j, cb in enumerate(b, start=1):
            cur = dp[j]
            cost = 0 if ca == cb else 1
            dp[j] = min(
                dp[j] + 1,      # deletion
                dp[j - 1] + 1,  # insertion
                prev + cost,    # substitution
            )
            prev = cur
    return dp[-1]


def _split_plate(compact: str) -> tuple[str, str]:
    m = re.fullmatch(r"(\d{3})TUN(\d{3,4})", (compact or "").upper())
    if not m:
        return "", ""
    return m.group(1), m.group(2)


def _is_similar_plate(a: str, b: str) -> bool:
    a_region, a_serial = _split_plate(a)
    b_region, b_serial = _split_plate(b)
    if not a_region or not b_region:
        return False
    if a_region != b_region:
        return False
    # Same region + close serial usually means same plate with OCR drift.
    return _serial_distance(a_serial, b_serial) <= 1


def _is_valid_tunisian_display(display: str) -> bool:
    s = (display or "").strip().upper()
    return bool(re.fullmatch(r"^\d{1,3}\s*TUN\s*\d{1,4}$", s))


def _ocr_vote_from_track(
    track: TrackState,
    *,
    ocr: Any,
    clean_plate_text: Any,
    compact_plate: Any,
    min_votes: int,
    sharpness_min: float,
    ocr_top_k: int,
    print_all: bool,
) -> tuple[str, str, float, float, float] | None:
    if not track.samples:
        return None
    selected = sorted(track.samples, key=lambda s: s.sharpness, reverse=True)[: max(1, int(ocr_top_k))]
    plate_scores: dict[str, float] = {}
    plate_counts: dict[str, int] = {}
    best_meta: dict[str, tuple[float, float, float]] = {}  # fused, yolo, ocr

    for s in selected:
        if s.sharpness < float(sharpness_min):
            continue
        raw_text, ocr_conf = ocr.recognize(s.crop_bgr)
        cleaned = clean_plate_text(raw_text)
        compact = compact_plate(cleaned)
        if print_all:
            ch, cw = s.crop_bgr.shape[:2]
            print(
                f"[live_lcd] ocr track={track.track_id} frame={s.frame_idx} crop={cw}x{ch} "
                f"sharp={s.sharpness:.1f} yolo={s.det_conf:.3f} raw='{raw_text}' cleaned='{cleaned}'",
                flush=True,
            )
        if not compact:
            continue
        fused = float(s.det_conf) * float(ocr_conf)
        plate_scores[compact] = plate_scores.get(compact, 0.0) + fused
        plate_counts[compact] = plate_counts.get(compact, 0) + 1
        if compact not in best_meta or fused > best_meta[compact][0]:
            best_meta[compact] = (fused, float(s.det_conf), float(ocr_conf))

    if not plate_scores:
        return None
    winner = max(plate_scores, key=plate_scores.get)
    if plate_counts.get(winner, 0) < int(min_votes):
        return None
    # Additional consensus gate.
    total_votes = sum(plate_counts.values())
    consensus_ratio = plate_counts[winner] / float(max(1, total_votes))
    if consensus_ratio < 0.45:
        return None

    fused, yolo_conf, ocr_conf = best_meta[winner]
    display = _compact_to_display(winner)
    return winner, display, fused, yolo_conf, ocr_conf


def main() -> None:
    from dotenv import load_dotenv
    from plate_ocr_mvp.detector import YoloPlateDetector, YoloPlateDetectorConfig
    from plate_ocr_mvp.local_ocr import LocalPlateOCR
    from plate_ocr_mvp.postprocess import clean_plate_text
    from plate_ocr_mvp.tts_service import announce_unpaid_vignette_if_needed
    from plate_ocr_mvp.utils import safe_crop_xyxy

    load_dotenv(PROJECT_ROOT / ".env")

    parser = argparse.ArgumentParser(
        description=(
            "Live video pipeline with IoU tracking, temporal voting and cooldown-based dedupe. "
            "Implements robust plate event emission on edge devices."
        )
    )
    parser.add_argument("--input", default="videos/video2.mp4", help="Video file or stream URL")
    parser.add_argument("--detector-weights", default=os.environ.get("YOLO_WEIGHTS", "models/best.pt"))
    parser.add_argument("--output-dir", default=os.environ.get("OUTPUTS_DIR", "outputs"))
    parser.add_argument("--max-frames", type=int, default=0, help="0 means until end")
    parser.add_argument("--frame-step", type=int, default=2)
    parser.add_argument("--sample-every-ms", type=float, default=350.0)
    parser.add_argument("--progress-every", type=int, default=20)
    parser.add_argument("--yolo-conf", type=float, default=float(os.environ.get("YOLO_CONF_THRESHOLD", "0.25")))
    parser.add_argument("--yolo-imgsz", type=int, default=int(os.environ.get("YOLO_INFER_IMGSZ", "960")))
    parser.add_argument("--detector-max-width", type=int, default=960, help="Resize frame for YOLO speed; crop stays on original frame.")
    parser.add_argument("--crop-padding-ratio", type=float, default=0.06)
    parser.add_argument("--min-crop-width", type=int, default=MIN_CROP_WIDTH)
    parser.add_argument("--min-crop-height", type=int, default=MIN_CROP_HEIGHT)
    parser.add_argument("--ocr-every-n-frames", type=int, default=2)
    parser.add_argument("--save-debug-crops", action="store_true")
    parser.add_argument(
        "--blur-var-threshold",
        type=float,
        default=float(os.environ.get("MIN_SHARPNESS_THRESHOLD", "30") or 30.0),
        help="Skip blurry crops before OCR buffering.",
    )
    parser.add_argument("--backend-url", default=os.environ.get("CONVEX_VEHICLE_HTTP_URL", "").strip())
    parser.add_argument("--backend-secret", default=os.environ.get("CONVEX_VEHICLE_HTTP_SECRET", "").strip())
    parser.add_argument("--backend-timeout-sec", type=float, default=2.0)
    parser.add_argument(
        "--alerts-publish-url",
        default=os.environ.get("ALERTS_PUBLISH_URL", "http://127.0.0.1:8000/api/alerts/vehicle-event").strip(),
    )
    parser.add_argument(
        "--alerts-secret",
        default=(
            os.environ.get("ALERTS_PUBLISH_SECRET", "").strip()
            or os.environ.get("CONVEX_VEHICLE_HTTP_SECRET", "").strip()
        ),
    )
    parser.add_argument("--alerts-timeout-sec", type=float, default=2.0)
    parser.add_argument("--track-iou-thresh", type=float, default=0.30)
    parser.add_argument("--track-max-misses", type=int, default=8)
    parser.add_argument("--track-min-votes", type=int, default=3)
    parser.add_argument("--trigger-line-y-ratio", type=float, default=0.62)
    parser.add_argument("--trigger-direction", choices=("down", "up", "any"), default="down")
    parser.add_argument("--trigger-min-area-ratio", type=float, default=0.002)
    parser.add_argument("--capture-frames-after-trigger", type=int, default=6)
    parser.add_argument("--buffer-max-samples", type=int, default=12)
    parser.add_argument("--disable-line-trigger", action="store_true")
    parser.add_argument("--fused-score-min", type=float, default=0.10)
    parser.add_argument("--sharpness-min", type=float, default=35.0)
    parser.add_argument("--ocr-top-k", type=int, default=6)
    parser.add_argument(
        "--early-buffer-emit-size",
        type=int,
        default=int(os.environ.get("MAX_BUFFER_READS", "18") or 18),
        help="Early finalize a still-visible track after enough sharp samples.",
    )
    parser.add_argument("--plate-cooldown-sec", type=float, default=6.0)
    parser.add_argument(
        "--priorities",
        default="vignette_impayee,vehicule_recherche,indisponible,ok",
        help="Statuses allowed for publish.",
    )
    parser.add_argument("--print-all", action="store_true")
    parser.add_argument("--tts-local", action="store_true")
    parser.add_argument(
        "--on-demand",
        action="store_true",
        help="Wait for Enter and process one sampled frame per trigger.",
    )
    args = parser.parse_args()

    # Si `--alerts-secret ""` est passé, argparse garde une chaîne vide et les POST échouent en 401
    # alors que le serveur lit ALERTS_PUBLISH_SECRET depuis .env — réinjecter depuis l'environnement.
    if not str(args.alerts_secret or "").strip():
        args.alerts_secret = (
            os.environ.get("ALERTS_PUBLISH_SECRET", "").strip()
            or os.environ.get("CONVEX_VEHICLE_HTTP_SECRET", "").strip()
        )

    if not _is_video_or_stream(args.input):
        parser.error("--input must be a video file or stream URL.")

    detector = YoloPlateDetector(
        YoloPlateDetectorConfig(
            weights_path=args.detector_weights,
            conf_threshold=float(args.yolo_conf),
            infer_imgsz=max(320, int(args.yolo_imgsz)),
            augment=False,
        )
    )
    ocr = LocalPlateOCR(paddle_lang=os.environ.get("PADDLE_OCR_LANG", "en"))
    os.makedirs(args.output_dir, exist_ok=True)

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        raise FileNotFoundError(f"Could not open input: {args.input}")

    allowed = {x.strip().lower() for x in str(args.priorities).split(",") if x.strip()}
    tracks: list[TrackState] = []
    cooldown_set: set[int] = set()
    next_track_id = 1
    last_emit_by_plate: dict[str, float] = {}
    recent_emits: list[tuple[str, float, float]] = []  # (compact, ts, fused)
    frame_idx = 0
    sampled = 0
    emitted = 0
    finalized = 0
    last_sample_ts = 0.0

    print(
        "[live_lcd] start:",
        json.dumps(
            {
                "input": args.input,
                "weights": args.detector_weights,
                "sample_every_ms": args.sample_every_ms,
                "frame_step": args.frame_step,
                "track_iou": args.track_iou_thresh,
                "track_min_votes": args.track_min_votes,
                "line_trigger": (not args.disable_line_trigger),
                "detector_max_width": args.detector_max_width,
                "fused_min": args.fused_score_min,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )

    def _emit_final(compact: str, display: str, fused: float, yolo_conf: float, ocr_conf: float) -> None:
        nonlocal emitted
        display = _normalize_display_plate(display)
        compact = _compact_tunisian_plate(display) or compact
        now = time.monotonic()
        prev_emit = last_emit_by_plate.get(compact, 0.0)
        if (now - prev_emit) < float(args.plate_cooldown_sec):
            if args.print_all:
                print(f"[live_lcd] skip cooldown plate={display}", flush=True)
            return
        if fused < float(args.fused_score_min):
            if args.print_all:
                print(f"[live_lcd] skip low fused plate={display} fused={fused:.4f}", flush=True)
            return
        # Fuzzy dedupe across short fragmented tracks of the same vehicle.
        recent_emits[:] = [
            (plate, ts, fused)
            for (plate, ts, fused) in recent_emits
            if (now - ts) < float(args.plate_cooldown_sec)
        ]
        similar_recent = [(p, ts, fs) for (p, ts, fs) in recent_emits if _is_similar_plate(p, compact)]
        if similar_recent:
            best_recent_fused = max(fs for (_, _, fs) in similar_recent)
            # Emit only if significantly better than previously emitted similar plate.
            if fused <= (best_recent_fused + 0.08):
                if args.print_all:
                    print(
                        f"[live_lcd] skip fuzzy-duplicate plate={display} fused={fused:.4f}",
                        flush=True,
                    )
                return
        if not _is_valid_tunisian_display(display):
            if args.print_all:
                print(f"[live_lcd] skip regex-invalid plate={display}", flush=True)
            return
        # Sans URL de lookup: on publie quand même vers le dashboard (sinon aucun WS).
        if not str(args.backend_url or "").strip():
            vehicle_payload = {
                "matricule": compact,
                "secondaryText": display,
                "vehicleStatus": "indisponible",
            }
        else:
            vehicle, backend_error = _lookup_vehicle_backend(
                backend_url=args.backend_url,
                backend_secret=args.backend_secret,
                matricule_compact=compact,
                matricule_display=display,
                timeout_sec=float(args.backend_timeout_sec),
            )
            if backend_error:
                print(f"[live_lcd] backend error for {display}: {backend_error}", flush=True)
                # "indisponible" est dans --priorities par défaut (contrairement à "inconnu").
                vehicle_payload = {
                    "matricule": compact,
                    "secondaryText": display,
                    "vehicleStatus": "indisponible",
                }
            else:
                vehicle_payload = dict(vehicle or {})
                vehicle_payload.setdefault("matricule", compact)
                vehicle_payload.setdefault("secondaryText", display)
        status = _resolve_vehicle_status_from_payload(vehicle_payload)
        vehicle_payload["vehicleStatus"] = status
        tag = status
        if allowed and tag not in allowed:
            if args.print_all:
                print(f"[live_lcd] skip status={tag} plate={display}", flush=True)
            return

        spoken = False
        if bool(args.tts_local):
            spoken = bool(announce_unpaid_vignette_if_needed(vehicle_payload))
        publish_error = _publish_dashboard_event(
            publish_url=args.alerts_publish_url,
            publish_secret=args.alerts_secret,
            payload=vehicle_payload,
            timeout_sec=float(args.alerts_timeout_sec),
        )
        print(
            "[live_lcd] event",
            json.dumps(
                {
                    "plate": display,
                    "fused": round(fused, 4),
                    "vehicleStatus": vehicle_payload.get("vehicleStatus"),
                    "dashboard_published": publish_error is None,
                    "tts_spoken": spoken,
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
        if publish_error and args.print_all:
            print(f"[live_lcd] {publish_error}", flush=True)
        last_emit_by_plate[compact] = now
        recent_emits.append((compact, now, fused))
        emitted += 1

    try:
        while True:
            if args.on_demand:
                try:
                    input("[live_lcd] Press Enter to process one frame (Ctrl+C to quit)... ")
                except EOFError:
                    break

            ok, frame = cap.read()
            if not ok or frame is None:
                break
            frame_idx += 1
            if args.frame_step > 1 and (frame_idx % int(args.frame_step)) != 0:
                continue
            if int(args.max_frames) > 0 and sampled >= int(args.max_frames):
                break
            now = time.monotonic()
            if (not args.on_demand) and ((now - last_sample_ts) * 1000.0 < float(args.sample_every_ms)):
                continue
            last_sample_ts = now
            sampled += 1

            frame_h, frame_w = frame.shape[:2]
            det_frame, det_scale = _resize_for_detector(frame, int(args.detector_max_width))
            detections_raw = detector.detect(det_frame)
            if det_scale != 1.0:
                inv = 1.0 / det_scale
                detections = []
                for d in detections_raw:
                    x1, y1, x2, y2 = d.bbox_xyxy
                    sx1 = int(round(x1 * inv))
                    sy1 = int(round(y1 * inv))
                    sx2 = int(round(x2 * inv))
                    sy2 = int(round(y2 * inv))
                    sx1 = max(0, min(frame_w - 1, sx1))
                    sy1 = max(0, min(frame_h - 1, sy1))
                    sx2 = max(0, min(frame_w - 1, sx2))
                    sy2 = max(0, min(frame_h - 1, sy2))
                    if sx2 <= sx1 or sy2 <= sy1:
                        continue
                    detections.append(
                        type(d)(
                            bbox_xyxy=(sx1, sy1, sx2, sy2),
                            confidence=d.confidence,
                            class_id=d.class_id,
                        )
                    )
            else:
                detections = detections_raw
            line_y = float(args.trigger_line_y_ratio) * float(frame_h)
            det_bboxes = [d.bbox_xyxy for d in detections]
            det_confs = [float(d.confidence) for d in detections]
            det_assigned = set()
            track_assigned = set()
            det_conf_by_track_id: dict[int, float] = {}

            # IoU-based association (ByteTrack-lite behavior)
            pairs: list[tuple[float, int, int]] = []
            for ti, tr in enumerate(tracks):
                for di, bb in enumerate(det_bboxes):
                    iou = _iou(tr.bbox_xyxy, bb)
                    if iou >= float(args.track_iou_thresh):
                        pairs.append((iou, ti, di))
            pairs.sort(reverse=True, key=lambda x: x[0])

            for _, ti, di in pairs:
                if ti in track_assigned or di in det_assigned:
                    continue
                tr = tracks[ti]
                tr.bbox_xyxy = det_bboxes[di]
                tr.last_seen_frame = frame_idx
                tr.hits += 1
                tr.misses = 0
                track_assigned.add(ti)
                det_assigned.add(di)
                det_conf_by_track_id[tr.track_id] = det_confs[di]

            for ti, tr in enumerate(tracks):
                if ti not in track_assigned:
                    tr.misses += 1

            for di, det in enumerate(detections):
                if di in det_assigned:
                    continue
                tracks.append(
                    TrackState(
                        track_id=next_track_id,
                        bbox_xyxy=det.bbox_xyxy,
                        last_seen_frame=frame_idx,
                        first_seen_frame=frame_idx,
                    )
                )
                det_conf_by_track_id[next_track_id] = det_confs[di]
                next_track_id += 1

            # OCR observations on matched tracks for this frame
            for tr in tracks:
                if tr.last_seen_frame != frame_idx:
                    continue
                if tr.track_id in cooldown_set:
                    continue
                x1, y1, x2, y2 = tr.bbox_xyxy
                center_y = (float(y1) + float(y2)) / 2.0
                tr.prev_center_y = tr.last_center_y
                tr.last_center_y = center_y
                area_ratio = max(1.0, float(x2 - x1) * float(y2 - y1)) / max(1.0, float(frame_w * frame_h))

                if not bool(args.disable_line_trigger) and not tr.line_crossed:
                    crossed = False
                    if tr.prev_center_y is not None:
                        if args.trigger_direction == "down":
                            crossed = tr.prev_center_y < line_y <= center_y
                        elif args.trigger_direction == "up":
                            crossed = tr.prev_center_y > line_y >= center_y
                        else:
                            crossed = (
                                (tr.prev_center_y < line_y <= center_y)
                                or (tr.prev_center_y > line_y >= center_y)
                            )
                    if crossed and area_ratio >= float(args.trigger_min_area_ratio):
                        tr.line_crossed = True
                        if args.print_all:
                            print(
                                f"[live_lcd] trigger track={tr.track_id} area_ratio={area_ratio:.4f} "
                                f"center_y={center_y:.1f} line_y={line_y:.1f}",
                                flush=True,
                            )

                if (not bool(args.disable_line_trigger)) and (not tr.line_crossed):
                    continue

                crop = safe_crop_xyxy(
                    frame,
                    x1,
                    y1,
                    x2,
                    y2,
                    padding_ratio=float(args.crop_padding_ratio),
                )
                if crop is None or crop.size == 0:
                    continue
                ch, cw = crop.shape[:2]
                if cw < int(args.min_crop_width) or ch < int(args.min_crop_height):
                    if args.print_all:
                        print(f"[live_lcd] skip small-crop track={tr.track_id} size={cw}x{ch}", flush=True)
                    continue
                tr.ocr_tick += 1
                if int(args.ocr_every_n_frames) > 1 and (tr.ocr_tick % int(args.ocr_every_n_frames)) != 0:
                    continue
                det_conf = float(det_conf_by_track_id.get(tr.track_id, 0.0))
                sharp = _laplacian_sharpness(crop)
                if sharp < float(args.blur_var_threshold):
                    if args.print_all:
                        print(
                            f"[live_lcd] skip blur track={tr.track_id} sharp={sharp:.1f} "
                            f"threshold={float(args.blur_var_threshold):.1f}",
                            flush=True,
                        )
                    continue
                if bool(args.save_debug_crops):
                    dbg_name = f"dbg_t{tr.track_id}_f{frame_idx}_y{det_conf:.2f}_s{sharp:.0f}.jpg"
                    cv2.imwrite(str(Path(args.output_dir) / dbg_name), crop)
                _push_sample_with_cap(
                    tr,
                    CropSample(
                        crop_bgr=crop,
                        det_conf=det_conf,
                        sharpness=sharp,
                        frame_idx=frame_idx,
                    ),
                    max_samples=max(3, int(args.buffer_max_samples)),
                )
                if (
                    not tr.emitted
                    and int(args.early_buffer_emit_size) > 0
                    and len(tr.samples) >= int(args.early_buffer_emit_size)
                ):
                    voted = _ocr_vote_from_track(
                        tr,
                        ocr=ocr,
                        clean_plate_text=clean_plate_text,
                        compact_plate=_compact_tunisian_plate,
                        min_votes=max(1, int(args.track_min_votes)),
                        sharpness_min=float(args.sharpness_min),
                        ocr_top_k=max(1, int(args.ocr_top_k)),
                        print_all=bool(args.print_all),
                    )
                    if voted is not None:
                        compact, display, fused, yolo_conf, ocr_conf = voted
                        _emit_final(compact, display, fused, yolo_conf, ocr_conf)
                        tr.emitted = True
                        cooldown_set.add(tr.track_id)
                        if args.print_all:
                            print(
                                f"[live_lcd] early-finalize track={tr.track_id} "
                                f"samples={len(tr.samples)} plate={display}",
                                flush=True,
                            )

            # Finalize old tracks
            alive: list[TrackState] = []
            for tr in tracks:
                if tr.misses > int(args.track_max_misses):
                    finalized += 1
                    # Emit once per car when ID disappears (or line mode was crossed).
                    if (
                        tr.track_id not in cooldown_set
                        and (bool(args.disable_line_trigger) or tr.line_crossed)
                        and not tr.emitted
                    ):
                        voted = _ocr_vote_from_track(
                            tr,
                            ocr=ocr,
                            clean_plate_text=clean_plate_text,
                            compact_plate=_compact_tunisian_plate,
                            min_votes=max(1, int(args.track_min_votes)),
                            sharpness_min=float(args.sharpness_min),
                            ocr_top_k=max(1, int(args.ocr_top_k)),
                            print_all=bool(args.print_all),
                        )
                        if voted is not None:
                            compact, display, fused, yolo_conf, ocr_conf = voted
                            _emit_final(compact, display, fused, yolo_conf, ocr_conf)
                            tr.emitted = True
                            cooldown_set.add(tr.track_id)
                else:
                    alive.append(tr)
            tracks = alive

            if int(args.progress_every) > 0 and sampled % int(args.progress_every) == 0:
                print(
                    "[live_lcd] progress",
                    json.dumps(
                        {
                            "frames_seen": frame_idx,
                            "frames_sampled": sampled,
                            "active_tracks": len(tracks),
                            "tracks_finalized": finalized,
                            "events_emitted": emitted,
                        }
                    ),
                    flush=True,
                )
    finally:
        cap.release()

    for tr in tracks:
        finalized += 1
        if (
            tr.track_id not in cooldown_set
            and (bool(args.disable_line_trigger) or tr.line_crossed)
            and not tr.emitted
        ):
            voted = _ocr_vote_from_track(
                tr,
                ocr=ocr,
                clean_plate_text=clean_plate_text,
                compact_plate=_compact_tunisian_plate,
                min_votes=max(1, int(args.track_min_votes)),
                sharpness_min=float(args.sharpness_min),
                ocr_top_k=max(1, int(args.ocr_top_k)),
                print_all=bool(args.print_all),
            )
            if voted is not None:
                compact, display, fused, yolo_conf, ocr_conf = voted
                _emit_final(compact, display, fused, yolo_conf, ocr_conf)
                tr.emitted = True
                cooldown_set.add(tr.track_id)

    print(
        "[live_lcd] done:",
        json.dumps(
            {
                "frames_seen": frame_idx,
                "frames_sampled": sampled,
                "tracks_finalized": finalized,
                "events_emitted": emitted,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
