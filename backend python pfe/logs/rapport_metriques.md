## Évaluation quantitative — reconnaissance de plaques tunisiennes

*Corpus : `/Users/mac/Desktop/mon pfe/backend python pfe/tests/dataset` — 11 images avec vérité terrain.*
*Source : `/Users/mac/Desktop/mon pfe/backend python pfe/logs/test_results.json`.*

### 1. Taux de réussite global

| Indicateur | Valeur |
|------------|--------|
| Images évaluées | 11 |
| Lectures correctes (`XXX TUN XXXX`) | **7** |
| Lectures échouées | 4 |
| **Taux de réussite** | **63.64%** |
| Taux d'échec | 36.36% |

Lecture **réussie** : statut `success`, format `XXX TUN XXXX` (série 030–270), texte identique au ground truth (nom de fichier).

### 2. Confiance PaddleOCR (succès uniquement)

| Statistique | Valeur |
|-------------|--------|
| Moyenne `ocr_confidence` | **94.70%** (0.947) |
| Médiane | 0.96 |
| Écart-type | 0.0507 |

### 3. Répartition des causes d'échec

*Base : 4 échecs (% calculés sur les échecs).*

| Cause | Occurrences | % des échecs |
|-------|-------------|--------------|
| Image floue (netteté Laplacienne faible) | 3 | 75.0% |
| Erreur sur le numéro de série | 1 | 25.0% |

### 4. Statuts pipeline

| Statut | Occurrences |
|--------|-------------|
| `success` | 8 |
| `low_confidence` | 3 |

### 5. Protocole

- Détection YOLOv8, OCR PaddleOCR local, post-traitement `XXX TUN XXXX`.
- Ground truth : nom de fichier `NNN_TUN_MMMM` ou `NNNTUNMMMM`.
