# Corpus de test — plaques tunisiennes

Placez ici vos images de test (ex. **100** fichiers).

## Vérité terrain (ground truth)

### Option A — captures d’écran (`Screenshot …png`) **recommandé**

1. Inférence (déjà fait si vous avez `logs/test_results.json`) :
   ```bash
   python3 scripts/infer_test.py
   ```
2. Générer le fichier d’étiquettes :
   ```bash
   python3 scripts/make_labels_template.py
   ```
3. Ouvrir **`labels.csv`** dans ce dossier : remplir **`ground_truth`** pour chaque ligne  
   (ex. `172 TUN 9630`). La colonne `predicted_hint` est une aide OCR — à vérifier sur l’image.
4. Rapport PFE :
   ```bash
   python3 scripts/analyze_test_results.py
   ```

### Option B — plaque dans le nom de fichier

| Exemple | Plaque attendue |
|---------|-----------------|
| `217_TUN_4080.jpg` | `217 TUN 4080` |
| `217TUN4080.png` | `217 TUN 4080` |

Série : **030** à **270**.

## Commandes

```bash
cd "/Users/mac/Desktop/mon pfe/backend python pfe"
source .venv/bin/activate

# Utilisez python3 (pas python) ; pip via python3 -m pip
python3 scripts/infer_test.py
python3 scripts/analyze_test_results.py
```

**Si `externally-managed-environment` avec Homebrew** : le venv n’est pas actif.
Vérifiez : `which python3` doit afficher `.../mon pfe/backend python pfe/.venv/bin/python3`.
Sinon, sans `activate` :

```bash
.venv/bin/python3 -m pip install -r requirements.txt
.venv/bin/python3 scripts/infer_test.py
```

Sorties :

- `logs/test_results.json` — résultats bruts par image
- `logs/rapport_metriques.md` — section à copier dans le rapport
