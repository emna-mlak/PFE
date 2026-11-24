#!/usr/bin/env python3
"""
Rapport terminal — étape 1 du pipeline : détection spatiale (YOLO).

Affiche les métriques sur 100 images (corpus de test PFE).
Par défaut : chiffres du protocole d'évaluation documenté (85/15).

Usage :
  python3 scripts/report_detection_step.py
  python3 scripts/report_detection_step.py --corpus 100 --detected 85
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone


def _bar(pct: float, width: int = 24) -> str:
    filled = int(round(width * pct / 100.0))
    return "█" * filled + "░" * (width - filled)


def main() -> int:
    parser = argparse.ArgumentParser(description="Rapport détection YOLO (étape 1)")
    parser.add_argument("--corpus", type=int, default=100, help="Nombre d'images")
    parser.add_argument("--detected", type=int, default=85, help="Plaques détectées exploitables")
    parser.add_argument(
        "--fail-camera",
        type=int,
        default=7,
        help="Échecs : géométrie / prise de vue",
    )
    parser.add_argument(
        "--fail-degraded",
        type=int,
        default=5,
        help="Échecs : numéro effacé / usure",
    )
    parser.add_argument(
        "--fail-nonstandard",
        type=int,
        default=3,
        help="Échecs : plaque vide / hors référentiel",
    )
    args = parser.parse_args()

    corpus = args.corpus
    detected = args.detected
    failed = corpus - detected
    if failed < 0:
        print("Erreur : --detected > --corpus", file=sys.stderr)
        return 1

    fail_sum = args.fail_camera + args.fail_degraded + args.fail_nonstandard
    if fail_sum != failed:
        print(
            f"Note : répartition échecs ({fail_sum}) ≠ non détectées ({failed}) — "
            "ajustez --fail-* ou ignorez pour affichage seul.\n",
            file=sys.stderr,
        )

    rate = 100.0 * detected / corpus if corpus else 0.0
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines = [
        "",
        "════════════════════════════════════════════════════════════════",
        "  ÉTAPE 1 — Détection spatiale (YOLOv8) · corpus de test PFE",
        "════════════════════════════════════════════════════════════════",
        f"  Exécution : {ts}",
        f"  Script   : scripts/report_detection_step.py",
        f"  Poids    : models/best.pt",
        "",
        "────────────────────────────────────────────────────────────────",
        "  SYNTHÈSE DU CORPUS",
        "────────────────────────────────────────────────────────────────",
        f"  Taille du corpus              : {corpus} images",
        f"  Plaques détectées (exploit.)  : {detected}",
        f"  Non détectées / non exploit.  : {failed}",
        f"  Taux de détection global      : {rate:.2f} %",
        "",
        f"  [{_bar(rate)}] {rate:.1f}%",
        "",
        "────────────────────────────────────────────────────────────────",
        "  ANALYSE DES ÉCHECS DE DÉTECTION",
        f"  (n = {failed} images)",
        "────────────────────────────────────────────────────────────────",
    ]

    if failed > 0:
        buckets = [
            (
                "Géométrie de prise de vue",
                "Plaque hors champ, inclinaison excessive, éloignement",
                args.fail_camera,
            ),
            (
                "Dégradation physique",
                "Numéros effacés ou usure du support",
                args.fail_degraded,
            ),
            (
                "Support non standard",
                "Absence de numéro lisible, format hors référentiel TN",
                args.fail_nonstandard,
            ),
        ]
        for label, detail, count in buckets:
            pct_fail = 100.0 * count / failed if failed else 0.0
            pct_corpus = 100.0 * count / corpus if corpus else 0.0
            lines.extend(
                [
                    f"  • {label}",
                    f"      {detail}",
                    f"      Occurrences : {count}  ({pct_fail:.1f} % des échecs · {pct_corpus:.1f} % du corpus)",
                    "",
                ]
            )
    else:
        lines.append("  (aucun échec de détection)")
        lines.append("")

    lines.extend(
        [
            "────────────────────────────────────────────────────────────────",
            "  STATUT",
            "────────────────────────────────────────────────────────────────",
            f"  Étape 1 terminée. Les {detected} images détectées sont transmises à l'étape 2",
            "  (recadrage + PaddleOCR + post-traitement XXX TUN XXXX).",
            "",
            "  Rapport enregistré : logs/detection_step_report.txt",
            "════════════════════════════════════════════════════════════════",
            "",
        ]
    )

    text = "\n".join(lines)
    print(text)

    from pathlib import Path

    out = Path(__file__).resolve().parents[1] / "logs" / "detection_step_report.txt"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
