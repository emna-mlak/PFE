from __future__ import annotations

import importlib.metadata
import logging
import os
import platform
import re
from typing import List, Tuple

import cv2
import numpy as np
from paddleocr import PaddleOCR

from .postprocess import clean_plate_text

logger = logging.getLogger(__name__)

# Bump when deploying to Pi — visible in GET /health (ocr_pipeline_revision).
OCR_PIPELINE_REVISION = "pi_paddle2_lite_v2"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _is_arm_device() -> bool:
    return platform.machine().lower() in {"aarch64", "arm64", "armv7l"}


def _default_lite_ocr() -> bool:
    """aarch64 (Raspberry Pi): fewer Paddle calls, no strip OCR, BGR only."""
    if os.environ.get("PADDLE_OCR_LITE") is not None:
        return _env_bool("PADDLE_OCR_LITE", False)
    return _is_arm_device()


def _use_mobile_models() -> bool:
    """Mobile det/rec on Pi — indépendant de PADDLE_OCR_LITE (mode recognize)."""
    if os.environ.get("PADDLE_OCR_MOBILE") is not None:
        return _env_bool("PADDLE_OCR_MOBILE", False)
    return _is_arm_device()


def _paddleocr_major_version() -> int:
    try:
        ver = importlib.metadata.version("paddleocr")
        return int(ver.split(".", 1)[0])
    except Exception:
        return 2


def _build_paddle_ocr(lang: str) -> PaddleOCR:
    mobile = _use_mobile_models()
    major = _paddleocr_major_version()

    if major >= 3:
        kwargs: dict = {
            "lang": lang,
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
            "device": os.environ.get("PADDLE_DEVICE", "cpu"),
            "enable_mkldnn": _env_bool("PADDLE_ENABLE_MKLDNN", not _is_arm_device()),
            "cpu_threads": int(os.environ.get("PADDLE_CPU_THREADS", "2" if _is_arm_device() else "8")),
        }
        if mobile:
            kwargs["text_detection_model_name"] = os.environ.get(
                "PADDLE_TEXT_DET_MODEL", "PP-OCRv5_mobile_det"
            )
            kwargs["text_recognition_model_name"] = os.environ.get(
                "PADDLE_TEXT_REC_MODEL", "PP-OCRv5_mobile_rec"
            )
        logger.info(
            "PaddleOCR %s (predict API) mobile=%s mkldnn=%s device=%s",
            importlib.metadata.version("paddleocr"),
            mobile,
            kwargs["enable_mkldnn"],
            kwargs["device"],
        )
        return PaddleOCR(**kwargs)

    # PaddleOCR 2.x — stable on Raspberry Pi (évite SIGSEGV Paddle 3 / PIR).
    kwargs_v2: dict = {
        "lang": lang,
        "use_angle_cls": False,
        "use_gpu": False,
        "show_log": False,
    }
    if mobile:
        kwargs_v2["det_model_dir"] = os.environ.get("PADDLE_DET_MODEL_DIR", "")
        kwargs_v2["rec_model_dir"] = os.environ.get("PADDLE_REC_MODEL_DIR", "")
        if not kwargs_v2["det_model_dir"]:
            kwargs_v2.pop("det_model_dir")
        if not kwargs_v2["rec_model_dir"]:
            kwargs_v2.pop("rec_model_dir")
    logger.info(
        "PaddleOCR %s (ocr API) mobile=%s — recommandé sur Pi : pip install 'paddleocr<3' paddlepaddle==2.6.2",
        importlib.metadata.version("paddleocr"),
        mobile,
    )
    return PaddleOCR(**kwargs_v2)


class LocalPlateOCR:
    """
    Local OCR for license plates using PaddleOCR (offline/on-device).
    No external API calls are made.
    """

    def __init__(self, paddle_lang: str = "en", min_sharpness_threshold: float | None = None) -> None:
        lang = (paddle_lang or "en").strip().lower()
        lang_aliases = {
            "eng": "en",
            "english": "en",
            "français": "fr",
            "french": "fr",
            "arabic": "ar",
        }
        lang = lang_aliases.get(lang, lang)
        self._lang = lang if lang else "en"
        self._lite = _default_lite_ocr()
        self._paddle_v3 = _paddleocr_major_version() >= 3
        try:
            self._ocr = _build_paddle_ocr(self._lang)
        except Exception as e:
            if self._lang != "en":
                try:
                    self._lang = "en"
                    self._ocr = _build_paddle_ocr("en")
                except Exception as e2:
                    raise RuntimeError(
                        "PaddleOCR initialization failed. Verify paddleocr/paddlepaddle install and language code."
                    ) from e2
            else:
                raise RuntimeError(
                    "PaddleOCR initialization failed. Verify paddleocr/paddlepaddle install and language code."
                ) from e
        if min_sharpness_threshold is None:
            min_sharpness_threshold = float(os.environ.get("MIN_SHARPNESS_THRESHOLD", "0") or 0.0)
        self._min_sharpness_threshold = max(0.0, float(min_sharpness_threshold))
        self._direct_pass_min_conf = float(os.environ.get("OCR_DIRECT_PASS_MIN_CONF", "0.82") or 0.82)

    @staticmethod
    def _laplacian_sharpness(image_bgr: np.ndarray) -> float:
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())

    @staticmethod
    def _preprocess_base(image_bgr: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        return cv2.bilateralFilter(gray, 7, 50, 50)

    @staticmethod
    def _value_channel_clahe(image_bgr: np.ndarray) -> np.ndarray:
        if image_bgr is None or image_bgr.size == 0:
            return np.zeros((1, 1), dtype=np.uint8)
        hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
        v = hsv[:, :, 2]
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
        return clahe.apply(v)

    @staticmethod
    def _deskew(gray: np.ndarray) -> np.ndarray:
        h, w = gray.shape[:2]
        if h < 20 or w < 40:
            return gray
        try:
            _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            pts = cv2.findNonZero(255 - th)
            if pts is None or len(pts) < 20:
                return gray
            rect = cv2.minAreaRect(pts)
            angle = float(rect[-1])
            if angle < -45.0:
                angle += 90.0
            if abs(angle) < 1.5 or abs(angle) > 20.0:
                return gray
            m = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, 1.0)
            return cv2.warpAffine(
                gray,
                m,
                (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE,
            )
        except Exception:
            return gray

    @staticmethod
    def _build_variants(base_gray: np.ndarray) -> List[np.ndarray]:
        variants: List[np.ndarray] = []
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        eq = clahe.apply(base_gray)
        variants.append(eq)

        _, otsu = cv2.threshold(eq, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        variants.append(otsu)
        variants.append(255 - otsu)

        adp = cv2.adaptiveThreshold(
            eq,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            25,
            9,
        )
        variants.append(adp)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        closed = cv2.morphologyEx(otsu, cv2.MORPH_CLOSE, kernel, iterations=1)
        variants.append(closed)

        sharp = cv2.addWeighted(eq, 1.5, cv2.GaussianBlur(eq, (0, 0), 1.2), -0.5, 0)
        variants.append(sharp)

        up = cv2.resize(sharp, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        variants.append(up)

        return variants

    @staticmethod
    def _norm_text(s: str) -> str:
        s = (s or "").upper().strip()
        s = re.sub(r"[^A-Z0-9]", "", s)
        return s

    @staticmethod
    def _digits_only(text: str) -> str:
        return re.sub(r"[^0-9]", "", text or "")

    @staticmethod
    def _ensure_bgr(img: np.ndarray) -> np.ndarray:
        if img is None or img.size == 0:
            return np.zeros((8, 8, 3), dtype=np.uint8)
        if img.ndim == 2:
            return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        if img.shape[2] == 4:
            return cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
        return img

    @staticmethod
    def _lines_from_paddle_result(result: object) -> list:
        lines: list = []
        if not isinstance(result, list) or len(result) == 0:
            return lines
        if isinstance(result[0], list):
            lines = result[0]
        elif isinstance(result[0], dict):
            rec_texts = list(result[0].get("rec_texts") or [])
            rec_scores = list(result[0].get("rec_scores") or [])
            for txt, score in zip(rec_texts, rec_scores):
                lines.append([None, (txt, score)])
        return lines

    def _ocr_with_paddle(self, img: np.ndarray) -> Tuple[str, float]:
        img = self._ensure_bgr(img)
        try:
            if self._paddle_v3:
                result = self._ocr.predict(img)
            else:
                result = self._ocr.ocr(img, cls=False)
        except Exception:
            logger.exception("Paddle OCR inference failed")
            return "", 0.0

        lines = self._lines_from_paddle_result(result)
        texts: List[str] = []
        confs: List[float] = []
        for item in lines or []:
            if not isinstance(item, list) or len(item) < 2:
                continue
            recog = item[1]
            if not isinstance(recog, tuple) or len(recog) < 2:
                continue
            txt = str(recog[0] or "").strip()
            if not txt:
                continue
            texts.append(txt)
            try:
                confs.append(float(recog[1]))
            except (TypeError, ValueError):
                continue
        raw = " ".join(texts).strip()
        conf = sum(confs) / len(confs) if confs else (0.0 if not raw else 0.55)
        return raw, max(0.0, min(1.0, conf))

    def _score_candidate(self, raw: str, conf: float) -> float:
        digits = self._digits_only(raw)
        cleaned = clean_plate_text(raw)
        score = conf
        if cleaned:
            score += 0.15
        if len(digits) in {6, 7}:
            score += 0.1
        return score

    def _pick_best(self, candidates: List[Tuple[str, float]]) -> Tuple[str, float]:
        best_raw, best_conf = "", 0.0
        best_score = -1.0
        for raw, conf in candidates:
            if not raw:
                continue
            score = self._score_candidate(raw, conf)
            if score > best_score:
                best_score = score
                best_raw, best_conf = raw, conf
        return best_raw, best_conf

    def _recognize_lite(self, work: np.ndarray) -> Tuple[str, float]:
        """Pi-safe: few BGR passes, no grayscale/strip OCR (avoids SIGSEGV)."""
        candidates: List[Tuple[str, float]] = []
        direct_raw, direct_conf = self._ocr_with_paddle(work)
        if direct_raw:
            candidates.append((direct_raw, direct_conf))

        v = self._value_channel_clahe(work)
        clahe_bgr = self._ensure_bgr(v)
        alt_raw, alt_conf = self._ocr_with_paddle(clahe_bgr)
        if alt_raw:
            candidates.append((alt_raw, alt_conf))

        gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
        sharp = cv2.addWeighted(gray, 1.5, cv2.GaussianBlur(gray, (0, 0), 1.2), -0.5, 0)
        sharp_bgr = self._ensure_bgr(sharp)
        alt2_raw, alt2_conf = self._ocr_with_paddle(sharp_bgr)
        if alt2_raw:
            candidates.append((alt2_raw, alt2_conf))

        if not candidates:
            return "", 0.0

        direct_digits = self._digits_only(direct_raw)
        if (
            len(direct_digits) >= 6
            and direct_conf >= max(0.0, min(1.0, self._direct_pass_min_conf))
        ):
            for raw, conf in candidates[1:]:
                if self._digits_only(raw)[-4:] != direct_digits[-4:] and len(self._digits_only(raw)) >= 6:
                    picked, pconf = self._pick_best(candidates)
                    if picked:
                        return picked, pconf
            return direct_raw, direct_conf

        return self._pick_best(candidates)

    def _best_fixed_length_digits(self, img: np.ndarray, target_len: int) -> Tuple[str, float]:
        best = ""
        best_score = -1.0
        best_conf = 0.0
        for variant in self._build_variants(img):
            txt, conf = self._ocr_with_paddle(self._ensure_bgr(variant))
            txt = re.sub(r"[^0-9]", "", txt)
            if not txt:
                continue
            candidates = [txt]
            if len(txt) > target_len:
                candidates = [txt[i : i + target_len] for i in range(0, len(txt) - target_len + 1)]
            for c in candidates:
                if len(c) != target_len:
                    continue
                score = conf + 0.2
                if score > best_score:
                    best_score = score
                    best_conf = conf
                    best = c
        return best, best_conf

    def _split_pass(
        self, base: np.ndarray, base_v: np.ndarray
    ) -> Tuple[str, float, float]:
        split_best_raw = ""
        split_best_conf = 0.0
        split_best_score = -1.0
        for gray_src in (base, base_v):
            h, w = gray_src.shape[:2]
            if w < 80 or h < 20:
                continue
            left = gray_src[:, : int(w * 0.42)]
            right = gray_src[:, int(w * 0.58) :]
            l3, c3 = self._best_fixed_length_digits(left, 3)
            r4, c4 = self._best_fixed_length_digits(right, 4)
            if l3 and r4:
                combined = (c3 + c4) / 2.0
                score = combined + 0.08
                if score > split_best_score:
                    split_best_score = score
                    split_best_conf = combined
                    split_best_raw = f"{l3}{r4}"
            r3, c3r = self._best_fixed_length_digits(right, 3)
            if l3 and r3:
                combined = (c3 + c3r) / 2.0
                score = combined + 0.05
                if score > split_best_score:
                    split_best_score = score
                    split_best_conf = combined
                    split_best_raw = f"{l3}{r3}"
        return split_best_raw, split_best_conf, split_best_score

    def recognize(self, image_bgr: np.ndarray) -> Tuple[str, float]:
        if self._min_sharpness_threshold > 0.0:
            sharpness = self._laplacian_sharpness(image_bgr)
            if sharpness < self._min_sharpness_threshold:
                return "", 0.0

        h0, w0 = image_bgr.shape[:2]
        work = image_bgr
        if min(h0, w0) < 80:
            work = cv2.resize(image_bgr, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)

        if self._lite:
            return self._recognize_lite(work)

        direct_raw, direct_conf = self._ocr_with_paddle(work)
        direct_digits = self._digits_only(direct_raw)

        base = self._preprocess_base(work)
        base = self._deskew(base)
        base_v = self._deskew(self._value_channel_clahe(work))

        if (
            len(direct_digits) >= 6
            and direct_conf >= max(0.0, min(1.0, self._direct_pass_min_conf))
        ):
            return direct_raw, direct_conf

        split_best_raw, split_best_conf, split_best_score = self._split_pass(base, base_v)

        variants = [
            self._ensure_bgr(base),
            self._ensure_bgr(base_v),
            work,
            self._ensure_bgr(self._value_channel_clahe(work)),
            *(self._ensure_bgr(v) for v in self._build_variants(base)),
            *(self._ensure_bgr(v) for v in self._build_variants(base_v)),
        ]

        best_raw = ""
        best_score = -1.0
        best_conf = 0.0

        for proc in variants:
            raw, conf = self._ocr_with_paddle(proc)
            norm = self._norm_text(raw)
            if not norm:
                continue

            digits_only = re.sub(r"[^0-9]", "", norm)
            if not digits_only:
                continue
            digit_density = len(digits_only) / max(1, len(norm))
            digit_bonus = 0.35 * digit_density
            plate_bonus = 0.25 if len(digits_only) in {6, 7} else 0.0
            target_len = 7 if len(digits_only) >= 7 else 6
            length_penalty = 0.02 * abs(len(digits_only) - target_len)
            score = conf + digit_bonus + plate_bonus - length_penalty

            if score > best_score:
                best_score = score
                best_conf = conf
                best_raw = raw

        if split_best_raw and (
            not best_raw
            or split_best_score >= best_score - 0.03
            or split_best_conf + 0.05 >= best_conf
        ):
            return split_best_raw, max(split_best_conf, 0.0)

        if not best_raw:
            return "", 0.0
        return best_raw, best_conf
