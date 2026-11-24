#!/usr/bin/env python3
"""
Flux MJPEG minimal pour Picamera2 via le Python SYSTÈME (apt libcamera 0.7).
À lancer séparément du venv Paddle 3.12 :

  PI_CAMERA_MJPEG=1 python3 scripts/raspberry-pi/mjpeg_sidecar.py --port 8001

Le backend principal (uvicorn .venv Python 3.12) peut laisser PI_CAMERA_MJPEG=0 ;
le proxy Mac pointe vers http://10.42.0.1:8001/camera/mjpeg
"""
from __future__ import annotations

import argparse
import io
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw or not str(raw).strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _open_picamera2(width: int, height: int):
    from picamera2 import Picamera2  # noqa: PLC0415 — system python only

    camera = Picamera2()
    config = camera.create_preview_configuration(main={"size": (width, height), "format": "RGB888"})
    camera.configure(config)
    camera.start()
    delay = float(os.environ.get("PI_CAMERA_MJPEG_START_DELAY_SEC", "1.5"))
    if delay > 0:
        time.sleep(delay)
    return camera


_picam = None
_width = 1280
_height = 720
_quality = 85


def _capture_jpeg() -> bytes:
    global _picam
    if _picam is None:
        _picam = _open_picamera2(_width, _height)
    rgb = _picam.capture_array()
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    q = max(40, min(_quality, 95))
    ok, buf = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), q])
    if not ok or buf is None:
        raise RuntimeError("JPEG encode failed")
    return buf.tobytes()


class MjpegHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        pass

    def do_HEAD(self) -> None:
        if self.path.split("?")[0] not in {"/camera/mjpeg", "/"}:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        if path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok","service":"mjpeg-sidecar"}')
            return
        if path not in {"/camera/mjpeg", "/"}:
            self.send_error(404)
            return

        fps = max(1.0, min(float(os.environ.get("PI_CAMERA_MJPEG_FPS", "12")), 30.0))
        delay = 1.0 / fps
        boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"

        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.end_headers()

        try:
            while True:
                jpeg = _capture_jpeg()
                self.wfile.write(boundary + jpeg + b"\r\n")
                self.wfile.flush()
                time.sleep(delay)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as exc:
            print(f"[mjpeg-sidecar] capture error: {exc}", flush=True)


def main() -> None:
    global _width, _height, _quality
    parser = argparse.ArgumentParser(description="MJPEG sidecar (system Python + Picamera2)")
    parser.add_argument("--host", default=os.environ.get("MJPEG_SIDECAR_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("MJPEG_SIDECAR_PORT", "8001")))
    args = parser.parse_args()

    _width = _env_int("PI_CAMERA_MJPEG_WIDTH", 1280)
    _height = _env_int("PI_CAMERA_MJPEG_HEIGHT", 720)
    _quality = _env_int("PI_CAMERA_MJPEG_JPEG_QUALITY", 85)

    if os.environ.get("PI_CAMERA_MJPEG", "1").strip().lower() not in {"1", "true", "yes", "on"}:
        raise SystemExit("PI_CAMERA_MJPEG must be enabled for the sidecar.")

    print(f"[mjpeg-sidecar] warmup frame… ({_width}x{_height})")
    _capture_jpeg()
    server = ThreadingHTTPServer((args.host, args.port), MjpegHandler)
    print(f"[mjpeg-sidecar] http://{args.host}:{args.port}/camera/mjpeg")
    server.serve_forever()


if __name__ == "__main__":
    import sys

    if sys.executable and ".venv" in sys.executable:
        print(
            "[mjpeg-sidecar] ERREUR : lancez avec le Python SYSTÈME, pas le venv Paddle :\n"
            "  deactivate\n"
            "  PI_CAMERA_MJPEG=1 /usr/bin/python3 scripts/raspberry-pi/mjpeg_sidecar.py --port 8001",
            flush=True,
        )
        raise SystemExit(1)
    main()
