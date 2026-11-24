#!/usr/bin/env python3
""" hedhom ls ficheirs de test
Inférence batch sur le corpus de test (tests/dataset/).

Produit logs/test_results.json pour scripts/analyze_test_results.py.

Ground truth (au moins une option) :
  1) Nom de fichier : 217_TUN_4080.jpg
  2) tests/dataset/labels.csv : filename,ground_truth

Usage :
  python3 scripts/infer_test.py
  python3 scripts/make_labels_template.py   # après 1ère inférence, si captures d'écran
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

_analyze_path = PROJECT_ROOT / "scripts" / "analyze_test_results.py"
_spec = importlib.util.spec_from_file_location("analyze_test_results", _analyze_path)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_mod)
load_labels_map = _mod.load_labels_map
resolve_ground_truth = _mod.resolve_ground_truth


def _build_pipeline():
    from dotenv import load_dotenv

    load_dotenv()

    from plate_ocr_mvp.detector import YoloPlateDetectorConfig
    from plate_ocr_mvp.pipeline import PlateOCRPipeline, PlateOCRPipelineConfig

    weights = os.environ.get("YOLO_WEIGHTS", "models/best.pt")
    conf = float(os.environ.get("YOLO_CONF_THRESHOLD", "0.25"))
    imgsz = int(os.environ.get("YOLO_INFER_IMGSZ", "640"))
    augment = os.environ.get("YOLO_AUGMENT", "0").strip().lower() in {"1", "true", "yes", "on"}
    paddle_lang = os.environ.get("PADDLE_OCR_LANG", "en")

    return PlateOCRPipeline(
        PlateOCRPipelineConfig(
            detector_cfg=YoloPlateDetectorConfig(
                weights_path=weights,
                conf_threshold=conf,
                infer_imgsz=imgsz,
                augment=augment,
            ),
            paddle_lang=paddle_lang,
            save_cropped_plate=False,
            outputs_dir=os.environ.get("OUTPUTS_DIR", "outputs"),
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Inférence batch corpus test plaques TN")
    parser.add_argument("--dataset", type=Path, default=PROJECT_ROOT / "tests" / "dataset")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "logs" / "test_results.json")
    parser.add_argument("--labels", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    if not args.dataset.is_dir():
        print(f"Dataset introuvable : {args.dataset}", file=sys.stderr)
        return 1

    labels_path = args.labels
    if labels_path is None:
        for c in (args.dataset / "labels.csv", args.dataset / "labels.json"):
            if c.is_file():
                labels_path = c
                break
    labels = load_labels_map(labels_path)

    exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    images = sorted(p for p in args.dataset.iterdir() if p.is_file() and p.suffix.lower() in exts)
    if args.limit > 0:
        images = images[: args.limit]
    if not images:
        print(f"Aucune image dans {args.dataset}", file=sys.stderr)
        return 1

    pipeline = _build_pipeline()
    ocr_sharp = None
    results: list[dict] = []
    no_gt = 0

    for i, img_path in enumerate(images, 1):
        gt = resolve_ground_truth(img_path, labels)
        if not gt:
            no_gt += 1

        out = pipeline.process_image(str(img_path))
        sharpness = None
        try:
            import cv2
            from plate_ocr_mvp.local_ocr import LocalPlateOCR

            if ocr_sharp is None:
                ocr_sharp = LocalPlateOCR()
            bgr = cv2.imread(str(img_path), cv2.IMREAD_COLOR)
            if bgr is not None:
                sharpness = float(ocr_sharp._laplacian_sharpness(bgr))
        except Exception:
            pass

        rel = (
            str(img_path.relative_to(PROJECT_ROOT))
            if img_path.is_relative_to(PROJECT_ROOT)
            else str(img_path)
        )
        record = {"image": rel, "ground_truth": gt, "sharpness": sharpness, **out}
        results.append(record)
        plate = out.get("plate_text") or "—"
        gt_tag = f" [GT:{gt}]" if gt else ""
        print(f"[{i}/{len(images)}] {img_path.name} → {out.get('status')} | {plate}{gt_tag}")

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset_dir": str(args.dataset),
        "labels_file": str(labels_path) if labels_path else None,
        "count": len(results),
        "without_ground_truth": no_gt,
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nÉcrit : {args.output} ({len(results)} images)")

    if no_gt:
        print(
            f"\n{no_gt} image(s) sans ground truth.\n"
            "  python3 scripts/make_labels_template.py\n"
            "  → éditez tests/dataset/labels.csv (colonne ground_truth)\n"
            "  python3 scripts/analyze_test_results.py",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
