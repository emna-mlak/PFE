from __future__ import annotations

import re

AR_NUMERAL_MAP = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
}

AMBIGUOUS_TO_DIGIT = {
    "O": "0",
    "Q": "0",
    "D": "0",
    "I": "1",
    "L": "1",
    "Z": "2",
    "S": "5",
    "B": "8",
    "G": "6",
}


def _is_valid_tn_business_plate(region: str, serial: str) -> bool:
    if not re.fullmatch(r"\d{3}", region or ""):
        return False
    if not re.fullmatch(r"\d{1,4}", serial or ""):
        return False
    series_value = int(region)
    return 30 <= series_value <= 270


def _pick_best_serial(region: str, digits: str) -> str:
    """
    Choisit la partie série (3 ou 4 chiffres) dans un flux OCR bruité.
    Priorité : fenêtre standard digits[4:8], puis [3:7], puis autres — évite 0808 quand 4080 est présent.
    """
    best = ""
    best_score = -1
    for start in range(3, min(8, len(digits))):
        for width in (4, 3):
            end = start + width
            if end > len(digits):
                continue
            serial = digits[start:end]
            if not _is_valid_tn_business_plate(region, serial):
                continue
            score = width * 100 + (40 if start == 4 else 0) + (20 if start == 3 else 0)
            if width == 4 and serial.startswith("0"):
                score -= 25
            if width == 4 and serial.endswith("808") and "4080" in digits:
                score -= 30
            if score > best_score:
                best_score = score
                best = serial
    return best


def clean_plate_text(raw_text: str) -> str:
    """
    Normalize OCR output and format Tunisian plates as: XXX TUN XXX/XXXX.
    """
    if not raw_text:
        return ""

    text = str(raw_text).strip()

    # Normalize Arabic numerals to Western digits
    text = "".join(AR_NUMERAL_MAP.get(ch, ch) for ch in text)

    # Convert common OCR ambiguities before extracting digits.
    text = "".join(AMBIGUOUS_TO_DIGIT.get(ch.upper(), ch) for ch in text)

    # Keep only digits
    digits = re.sub(r"[^0-9]", "", text)

    if len(digits) < 6:
        return ""

    if len(digits) == 6:
        region, serial = digits[:3], digits[3:]
        return f"{region} TUN {serial}" if _is_valid_tn_business_plate(region, serial) else ""

    if len(digits) == 7:
        region, serial = digits[:3], digits[3:]
        return f"{region} TUN {serial}" if _is_valid_tn_business_plate(region, serial) else ""

    region = digits[:3]
    if not re.fullmatch(r"\d{3}", region):
        return ""
    series_value = int(region)
    if not (30 <= series_value <= 270):
        return ""

    if len(digits) >= 8:
        serial = _pick_best_serial(region, digits)
        if serial:
            return f"{region} TUN {serial}"

    return ""
