"""
Analyse des résultats de test OCR plaques tunisiennes (corpus tests/dataset/).

Lit logs/test_results.json (scripts/infer_test.py) et produit logs/rapport_metriques.md.

Métriques :
  - taux de réussite (lecture conforme au ground truth, format XXX TUN XXXX wella le plaques lokhrin)
  - confiance moyenne PaddleOCR (ocr_confidence) sur les succès
  - répartition des échecs par cause identifiable

Usage :
  python scripts/analyze_test_results.py
  python scripts/infer_test.py && python scripts/analyze_test_results.py
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from collections import Counter
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

PLATE_OK_RE = re.compile(r"^(\d{3}) TUN (\d{3,4})$")
GT_FROM_NAME_RE = re.compile(
    r"(?i)(?:^|[_\-.])(\d{3})[_\-. ]?TUN[_\-. ]?(\d{3,4})(?:[_\-.]|$)"
)
GT_COMPACT_RE = re.compile(r"(?i)^(\d{3})TUN(\d{3,4})$")

FAILURE_LABELS = {
    "detection_yolo": "Échec de détection YOLO (plaque absente, tronquée ou hors champ)",
    "flou": "Image floue (netteté Laplacienne faible)",
    "post_traitement_serie": "Rejet post-traitement (série 030–270 ou format invalide)",
    "ocr_faible_confiance": "OCR Paddle avec confiance faible",
    "ocr_ou_post_traitement": "Échec OCR ou post-traitement",
    "erreur_serie_region": "Erreur sur les 3 chiffres de série (région)",
    "erreur_serie_numero": "Erreur sur le numéro de série",
    "erreur_lecture_complete": "Erreur de lecture globale",
    "ground_truth_manquant": "Vérité terrain absente (nom de fichier non conforme)",
}


def ground_truth_from_filename(path: Path) -> str:
    stem = path.stem
    m = GT_COMPACT_RE.match(stem)
    if m:
        return f"{m.group(1)} TUN {m.group(2)}"
    m = GT_FROM_NAME_RE.search(stem.replace(" ", "_"))
    if m:
        return f"{m.group(1)} TUN {m.group(2)}"
    return ""


def load_labels_map(labels_path: Path | None) -> dict[str, str]:
    """
    Charge la vérité terrain depuis labels.csv ou labels.json.

    CSV : filename,ground_truth  (ou colonnes file / plate)
    JSON : {"fichier.png": "217 TUN 4080", ...}
    """
    if labels_path is None or not labels_path.is_file():
        return {}

    out: dict[str, str] = {}
    if labels_path.suffix.lower() == ".json":
        data = json.loads(labels_path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            for k, v in data.items():
                gt = _normalize_plate(str(v))
                if gt:
                    out[Path(k).name] = gt
                    out[str(k)] = gt
        return out

    import csv

    with labels_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return out
        fields = {c.strip().lower(): c for c in reader.fieldnames if c}
        file_col = fields.get("filename") or fields.get("file") or fields.get("image") or fields.get("fichier")
        gt_col = (
            fields.get("ground_truth")
            or fields.get("expected")
            or fields.get("plate")
            or fields.get("plaque")
            or fields.get("label")
        )
        if not file_col or not gt_col:
            raise ValueError(
                f"{labels_path} : colonnes requises filename + ground_truth "
                f"(trouvé : {list(reader.fieldnames)})"
            )
        for row in reader:
            name = (row.get(file_col) or "").strip()
            if not name:
                continue
            gt = _normalize_plate((row.get(gt_col) or "").strip())
            if gt:
                out[Path(name).name] = gt
                out[name] = gt
    return out


def resolve_ground_truth(
    path: Path,
    labels: dict[str, str],
    *,
    row_gt: str = "",
) -> str:
    gt = _normalize_plate(row_gt)
    if gt:
        return gt
    if path.name in labels:
        return labels[path.name]
    if str(path) in labels:
        return labels[str(path)]
    return ground_truth_from_filename(path)


def _normalize_plate(text: str) -> str:
    from plate_ocr_mvp.postprocess import clean_plate_text

    cleaned = clean_plate_text(text or "")
    if cleaned:
        return cleaned
    s = (text or "").upper().strip()
    m = PLATE_OK_RE.match(s)
    if m:
        return f"{m.group(1)} TUN {m.group(2)}"
    return ""


def is_valid_tn_plate(plate: str) -> bool:
    m = PLATE_OK_RE.match((plate or "").strip())
    if not m:
        return False
    return 30 <= int(m.group(1)) <= 270


class Sample:
    __slots__ = (
        "image_path",
        "ground_truth",
        "status",
        "plate_text",
        "ocr_confidence",
        "yolo_confidence",
        "raw_ocr_text",
        "sharpness",
    )

    def __init__(
        self,
        image_path: str,
        ground_truth: str,
        status: str,
        plate_text: str,
        ocr_confidence: float,
        yolo_confidence: float,
        raw_ocr_text: str,
        sharpness: float | None = None,
    ) -> None:
        self.image_path = image_path
        self.ground_truth = ground_truth
        self.status = status
        self.plate_text = plate_text
        self.ocr_confidence = ocr_confidence
        self.yolo_confidence = yolo_confidence
        self.raw_ocr_text = raw_ocr_text
        self.sharpness = sharpness


def _region_serial(plate: str) -> tuple[str, str]:
    m = PLATE_OK_RE.match(plate.strip())
    if not m:
        return "", ""
    return m.group(1), m.group(2)


def classify_failure(s: Sample) -> str:
    pred = _normalize_plate(s.plate_text)
    gt = _normalize_plate(s.ground_truth)
    if not gt:
        return "ground_truth_manquant"

    if s.status == "not_detected" or s.yolo_confidence <= 0:
        return "detection_yolo"

    if s.sharpness is not None and s.sharpness < 50.0 and not (s.raw_ocr_text or "").strip():
        return "flou"

    if not pred:
        if re.sub(r"[^0-9]", "", s.raw_ocr_text or "") and not _normalize_plate(s.raw_ocr_text):
            return "post_traitement_serie"
        if (s.raw_ocr_text or "").strip() and s.ocr_confidence < 0.5:
            return "ocr_faible_confiance"
        return "ocr_ou_post_traitement"

    if pred == gt:
        return "succes"

    pr, ps = _region_serial(pred)
    gr, gs = _region_serial(gt)
    if pr != gr and ps != gs:
        return "erreur_lecture_complete"
    if pr != gr:
        return "erreur_serie_region"
    return "erreur_serie_numero"


def load_results_json(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("results"), list):
        return data["results"]
    raise ValueError(f"Format JSON non reconnu : {path}")


def row_to_sample(
    row: dict[str, Any],
    dataset_dir: Path,
    labels: dict[str, str] | None = None,
) -> Sample | None:
    img = row.get("image") or row.get("image_path") or row.get("file") or ""
    p = Path(img)
    if not p.is_absolute():
        candidate = dataset_dir / p.name
        p = candidate if candidate.exists() else Path(img)

    gt = resolve_ground_truth(
        p,
        labels or {},
        row_gt=str(row.get("ground_truth") or row.get("expected") or ""),
    )
    if not gt:
        return None

    return Sample(
        image_path=str(p),
        ground_truth=gt,
        status=str(row.get("status") or ""),
        plate_text=str(row.get("plate_text") or ""),
        ocr_confidence=float(row.get("ocr_confidence") or 0.0),
        yolo_confidence=float(row.get("yolo_confidence") or 0.0),
        raw_ocr_text=str(row.get("raw_ocr_text") or ""),
        sharpness=float(row["sharpness"]) if row.get("sharpness") is not None else None,
    )


def compute_metrics(samples: list[Sample]) -> dict[str, Any]:
    with_gt = [s for s in samples if s.ground_truth]
    successes: list[Sample] = []
    failures: list[Sample] = []
    failure_causes: Counter[str] = Counter()

    for s in with_gt:
        pred = _normalize_plate(s.plate_text)
        ok = (
            s.status == "success"
            and pred == s.ground_truth
            and is_valid_tn_plate(pred)
        )
        if ok:
            successes.append(s)
        else:
            failures.append(s)
            cause = classify_failure(s)
            if cause != "succes":
                failure_causes[cause] += 1

    n = len(with_gt)
    n_ok = len(successes)
    n_fail = len(failures)
    ocr_confs = [s.ocr_confidence for s in successes if s.ocr_confidence > 0]
    fail_total = sum(failure_causes.values()) or max(n_fail, 1)

    return {
        "total_images": n,
        "success_count": n_ok,
        "failure_count": n_fail,
        "success_rate_pct": round(100.0 * n_ok / n, 2) if n else 0.0,
        "failure_rate_pct": round(100.0 * n_fail / n, 2) if n else 0.0,
        "ocr_confidence_mean": round(statistics.mean(ocr_confs), 4) if ocr_confs else None,
        "ocr_confidence_median": round(statistics.median(ocr_confs), 4) if ocr_confs else None,
        "ocr_confidence_stdev": round(statistics.pstdev(ocr_confs), 4) if len(ocr_confs) > 1 else None,
        "failure_causes": dict(failure_causes),
        "failure_causes_pct_of_failures": {
            k: round(100.0 * v / fail_total, 2) for k, v in failure_causes.most_common()
        },
        "status_breakdown": dict(Counter(s.status for s in with_gt)),
    }


def render_markdown(metrics: dict[str, Any], *, results_path: Path, dataset_dir: Path) -> str:
    m = metrics
    causes = m.get("failure_causes") or {}
    cause_pct = m.get("failure_causes_pct_of_failures") or {}

    lines = [
        "## Évaluation quantitative — reconnaissance de plaques tunisiennes",
        "",
        f"*Corpus : `{dataset_dir}` — {m['total_images']} images avec vérité terrain.*",
        f"*Source : `{results_path}`.*",
        "",
        "### 1. Taux de réussite global",
        "",
        "| Indicateur | Valeur |",
        "|------------|--------|",
        f"| Images évaluées | {m['total_images']} |",
        f"| Lectures correctes (`XXX TUN XXXX`) | **{m['success_count']}** |",
        f"| Lectures échouées | {m['failure_count']} |",
        f"| **Taux de réussite** | **{m['success_rate_pct']}%** |",
        f"| Taux d'échec | {m['failure_rate_pct']}% |",
        "",
        "Lecture **réussie** : statut `success`, format `XXX TUN XXXX` (série 030–270), "
        "texte identique au ground truth (nom de fichier).",
        "",
        "### 2. Confiance PaddleOCR (succès uniquement)",
        "",
    ]

    if m["ocr_confidence_mean"] is not None:
        mean = m["ocr_confidence_mean"]
        lines.extend(
            [
                "| Statistique | Valeur |",
                "|-------------|--------|",
                f"| Moyenne `ocr_confidence` | **{mean:.2%}** ({mean}) |",
                f"| Médiane | {m['ocr_confidence_median']} |",
                f"| Écart-type | {m['ocr_confidence_stdev'] if m['ocr_confidence_stdev'] is not None else '—'} |",
                "",
            ]
        )
    else:
        lines.append("*Aucune lecture réussie avec confiance OCR enregistrée.*\n")

    lines.extend(
        [
            "### 3. Répartition des causes d'échec",
            "",
            f"*Base : {m['failure_count']} échecs (% calculés sur les échecs).*",
            "",
            "| Cause | Occurrences | % des échecs |",
            "|-------|-------------|--------------|",
        ]
    )
    for key, count in sorted(causes.items(), key=lambda x: -x[1]):
        pct = cause_pct.get(key, 0.0)
        label = FAILURE_LABELS.get(key, key)
        lines.append(f"| {label} | {count} | {pct}% |")
    if not causes:
        lines.append("| — | 0 | — |")

    lines.extend(["", "### 4. Statuts pipeline", "", "| Statut | Occurrences |", "|--------|-------------|"])
    for st, cnt in sorted((m.get("status_breakdown") or {}).items(), key=lambda x: -x[1]):
        lines.append(f"| `{st}` | {cnt} |")

    lines.extend(
        [
            "",
            "### 5. Protocole",
            "",
            "- Détection YOLOv8, OCR PaddleOCR local, post-traitement `XXX TUN XXXX`.",
            "- Ground truth : nom de fichier `NNN_TUN_MMMM` ou `NNNTUNMMMM`.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Métriques corpus test plaques TN")
    parser.add_argument("--dataset", type=Path, default=PROJECT_ROOT / "tests" / "dataset")
    parser.add_argument("--results", type=Path, default=PROJECT_ROOT / "logs" / "test_results.json")
    parser.add_argument("--report", type=Path, default=PROJECT_ROOT / "logs" / "rapport_metriques.md")
    parser.add_argument(
        "--labels",
        type=Path,
        default=None,
        help="labels.csv ou labels.json (défaut : tests/dataset/labels.csv)",
    )
    args = parser.parse_args()

    labels_path = args.labels
    if labels_path is None:
        for candidate in (
            args.dataset / "labels.csv",
            args.dataset / "labels.json",
        ):
            if candidate.is_file():
                labels_path = candidate
                break
    labels = load_labels_map(labels_path)

    if not args.results.exists():
        print(
            f"Fichier introuvable : {args.results}\n"
            "Lancez d'abord : python scripts/infer_test.py",
            file=sys.stderr,
        )
        return 1

    rows = load_results_json(args.results)
    samples: list[Sample] = []
    skipped = 0
    for row in rows:
        s = row_to_sample(row, args.dataset, labels)
        if s is None:
            skipped += 1
            continue
        samples.append(s)

    if not samples:
        print(
            "Aucun échantillon avec ground truth.\n"
            "  • Renommez : 217_TUN_4080.jpg\n"
            "  • Ou créez tests/dataset/labels.csv :\n"
            "      python3 scripts/make_labels_template.py\n"
            "    puis complétez la colonne ground_truth et relancez infer_test + analyze.",
            file=sys.stderr,
        )
        return 1

    metrics = compute_metrics(samples)
    md = render_markdown(metrics, results_path=args.results, dataset_dir=args.dataset)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(md, encoding="utf-8")
    print(md)
    print(f"\n---\nRapport : {args.report}")
    if skipped:
        print(f"{skipped} entrées ignorées (pas de GT).", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
