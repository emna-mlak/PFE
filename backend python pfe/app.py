from __future__ import annotations

import asyncio
import io
import logging
import os
import platform
import re
import threading
import time
import unicodedata
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from dataclasses import asdict
from typing import Any

from dotenv import load_dotenv
load_dotenv()

from pydub import AudioSegment
import requests

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
import cv2
import numpy as np

from plate_ocr_mvp.types import CaptureContext

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _terrain_lifespan(app: FastAPI):
    """Préchauffe la caméra MJPEG en tâche de fond pour que le 1er GET réponde plus vite."""
    warm_task: asyncio.Task[None] | None = None
    if _mjpeg_enabled():
        async def _warm() -> None:
            try:
                sec = float(os.environ.get("PI_CAMERA_MJPEG_WARMUP_SEC", "90"))
                await asyncio.wait_for(asyncio.to_thread(_mjpeg_capture_jpeg_bytes), timeout=sec)
                logger.info("MJPEG: préchauffage caméra terminé.")
            except Exception:
                logger.exception("MJPEG: préchauffage échoué (vérifier caméra / autre processus)")

        warm_task = asyncio.create_task(_warm())

    voice_preload_task: asyncio.Task[None] | None = None
    if _env_bool("VOICE_WHISPER_PRELOAD", False) and (
        os.environ.get("VOICE_STT_PROVIDER", "local").strip().lower() == "local"
    ):

        async def _preload_whisper() -> None:
            try:
                def _load() -> None:
                    session = get_voice_session()
                    stt = session.stt
                    if hasattr(stt, "_get_model"):
                        stt._get_model()

                await asyncio.to_thread(_load)
                logger.info("Whisper STT préchargé (VOICE_WHISPER_PRELOAD=1).")
            except Exception:
                logger.exception(
                    "Whisper preload failed — run: python scripts/download_whisper_model.py"
                )

        voice_preload_task = asyncio.create_task(_preload_whisper())

    yield
    for task in (warm_task, voice_preload_task):
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="License Plate OCR API",
    description="Detects license plates (YOLO) and reads the number (local PaddleOCR)",
    version="1.0.0",
    lifespan=_terrain_lifespan,
)

_cors_origins = os.environ.get("CORS_ALLOW_ORIGINS", "*").strip()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _cors_origins == "*" else [o.strip() for o in _cors_origins.split(",") if o.strip()],
    allow_credentials=_cors_origins != "*",
    allow_methods=["*"],
    allow_headers=["*"],
)

WEIGHTS_PATH = os.environ.get("YOLO_WEIGHTS", "models/best.pt")
OUTPUTS_DIR = os.environ.get("OUTPUTS_DIR", "outputs")
PADDLE_OCR_LANG = os.environ.get("PADDLE_OCR_LANG", "en")


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _is_arm_device() -> bool:
    return platform.machine().lower() in {"aarch64", "arm64", "armv7l"}


def _env_int_pi(name: str, default: int, pi_default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return pi_default if _is_arm_device() else default
    try:
        return int(raw)
    except ValueError:
        return pi_default if _is_arm_device() else default


def _env_bool_pi(name: str, default: bool, pi_default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return pi_default if _is_arm_device() else default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


YOLO_CONF_THRESHOLD = _env_float("YOLO_CONF_THRESHOLD", 0.25)
YOLO_INFER_IMGSZ = _env_int_pi("YOLO_INFER_IMGSZ", 1280, 640)
YOLO_AUGMENT = _env_bool_pi("YOLO_AUGMENT", True, False)

_pipeline: Any = None
_pipeline_lock = threading.Lock()
_voice_session: Any = None
_voice_lock = threading.Lock()


def get_pipeline() -> Any:
    """Import + charge YOLO/OCR au premier usage (évite de bloquer l’écoute uvicorn au démarrage)."""
    global _pipeline
    if _pipeline is None:
        with _pipeline_lock:
            if _pipeline is None:
                from plate_ocr_mvp.detector import YoloPlateDetectorConfig
                from plate_ocr_mvp.pipeline import PlateOCRPipeline, PlateOCRPipelineConfig

                logger.info(
                    "Chargement PlateOCRPipeline (YOLO + OCR) weights=%s conf=%.2f imgsz=%s augment=%s paddle=%s",
                    WEIGHTS_PATH,
                    YOLO_CONF_THRESHOLD,
                    YOLO_INFER_IMGSZ,
                    YOLO_AUGMENT,
                    PADDLE_OCR_LANG,
                )
                _pipeline = PlateOCRPipeline(
                    PlateOCRPipelineConfig(
                        detector_cfg=YoloPlateDetectorConfig(
                            weights_path=WEIGHTS_PATH,
                            conf_threshold=YOLO_CONF_THRESHOLD,
                            infer_imgsz=YOLO_INFER_IMGSZ,
                            augment=YOLO_AUGMENT,
                        ),
                        paddle_lang=PADDLE_OCR_LANG,
                        outputs_dir=OUTPUTS_DIR,
                    )
                )
                logger.info("PlateOCRPipeline prêt.")
    return _pipeline


def _process_plate_frame_sync(
    image_bgr: np.ndarray,
    stem: str,
    context: CaptureContext | None = None,
) -> dict[str, Any]:
    pl = get_pipeline()
    return pl._to_dict(pl.process_frame(image_bgr, output_stem=stem, context=context))


async def _run_plate_pipeline(
    image_bgr: np.ndarray,
    stem: str,
    context: CaptureContext | None = None,
) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(_process_plate_frame_sync, image_bgr, stem, context)
    except Exception as exc:
        logger.exception("Plate OCR pipeline failed")
        raise HTTPException(
            status_code=503,
            detail=f"Plate OCR pipeline failed: {exc!s}",
        ) from exc


def plate_ocr_pipeline_ready() -> bool:
    return _pipeline is not None


def get_voice_session() -> Any:
    """STT + matcher au premier usage (create_stt_from_env peut être lent)."""
    global _voice_session
    if _voice_session is None:
        with _voice_lock:
            if _voice_session is None:
                from plate_ocr_mvp.voice_cloud import CloudVoiceSession, CommandMatcher

                logger.info("Chargement CloudVoiceSession…")
                _voice_session = CloudVoiceSession(matcher=CommandMatcher())
                logger.info("CloudVoiceSession prêt.")
    return _voice_session
VEHICLE_LOOKUP_URL = os.environ.get("CONVEX_VEHICLE_HTTP_URL", "").strip()
VEHICLE_LOOKUP_SECRET = os.environ.get("CONVEX_VEHICLE_HTTP_SECRET", "").strip()
VEHICLE_LOOKUP_TIMEOUT_SEC = float(os.environ.get("VEHICLE_LOOKUP_TIMEOUT_SEC", "3.0"))
ALERTS_PUBLISH_SECRET = (
    os.environ.get("ALERTS_PUBLISH_SECRET")
    or os.environ.get("CONVEX_VEHICLE_HTTP_SECRET")
    or ""
).strip()


class AlertHub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._clients.discard(ws)

    async def publish(self, event: dict[str, Any]) -> int:
        if not self._clients:
            return 0
        dead: list[WebSocket] = []
        delivered = 0
        for ws in self._clients:
            try:
                await ws.send_json(event)
                delivered += 1
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)
        return delivered

    @property
    def connected_count(self) -> int:
        return len(self._clients)


alert_hub = AlertHub()

# --- Raspberry Pi camera MJPEG (optional; enable with PI_CAMERA_MJPEG=1) ---
_mjpeg_lock = threading.Lock()
_mjpeg_picam2: Any = None
_mjpeg_cap: Any = None
_mjpeg_backend_label: str | None = None


def _mjpeg_env_truthy(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _mjpeg_enabled() -> bool:
    return _mjpeg_env_truthy("PI_CAMERA_MJPEG", False)


def _mjpeg_camera_backend_pref() -> str:
    return os.environ.get("PI_CAMERA_BACKEND", "auto").strip().lower()


def _open_mjpeg_picamera2(width: int, height: int) -> Any:
    from picamera2 import Picamera2  # type: ignore[import-untyped]

    camera = Picamera2()
    config = camera.create_preview_configuration(main={"size": (width, height), "format": "RGB888"})
    camera.configure(config)
    camera.start()
    delay = float(os.environ.get("PI_CAMERA_MJPEG_START_DELAY_SEC", "1.5"))
    if delay > 0:
        time.sleep(delay)
    return camera


def _open_mjpeg_opencv(index: int, width: int, height: int) -> Any:
    cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        raise RuntimeError(f"OpenCV camera index {index} is not available.")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    return cap


def _mjpeg_ensure_camera_unlocked() -> None:
    """Open Picamera2 or OpenCV capture once; must hold _mjpeg_lock."""
    global _mjpeg_picam2, _mjpeg_cap, _mjpeg_backend_label
    if _mjpeg_picam2 is not None or _mjpeg_cap is not None:
        return
    pref = _mjpeg_camera_backend_pref()
    width = int(os.environ.get("PI_CAMERA_MJPEG_WIDTH", "1280"))
    height = int(os.environ.get("PI_CAMERA_MJPEG_HEIGHT", "720"))
    cam_index = int(os.environ.get("PI_CAMERA_INDEX", "0"))

    if pref in {"auto", "picamera2"}:
        try:
            _mjpeg_picam2 = _open_mjpeg_picamera2(width, height)
            _mjpeg_backend_label = "picamera2"
            logger.info("MJPEG: started Picamera2 (%sx%s)", width, height)
            return
        except Exception:
            logger.exception("MJPEG: Picamera2 failed to open")
            if pref == "picamera2":
                raise

    _mjpeg_cap = _open_mjpeg_opencv(cam_index, width, height)
    _mjpeg_backend_label = "opencv"
    logger.info("MJPEG: started OpenCV index=%s (%sx%s)", cam_index, width, height)


def _mjpeg_capture_jpeg_bytes() -> bytes:
    """Grab one JPEG frame; serialised with _mjpeg_lock."""
    global _mjpeg_picam2, _mjpeg_cap
    with _mjpeg_lock:
        _mjpeg_ensure_camera_unlocked()
        quality = int(os.environ.get("PI_CAMERA_MJPEG_JPEG_QUALITY", "85"))
        quality = max(40, min(quality, 95))
        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), quality]

        if _mjpeg_picam2 is not None:
            rgb = _mjpeg_picam2.capture_array()
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            ok, buf = cv2.imencode(".jpg", bgr, encode_params)
        else:
            ok, frame = _mjpeg_cap.read()
            if not ok or frame is None:
                raise RuntimeError("OpenCV camera read failed")
            ok, buf = cv2.imencode(".jpg", frame, encode_params)

        if not ok or buf is None:
            raise RuntimeError("JPEG encode failed")
        return buf.tobytes()


_PLATE_PATTERN = re.compile(
    r"\b(\d{3})\D*(?:tun|tn|tunis|tunisie)\D*(\d{4})\b",
    re.IGNORECASE,
)
_PLATE_FALLBACK_PATTERN = re.compile(r"\b(\d{3})\b.*?\b(\d{4})\b")
_AMOUNT_PATTERN = re.compile(
    r"\b(\d{1,5})(?:[.,](\d{1,2}))?\s*(?:dt|dinar|dinars|tnd)\b",
    re.IGNORECASE,
)
_INFRACTION_KEYWORDS = {
    "Stationnement": ("stationnement", "garer", "parking"),
    "vitesse": ("vitesse", "excès", "exces"),
    "Administratif": ("papier", "assurance", "permis", "carte grise", "administratif"),
    "Conduite": ("conduite", "depassement", "dépassement", "ceinture", "telephone", "téléphone"),
    "Comportement": ("agressif", "insulte", "refus", "comportement"),
    "Signalisation": ("feu rouge", "stop", "signalisation", "priorite", "priorité"),
    "Technique": ("technique", "phare", "frein", "pneu", "pollution"),
}


def _compact_tunisian_plate(text: str) -> str:
    raw = (text or "").strip().upper()
    if not raw:
        return ""
    compact = re.sub(r"[^0-9A-Z]", "", raw)
    m = re.fullmatch(r"(\d{3})TUN(\d{3,4})", compact, flags=re.IGNORECASE)
    if not m:
        return ""
    return f"{m.group(1)}TUN{m.group(2)}"


def _display_tunisian_plate(compact: str) -> str:
    m = re.fullmatch(r"(\d{3})TUN(\d{3,4})", (compact or "").upper(), flags=re.IGNORECASE)
    if not m:
        return ""
    return f"{m.group(1)} TUN {m.group(2)}"


def _matricule_search_keys(compact: str, display: str) -> list[str]:
    out: list[str] = []
    for item in (compact, display, display.replace(" ", "-")):
        s = (item or "").strip().upper()
        if s and s not in out:
            out.append(s)
    return out


def _lookup_vehicle_payload(matricule_compact: str, matricule_display: str) -> tuple[dict[str, Any] | None, str | None]:
    if not VEHICLE_LOOKUP_URL:
        return None, "Missing CONVEX_VEHICLE_HTTP_URL."
    headers = {"Content-Type": "application/json"}
    if VEHICLE_LOOKUP_SECRET:
        headers["Authorization"] = f"Bearer {VEHICLE_LOOKUP_SECRET}"
        headers["X-Vehicle-Secret"] = VEHICLE_LOOKUP_SECRET
    body = {
        "matricule": matricule_compact,
        "matriculeSearchKeys": _matricule_search_keys(matricule_compact, matricule_display),
    }
    try:
        resp = requests.post(
            VEHICLE_LOOKUP_URL,
            headers=headers,
            json=body,
            timeout=max(0.5, VEHICLE_LOOKUP_TIMEOUT_SEC),
        )
        resp.raise_for_status()
        parsed = resp.json() if resp.text else {}
        if not isinstance(parsed, dict):
            return None, "Vehicle lookup response is not a JSON object."
        return parsed, None
    except requests.RequestException as exc:
        return None, f"Vehicle lookup error: {exc}"
    except Exception as exc:  # noqa: BLE001
        return None, f"Vehicle lookup parse error: {exc}"


def _resolve_vehicle_status(payload: dict[str, Any]) -> str | None:
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

    return None


def _bytes_look_like_wav(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE"


def _guess_pydub_format(filename: str | None, content_type: str | None) -> str | None:
    """
    Map upload hint to pydub/ffmpeg format string.
    Expo/Android often sends .m4a as AAC in MP4 — use format=\"mp4\" (see pydub docs).
    """
    name = (filename or "").lower()
    ct = (content_type or "").lower()
    if name.endswith(".m4a") or "m4a" in ct or "audio/mp4" in ct:
        return "mp4"
    if name.endswith(".mp3") or "mpeg" in ct or "mp3" in ct:
        return "mp3"
    if name.endswith(".webm") or "webm" in ct:
        return "webm"
    if name.endswith(".ogg") or "ogg" in ct:
        return "ogg"
    if name.endswith(".wav") or "wav" in ct:
        return "wav"
    return None


def _normalize_upload_to_wav_pcm16_mono_16k(
    contents: bytes,
    *,
    filename: str | None,
    content_type: str | None,
) -> bytes:
    """
    Decode arbitrary upload (m4a/mp3/webm/...) with pydub, export WAV PCM16 mono 16 kHz.
    Requires ffmpeg on PATH (pydub uses it under the hood).
    """
    fmt = _guess_pydub_format(filename, content_type)
    buf = io.BytesIO(contents)
    try:
        if fmt is not None:
            seg = AudioSegment.from_file(buf, format=fmt)
        else:
            buf.seek(0)
            seg = AudioSegment.from_file(io.BytesIO(contents))
    except Exception as e:
        raise RuntimeError(
            f"Could not decode audio (install ffmpeg and check format): {e}"
        ) from e

    seg = seg.set_frame_rate(16000).set_channels(1)
    out = io.BytesIO()
    seg.export(out, format="wav")
    wav = out.getvalue()
    if not wav or not _bytes_look_like_wav(wav):
        raise RuntimeError("Exported audio is not valid WAV.")
    return wav


def _extract_plate(transcript: str) -> str:
    text = (transcript or "").strip()
    if not text:
        return ""
    # Normalize accents/punctuation so STT variants are easier to match.
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = text.replace("tunisienne", "tunisie").replace("tunis", "tun")
    text = re.sub(r"[\-_/.,;:]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    m = _PLATE_PATTERN.search(text)
    if not m:
        # Fallback: if country token is present, accept nearest 3+4 numeric groups.
        if not re.search(r"\b(?:tun|tn|tunisie)\b", text):
            return ""
        m2 = _PLATE_FALLBACK_PATTERN.search(text)
        if not m2:
            return ""
        return f"{m2.group(1)} TUN {m2.group(2)}"
    return f"{m.group(1)} TUN {m.group(2)}"


def _extract_amount(transcript: str) -> float:
    m = _AMOUNT_PATTERN.search(transcript or "")
    if not m:
        return 0.0
    whole = m.group(1)
    frac = m.group(2) or "0"
    return float(f"{whole}.{frac}")


def _infer_infraction_type(transcript: str) -> str:
    t = (transcript or "").lower()
    for label, words in _INFRACTION_KEYWORDS.items():
        if any(w in t for w in words):
            return label
    return ""


def _build_voice_infraction_payload(transcript: str) -> dict:
    description = (transcript or "").strip()
    return {
        "matricule": _extract_plate(description),
        "typeInfraction": _infer_infraction_type(description),
        "description": description,
        "montant": _extract_amount(description),
    }


def _parse_capture_context(
    latitude: float | None,
    longitude: float | None,
    captured_at: str | None,
    infraction_number: str | None,
) -> CaptureContext | None:
    has_gps = latitude is not None or longitude is not None
    has_time = captured_at is not None and str(captured_at).strip() != ""
    has_inf = infraction_number is not None and str(infraction_number).strip() != ""
    if not (has_gps or has_time or has_inf):
        return None
    return CaptureContext(
        latitude=latitude,
        longitude=longitude,
        captured_at_iso=(captured_at.strip() if captured_at else datetime.now(timezone.utc).isoformat()),
        infraction_number=(
            infraction_number.strip()
            if infraction_number and str(infraction_number).strip()
            else f"INF-{uuid.uuid4().hex[:12].upper()}"
        ),
    )


@app.post("/api/plate-ocr", summary="Detect and read a license plate from an image")
async def plate_ocr(
    file: UploadFile = File(...),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    captured_at: str | None = Form(None, description="ISO-8601 date/heure côté appareil (optionnel)"),
    infraction_number: str | None = Form(None, description="N° d'infraction ; sinon généré (INF-… )"),
):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp", "image/jpg"}:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP images are accepted.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file.")

    arr = np.frombuffer(contents, dtype=np.uint8)
    image_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise HTTPException(status_code=400, detail="Could not decode image.")

    stem = uuid.uuid4().hex[:12]
    ctx = _parse_capture_context(latitude, longitude, captured_at, infraction_number)
    result = await _run_plate_pipeline(image_bgr, stem, ctx)
    return JSONResponse(content=result)


@app.post("/recognize_plate", summary="Minimal OCR endpoint for Raspberry bridge")
async def recognize_plate(file: UploadFile = File(...)):
    """
    Lightweight contract used by Raspberry Pi bridge:
    {detected, matricule, display, confidence}
    """
    if file.content_type not in {"image/jpeg", "image/png", "image/webp", "image/jpg"}:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP images are accepted.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file.")

    arr = np.frombuffer(contents, dtype=np.uint8)
    image_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise HTTPException(status_code=400, detail="Could not decode image.")

    stem = uuid.uuid4().hex[:12]
    result = await _run_plate_pipeline(image_bgr, stem)
    compact = _compact_tunisian_plate(str(result.get("plate_text") or ""))
    conf = float(result.get("confidence") or 0.0)

    if not compact:
        logger.info(
            "recognize_plate: aucune plaque valide status=%s yolo_conf=%s ocr_conf=%s raw_ocr=%r",
            result.get("status"),
            result.get("yolo_confidence"),
            result.get("ocr_confidence"),
            (str(result.get("raw_ocr_text") or ""))[:120],
        )

    payload = {
        "detected": bool(compact),
        "matricule": compact,
        "display": _display_tunisian_plate(compact),
        "confidence": conf,
    }

    # E2E terrain mode: OCR -> vehicle lookup -> dashboard publish in one call.
    if compact:
        display = _display_tunisian_plate(compact)
        vehicle_payload, lookup_error = _lookup_vehicle_payload(compact, display)
        if isinstance(vehicle_payload, dict):
            vehicle_payload.setdefault("matricule", compact)
            vehicle_payload.setdefault("secondaryText", display)
            normalized_status = _resolve_vehicle_status(vehicle_payload)
            if normalized_status:
                vehicle_payload["vehicleStatus"] = normalized_status
            delivered = await alert_hub.publish(vehicle_payload)
            payload["vehicleStatus"] = vehicle_payload.get("vehicleStatus")
            payload["dashboardPublished"] = delivered > 0
            payload["dashboardDeliveredClients"] = delivered
        else:
            payload["vehicleLookupError"] = lookup_error
            # Keep dashboard live even when lookup service is unavailable.
            fallback_event = {
                "matricule": compact,
                "secondaryText": display,
                "vehicleStatus": "indisponible",
            }
            delivered = await alert_hub.publish(fallback_event)
            payload["vehicleStatus"] = fallback_event["vehicleStatus"]
            payload["dashboardPublished"] = delivered > 0
            payload["dashboardDeliveredClients"] = delivered

    return JSONResponse(content=payload)


@app.post("/api/voice-command", summary="Transcribe voice and match command id")
async def voice_command(file: UploadFile = File(...)):
    allowed_types = {
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
        "audio/m4a",
        "audio/mp4",
        "audio/mpeg",
        "audio/mp3",
        "audio/webm",
        "audio/ogg",
        "application/octet-stream",
    }
    if file.content_type and file.content_type.lower() not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Unsupported audio type. Use wav, m4a, mp3, webm, or ogg.",
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty audio file.")

    fname = file.filename or "audio.wav"
    try:
        if _bytes_look_like_wav(contents):
            wav_bytes = contents
            stt_filename = fname
        else:
            wav_bytes = _normalize_upload_to_wav_pcm16_mono_16k(
                contents,
                filename=fname,
                content_type=file.content_type,
            )
            stt_filename = "normalized.wav"
        result = get_voice_session().process_uploaded_audio(wav_bytes, filename=stt_filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Voice processing failed: {e}") from e

    payload = _build_voice_infraction_payload(result.transcription)
    payload["status"] = "ok"
    payload["command_id"] = result.command_id
    payload["stt_provider"] = result.stt_provider
    payload["language"] = result.language
    payload["stt_confidence"] = result.stt_confidence
    payload["command_confidence"] = result.command_confidence
    return JSONResponse(content=payload)


@app.websocket("/alerts")
async def alerts_socket(ws: WebSocket):
    await alert_hub.connect(ws)
    peer = ws.client
    peer_s = f"{peer.host}:{peer.port}" if peer else "?"
    logger.info("Dashboard WebSocket accepted from %s", peer_s)
    try:
        while True:
            # Prefer generic receive() so unexpected frames do not tear down the connection.
            message = await ws.receive()
            mtype = message.get("type")
            if mtype == "websocket.disconnect":
                break
            if mtype == "websocket.close":
                break
    except WebSocketDisconnect:
        logger.info("Dashboard WebSocket disconnected (normal) from %s", peer_s)
    except Exception:
        logger.exception("Dashboard WebSocket error from %s", peer_s)
    finally:
        alert_hub.disconnect(ws)


@app.post("/api/alerts/vehicle-event", summary="Publish a vehicle event to dashboard WebSocket clients")
async def publish_vehicle_event(
    payload: dict[str, Any],
    x_alerts_secret: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
):
    provided = (x_alerts_secret or "").strip()
    if not provided and authorization:
        token = str(authorization).strip()
        if token.lower().startswith("bearer "):
            provided = token[7:].strip()
    if ALERTS_PUBLISH_SECRET and provided != ALERTS_PUBLISH_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized alert publish.")

    delivered = await alert_hub.publish(payload)
    return {"ok": True, "delivered_clients": delivered, "connected_clients": alert_hub.connected_count}


@app.get("/health", summary="Health check")
async def health():
    try:
        from plate_ocr_mvp.local_ocr import OCR_PIPELINE_REVISION
    except Exception:
        OCR_PIPELINE_REVISION = "unknown"
    return {
        "status": "ok",
        "alerts_connected_clients": alert_hub.connected_count,
        "camera_mjpeg_enabled": _mjpeg_enabled(),
        "plate_ocr_pipeline_ready": plate_ocr_pipeline_ready(),
        "ocr_pipeline_revision": OCR_PIPELINE_REVISION,
    }


@app.head("/camera/mjpeg", summary="MJPEG disponible (réponse immédiate, sans ouvrir le flux)")
async def camera_mjpeg_head():
    if not _mjpeg_enabled():
        raise HTTPException(
            status_code=503,
            detail="Camera MJPEG is disabled. On the Pi, set PI_CAMERA_MJPEG=1 and restart the API.",
        )
    return Response(status_code=200)


@app.get("/camera/mjpeg", summary="MJPEG stream from Raspberry Pi camera (Picamera2 / OpenCV)")
async def camera_mjpeg():
    if not _mjpeg_enabled():
        raise HTTPException(
            status_code=503,
            detail="Camera MJPEG is disabled. On the Pi, set PI_CAMERA_MJPEG=1 and restart the API.",
        )

    try:
        first_jpeg = await asyncio.to_thread(_mjpeg_capture_jpeg_bytes)
    except Exception as exc:
        logger.exception("MJPEG: first frame failed (stream not started)")
        raise HTTPException(
            status_code=503,
            detail=(
                f"Camera capture failed: {exc!s}. "
                "On the Pi: journalctl -u terrain-backend-api -n 40; "
                "check libcamera / Picamera2; ensure no other process uses the camera."
            ),
        ) from exc

    fps_raw = float(os.environ.get("PI_CAMERA_MJPEG_FPS", "12"))
    fps = max(1.0, min(fps_raw, 30.0))
    frame_delay = 1.0 / fps

    async def mjpeg_frames():
        boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
        # La 1re capture a déjà réussi (gate ci-dessus) — l'envoyer tout de suite.
        # Sinon le client reçoit HTTP 200 + corps vide si la 2e capture échoue aussitôt.
        yield boundary + first_jpeg + b"\r\n"
        while True:
            try:
                jpeg = await asyncio.to_thread(_mjpeg_capture_jpeg_bytes)
            except Exception:
                logger.exception("MJPEG: frame capture failed")
                break
            yield boundary + jpeg + b"\r\n"
            await asyncio.sleep(frame_delay)

    return StreamingResponse(
        mjpeg_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
