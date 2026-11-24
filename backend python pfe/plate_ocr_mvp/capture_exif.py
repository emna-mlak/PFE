from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Optional

import numpy as np

# EXIF DateTime expects: "YYYY:MM:DD HH:MM:SS"


def iso_to_exif_datetime(iso_str: str) -> str:
    """Convert ISO-8601 (with optional Z) to EXIF datetime string."""
    s = iso_str.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        dt = datetime.now(timezone.utc)
    return dt.strftime("%Y:%m:%d %H:%M:%S")


def _float_to_gps_rational_tuple(value: float) -> tuple[tuple[int, int], tuple[int, int], tuple[int, int]]:
    """Decimal degrees → ((deg,1), (min,1), (sec*10^6, 10^6)) for piexif."""
    v = abs(float(value))
    deg = int(v)
    min_float = (v - deg) * 60.0
    minutes = int(min_float)
    sec = (min_float - minutes) * 60.0
    sec_num = int(round(sec * 1_000_000))
    return ((deg, 1), (minutes, 1), (sec_num, 1_000_000))


def build_piexif_bytes(
    *,
    captured_at_iso: str,
    infraction_number: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> bytes:
    import piexif

    dt_exif = iso_to_exif_datetime(captured_at_iso)
    desc = infraction_number[:200].encode("utf-8")

    zeroth_ifd = {
        piexif.ImageIFD.ImageDescription: desc,
        piexif.ImageIFD.DateTime: dt_exif.encode("ascii"),
    }
    exif_ifd = {
        piexif.ExifIFD.DateTimeOriginal: dt_exif.encode("ascii"),
        piexif.ExifIFD.DateTimeDigitized: dt_exif.encode("ascii"),
    }

    exif_dict: dict = {
        "0th": zeroth_ifd,
        "Exif": exif_ifd,
        "1st": {},
        "thumbnail": None,
    }

    if latitude is not None and longitude is not None:
        lat = float(latitude)
        lon = float(longitude)
        gps_ifd = {
            piexif.GPSIFD.GPSVersionID: (2, 0, 0, 0),
            piexif.GPSIFD.GPSLatitudeRef: b"N" if lat >= 0 else b"S",
            piexif.GPSIFD.GPSLatitude: _float_to_gps_rational_tuple(lat),
            piexif.GPSIFD.GPSLongitudeRef: b"E" if lon >= 0 else b"W",
            piexif.GPSIFD.GPSLongitude: _float_to_gps_rational_tuple(lon),
        }
        exif_dict["GPS"] = gps_ifd

    return piexif.dump(exif_dict)


def encode_jpeg_bgr_with_capture_exif(
    image_bgr: np.ndarray,
    *,
    quality: int = 90,
    captured_at_iso: str,
    infraction_number: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> bytes:
    """Encode BGR image to JPEG bytes with EXIF (date, infraction #, optional GPS)."""
    import cv2
    import piexif

    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)]
    success, buffer = cv2.imencode(".jpg", image_bgr, encode_param)
    if not success:
        raise RuntimeError("Failed to encode JPEG")
    jpeg = buffer.tobytes()
    exif_bytes = build_piexif_bytes(
        captured_at_iso=captured_at_iso,
        infraction_number=infraction_number,
        latitude=latitude,
        longitude=longitude,
    )
    # piexif.insert en mémoire exige un 3ᵉ argument BytesIO (sinon ValueError).
    out = io.BytesIO()
    piexif.insert(exif_bytes, jpeg, out)
    return out.getvalue()
