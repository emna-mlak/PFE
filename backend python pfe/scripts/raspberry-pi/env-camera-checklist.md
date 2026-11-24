# Caméra live — quel `.env` fait quoi ?

## Deux fichiers séparés

| Fichier | Machine | Désactive la caméra sur la Pi ? |
|---------|---------|--------------------------------|
| `terrain-dashboard-app/.env` | **Mac** | **Non** — affichage dashboard seulement |
| `~/backend-python-pfe/.env` | **Pi** | **Oui**, si `PI_CAMERA_MJPEG` absent ou `0` |

Modifier le `.env` du **Mac** (EXPO_PUBLIC_*) ne change **jamais** le driver caméra sur la Pi.

---

## Sur la Pi — la seule ligne critique

Dans `~/backend-python-pfe/.env` il faut :

```env
PI_CAMERA_MJPEG=1
```

Puis :

```bash
sudo systemctl restart terrain-backend-api
```

### Vérifier (sur la Pi)

```bash
grep PI_CAMERA ~/backend-python-pfe/.env
curl -sS http://127.0.0.1:8000/health
```

- `"camera_mjpeg_enabled": true` → caméra **activée** côté API
- `"camera_mjpeg_enabled": false` → ajouter/corriger `PI_CAMERA_MJPEG=1` et redémarrer

```bash
curl -sS -I --max-time 10 http://127.0.0.1:8000/camera/mjpeg
```

- `HTTP/1.1 200` → flux OK sur la Pi
- `503` + message « disabled » → `PI_CAMERA_MJPEG` pas à `1`

---

## Page blanche sur `http://127.0.0.1:8780/camera/mjpeg`

**Normal dans Chrome** si vous ouvrez l’URL MJPEG directement : le navigateur n’affiche pas bien le `multipart/x-mixed-replace`.

Test utile :

1. Fichier `terrain-dashboard-app/scripts/mjpeg-viewer.html` → ouvrir dans Chrome (double-clic), bouton **Charger**.
2. Ou sur la Pi / Mac :  
   `curl --max-time 30 http://10.42.0.1:8000/camera/mjpeg -o /tmp/t.bin && ls -l /tmp/t.bin`  
   Si la taille reste **0**, la **capture caméra échoue** (pas le `.env` Mac).

### Erreur `OpenCV camera read failed` + `/tmp/test.bin` = 0 octet

Picamera2 n’a pas démarré ; le repli OpenCV ne marche pas sur Pi 5 (Camera Module).

**Sur la Pi** (une commande) :

```bash
cd ~/backend-python-pfe
bash scripts/raspberry-pi/fix-pi-camera.sh
```

### `ModuleNotFoundError: No module named 'libcamera'`

Le venv **uv Python 3.12** n’a pas `libcamera` (fourni par **apt** pour le Python **système**).

### `paddlepaddle==2.6.2` introuvable (Python 3.13)

Sur Trixie, **Paddle 2.6 n’existe pas pour Python 3.13** (seulement 3.x). Ne pas fusionner OCR + caméra dans un seul venv 3.13.

| Composant | Python | Port |
|-----------|--------|------|
| OCR / API | `.venv` **3.12** (uv) + paddle 2.6 | **8000** |
| Caméra MJPEG | **python3** système + picamera2 apt | **8001** (sidecar) |

```bash
# Ne pas utiliser « pip » seul sur Trixie (PEP 668) — utiliser uv pip :
cd ~/backend-python-pfe
source ~/.local/bin/env
rm -rf .venv && uv venv --python 3.12 .venv
uv pip install --python .venv -r requirements.txt
uv pip install --python .venv 'paddleocr>=2.8.1,<3.0.0' 'paddlepaddle==2.6.2'

bash scripts/raspberry-pi/restore-pi-venv-paddle.sh
sudo cp scripts/raspberry-pi/terrain-camera-mjpeg.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now terrain-camera-mjpeg
```

Mac : `CAMERA_UPSTREAM=http://10.42.0.1:8001/camera/mjpeg npm run proxy:all`

### Erreur pip `rpi-libcamera` (libcamera v0.7.1 ≠ v0.5.0)

Sur **Trixie** : **ne pas** `pip install rpi-libcamera`. Utiliser le sidecar ou :

```bash
cd ~/backend-python-pfe
bash scripts/raspberry-pi/fix-pi-camera.sh
```

Manuel :

```bash
sudo apt install -y libcamera-apps python3-libcamera python3-picamera2
/usr/bin/python3 -c "from picamera2 import Picamera2; print('system OK')"

**Sidecar** : avec `(.venv)` activé, `python3` = venv → `No module named picamera2`. Utiliser :

```bash
deactivate
PI_CAMERA_MJPEG=1 /usr/bin/python3 scripts/raspberry-pi/mjpeg_sidecar.py --port 8001
```

cd ~/backend-python-pfe
deactivate 2>/dev/null || true
rm -rf .venv
python3 -m venv .venv --system-site-packages
source .venv/bin/activate
pip install -r requirements.txt
pip install 'paddleocr>=2.8.1,<3.0.0' 'paddlepaddle==2.6.2'
pip uninstall -y picamera2 2>/dev/null || true   # garder picamera2 d'apt
python -c "import libcamera; from picamera2 import Picamera2; print('venv OK')"
```

`.env` : `PI_CAMERA_MJPEG=1` et `PI_CAMERA_BACKEND=picamera2`, puis `sudo systemctl restart terrain-backend-api`.

```bash
journalctl -u terrain-backend-api -n 50 --no-pager | grep -iE 'MJPEG|Picamera|camera|OpenCV'
sudo fuser -v /dev/video* 2>/dev/null
libcamera-hello -t 2000   # après apt install libcamera-apps
```

---

## Sur le Mac — affichage dashboard

Le `.env` dans `terrain-dashboard-app/` doit contenir (déjà le cas chez toi) :

```env
EXPO_PUBLIC_CAMERA_PROXY_URL=http://127.0.0.1:8780/camera/mjpeg
```

Et **ne pas** avoir (décommenté) :

```env
EXPO_PUBLIC_CAMERA_USE_BACKEND_MJPEG=0
```

Processus Mac :

1. `npm run proxy:all`
2. `npx expo start --web --clear`
3. Chrome : `http://127.0.0.1:8780/camera/mjpeg` (test direct)

---

## Tu avais déjà la preuve que la Pi n’est pas « coupée »

Tu avais obtenu :

```json
"camera_mjpeg_enabled": true
```

et `HEAD /camera/mjpeg` → **200**.

Donc le souci n’est en général **pas** un `.env` Pi qui désactive la caméra, mais l’**affichage** (proxy 8780, cache Expo, mauvaise URL dans le navigateur).
