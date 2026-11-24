# License Plate OCR API

YOLO detects and crops the plate, local Tesseract OCR reads the number.

## Setup

```bash
python3.11 -m venv .venv311
source .venv311/bin/activate
pip install -r requirements.txt
```

Install local OCR dependencies:
```bash
pip install -r requirements.txt
```

Create `.env` (no cloud key required for plate OCR):
```
PADDLE_OCR_LANG=eng
```

### Optional: saisie mains-libres (STT local par defaut)

Voice STT provider is selectable via `VOICE_STT_PROVIDER`.

**Local Whisper (default, privacy-friendly):**

```bash
pip install -r requirements-voice.txt
export VOICE_STT_PROVIDER=local
export VOICE_STRICT_OFFLINE=true
export VOICE_LOCAL_MODEL=small
export VOICE_LOCAL_DEVICE=cpu
python scripts/run_voice_cloud_demo.py
```

The demo defaults to **`--mode fixed`** (~8 s) for reliable capture. Optional **`--mode vad`** stops after end-of-phrase silence, with safeguards (sustained voice before start, minimum speech length before silence can end recording). If VAD misbehaves on your mic, use fixed mode or tune `--vad-voice-blocks` / `--vad-min-speech-blocks`.

Cloud alternatives remain available (only if you explicitly disable strict offline mode):
- `VOICE_STT_PROVIDER=openai` + `OPENAI_API_KEY`
- `VOICE_STT_PROVIDER=gemini` + `VOICE_GEMINI_API_KEY` (or `GEMINI_API_KEY`)

Optional: `VOICE_OPENAI_MODEL`, `VOICE_GEMINI_MODEL` (default `gemini-2.5-flash`), `VOICE_GEMINI_LANGUAGE`, `VOICE_LOCAL_COMPUTE_TYPE`, `VOICE_LOCAL_LANGUAGE`. Command phrases: `voice_cloud/commands.py`; app wiring: `dispatch_command()`. Dataset notes: `voice_training/README.md`.

## Run the server

```bash
source .venv311/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8000
```

Server starts at `http://localhost:8000`

## Raspberry Pi local mode (camera + backend on each device)

This mode runs everything on each Raspberry Pi: camera capture + local plate detection flow.

1) On each Raspberry Pi, prepare system dependencies:

```bash
sudo apt update
sudo apt install -y python3-venv ffmpeg python3-picamera2 tesseract-ocr tesseract-ocr-eng
```

2) In project folder on the Pi:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip setuptools wheel
pip install -r requirements.txt
```

3) Configure `.env` (example):

```env
YOLO_WEIGHTS=models/best.pt
OUTPUTS_DIR=outputs
PADDLE_OCR_LANG=eng

# Optional tuning for Raspberry
YOLO_CONF_THRESHOLD=0.25
YOLO_INFER_IMGSZ=640
YOLO_AUGMENT=false
PI_CAMERA_BACKEND=auto
```

4) Start backend API locally on the Pi (optional, for remote calls):

```bash
source .venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8000
```

5) Run local camera processing loop (direct pipeline, no HTTP required):

```bash
source .venv/bin/activate
python scripts/run_pi_camera_loop.py --interval-sec 1 --camera-width 1280 --camera-height 720
```

It prints one JSON result per capture and writes cropped plates into `OUTPUTS_DIR`.

Useful options:

```bash
# process only 10 frames then stop
python scripts/run_pi_camera_loop.py --interval-sec 1 --max-frames 10

# force OpenCV camera backend
python scripts/run_pi_camera_loop.py --camera-backend opencv --camera-index 0

# faster inference on Raspberry
python scripts/run_pi_camera_loop.py --yolo-imgsz 640 --yolo-conf 0.30
```

---

## API Documentation

### `POST /api/plate-ocr`

Detect and read a license plate from an uploaded image.

**Content-Type:** `multipart/form-data`

**Request:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | yes | Image file (JPEG, PNG, or WebP) |
| `latitude` | float | no | GPS (degrés décimaux), avec `longitude` pour EXIF GPS |
| `longitude` | float | no | GPS (degrés décimaux) |
| `captured_at` | string | no | Date/heure ISO-8601 (appareil) ; sinon heure serveur (UTC) |
| `infraction_number` | string | no | N° d’infraction ; sinon généré (`INF-` + id) |

Si au moins un de ces champs optionnels est envoyé, la capture est **contextualisée** : métadonnées dans la réponse JSON, et dans le JPEG recadré (EXIF : date, description = n° d’infraction, GPS si lat+lon).

**cURL example:**

```bash
curl -X POST http://localhost:8000/api/plate-ocr \
  -F "file=@/path/to/car_photo.jpg"
```

**Avec GPS et infraction :**

```bash
curl -X POST http://localhost:8000/api/plate-ocr \
  -F "file=@/path/to/car_photo.jpg" \
  -F "latitude=36.8065" \
  -F "longitude=10.1815" \
  -F "infraction_number=INF-2025-042"
```

**Success response (200):**

```json
{
  "status": "success",
  "plate_text": "123 TUN 4567",
  "confidence": 0.9077,
  "yolo_confidence": 0.9077,
  "ocr_confidence": 1.0,
  "cropped_plate_image_path": "outputs/abc123_plate.jpg",
  "cropped_plate_image_base64": "/9j/4AAQ...",
  "raw_ocr_text": "1234567",
  "latitude": 36.8065,
  "longitude": 10.1815,
  "captured_at_iso": "2025-04-03T10:15:00+00:00",
  "infraction_number": "INF-2025-042"
}
```

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `success`, `low_confidence`, or `not_detected` |
| `plate_text` | string | Formatted plate number: `XXX TUN XXXX` |
| `confidence` | float | YOLO detection confidence (0-1) |
| `yolo_confidence` | float | YOLO detection confidence (0-1) |
| `ocr_confidence` | float | OCR confidence from local Tesseract (0-1) |
| `cropped_plate_image_path` | string | Path to saved cropped plate image |
| `cropped_plate_image_base64` | string | Base64-encoded JPEG of cropped plate |
| `raw_ocr_text` | string | Raw text returned by local OCR before formatting |
| `latitude` | float \| null | GPS si fourni |
| `longitude` | float \| null | GPS si fourni |
| `captured_at_iso` | string \| null | Horodatage de capture (contextualisée) |
| `infraction_number` | string \| null | N° d’infraction (contextualisée) |

**Error responses:**

| Status | Body | When |
|--------|------|------|
| 400 | `{"detail": "Only JPEG, PNG, or WebP images are accepted."}` | Wrong file type |
| 400 | `{"detail": "Empty file."}` | Empty upload |
| 400 | `{"detail": "Could not decode image."}` | Corrupted image |

---

### `GET /health`

Health check.

**Response:**

```json
{"status": "ok"}
```

---

### Integration examples

**Python (requests):**

```python
import requests

with open("car_photo.jpg", "rb") as f:
    resp = requests.post("http://localhost:8000/api/plate-ocr", files={"file": f})

data = resp.json()
print(data["plate_text"])  # "123 TUN 4567"
```

**JavaScript (fetch):**

```javascript
const formData = new FormData();
formData.append("file", imageFile);

const resp = await fetch("http://localhost:8000/api/plate-ocr", {
  method: "POST",
  body: formData,
});

const data = await resp.json();
console.log(data.plate_text); // "123 TUN 4567"
```

**Dart / Flutter:**

```dart
var request = http.MultipartRequest('POST', Uri.parse('http://localhost:8000/api/plate-ocr'));
request.files.add(await http.MultipartFile.fromPath('file', imagePath));
var response = await request.send();
var body = jsonDecode(await response.stream.bytesToString());
print(body['plate_text']); // "123 TUN 4567"
```

---

## Interactive docs

Once the server is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
