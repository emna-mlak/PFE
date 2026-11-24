#!/usr/bin/env python3
"""
Génère tests/dataset/labels.csv à partir de logs/test_results.json.

Colonne predicted_hint = lecture OCR (à vérifier / corriger).
Remplissez ground_truth puis : python3 scripts/analyze_test_results.py

Usage :
  python3 scripts/make_labels_template.py
  python3 scripts/make_labels_template.py --results logs/test_results.json
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import importlib.util

_analyze_path = PROJECT_ROOT / "scripts" / "analyze_test_results.py"
_spec = importlib.util.spec_from_file_location("analyze_test_results", _analyze_path)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_mod)
ground_truth_from_filename = _mod.ground_truth_from_filename
_normalize_plate = _mod._normalize_plate


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--results",
        type=Path,
        default=PROJECT_ROOT / "logs" / "test_results.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "tests" / "dataset" / "labels.csv",
    )
    args = parser.parse_args()

    if not args.results.is_file():
        print(f"Fichier introuvable : {args.results}\nLancez d'abord : python3 scripts/infer_test.py", file=sys.stderr)
        return 1

    data = json.loads(args.results.read_text(encoding="utf-8"))
    rows = data if isinstance(data, list) else data.get("results", [])

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["filename", "ground_truth", "predicted_hint", "status"])
        for row in rows:
            img = row.get("image") or ""
            name = Path(img).name
            gt = _normalize_plate(str(row.get("ground_truth") or "")) or ground_truth_from_filename(Path(name))
            hint = row.get("plate_text") or ""
            w.writerow([name, gt, hint, row.get("status", "")])

    print(f"Écrit : {args.output}")
    print(
        "→ Ouvrez le CSV, corrigez la colonne ground_truth (format : 217 TUN 4080), "
        "puis : python3 scripts/analyze_test_results.py"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
