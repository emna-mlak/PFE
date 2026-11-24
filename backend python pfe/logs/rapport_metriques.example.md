## Évaluation quantitative — reconnaissance de plaques tunisiennes

*Corpus : `/Users/mac/Desktop/mon pfe/backend python pfe/tests/dataset` — 3 images avec vérité terrain.*
*Source : `logs/test_results.example.json`.*

### 1. Taux de réussite global

| Indicateur | Valeur |
|------------|--------|
| Images évaluées | 3 |
| Lectures correctes (`XXX TUN XXXX`) | **1** |
| Lectures échouées | 2 |
| **Taux de réussite** | **33.33%** |
| Taux d'échec | 66.67% |

Lecture **réussie** : statut `success`, format `XXX TUN XXXX` (série 030–270), texte identique au ground truth (nom de fichier).

### 2. Confiance PaddleOCR (succès uniquement)

| Statistique | Valeur |
|-------------|--------|
| Moyenne `ocr_confidence` | **91.00%** (0.91) |
| Médiane | 0.91 |
| Écart-type | None |

### 3. Répartition des causes d'échec

*Base : 2 échecs (% calculés sur les échecs).*

| Cause | Occurrences | % des échecs |
|-------|-------------|--------------|
| Échec de détection YOLO (plaque absente, tronquée ou hors champ) | 1 | 50.0% |
| Erreur sur le numéro de série | 1 | 50.0% |

### 4. Statuts pipeline

| Statut | Occurrences |
|--------|-------------|
| `success` | 2 |
| `not_detected` | 1 |

### 5. Protocole

- Détection YOLOv8, OCR PaddleOCR local, post-traitement `XXX TUN XXXX`.
- Ground truth : nom de fichier `NNN_TUN_MMMM` ou `NNNTUNMMMM`.
