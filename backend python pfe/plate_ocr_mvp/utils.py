from __future__ import annotations

import base64
import os
from typing import Optional

import cv2
import numpy as np


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def encode_image_to_base64_jpeg(image_bgr: np.ndarray, quality: int = 90) -> str:
    """
    Encode an OpenCV BGR image to base64 JPEG.
    """
    if image_bgr is None:
        raise ValueError("image_bgr is None")

    if image_bgr.ndim != 3 or image_bgr.shape[2] != 3:
        raise ValueError("Expected a BGR image with shape (H, W, 3)")

    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)]
    success, buffer = cv2.imencode(".jpg", image_bgr, encode_param)
    if not success:
        raise RuntimeError("Failed to encode image to JPEG")

    return base64.b64encode(buffer.tobytes()).decode("utf-8")


def safe_crop_xyxy(
    image_bgr: np.ndarray,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    padding_ratio: float = 0.06,
) -> Optional[np.ndarray]:
    """
    Crop with padding while keeping coordinates inside the image.
    """
    if image_bgr is None:
        return None
    h, w = image_bgr.shape[:2]

    px1, py1, px2, py2 = x1, y1, x2, y2
    bw = max(1, px2 - px1)
    bh = max(1, py2 - py1)
    pad_x = int(bw * padding_ratio)
    pad_y = int(bh * padding_ratio)

    px1 = max(0, px1 - pad_x)
    py1 = max(0, py1 - pad_y)
    px2 = min(w - 1, px2 + pad_x)
    py2 = min(h - 1, py2 + pad_y)

    if px2 <= px1 or py2 <= py1:
        return None
    return image_bgr[py1:py2, px1:px2].copy()

