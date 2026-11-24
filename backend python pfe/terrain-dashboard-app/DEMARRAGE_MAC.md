# Démarrage dashboard + flux caméra (Mac + Raspberry Pi)

> **Patrouille sans Mac :** voir [DEMARRAGE_TABLETTE.md](./DEMARRAGE_TABLETTE.md) (APK Android → Pi `10.42.0.1`, pas de proxy ni `expo start`).

Ce fichier `.env` est **déjà au bon endroit** :  
`terrain-dashboard-app/.env` (à côté de `package.json`).  
Ce n’est **pas** le `.env` de la Pi (`~/backend-python-pfe/.env`).

## Sur le Mac — 2 terminaux + Chrome

### Terminal 1 — proxy (laisser ouvert)

```bash
cd "/Users/mac/Desktop/backend python pfe/terrain-dashboard-app"
npm run proxy:all
```

Attendu : `alertes ws://127.0.0.1:8765` et `caméra http://127.0.0.1:8780/camera/mjpeg`.

Le proxy cible par défaut **`http://10.42.0.1:8000/camera/mjpeg`** (FastAPI + `PI_CAMERA_MJPEG=1` sur la Pi).

Diagnostic rapide :

```bash
npm run check:camera
```

### Terminal 2 — dashboard Expo

```bash
cd "/Users/mac/Desktop/backend python pfe/terrain-dashboard-app"
npx expo start --web --clear
```

Après modification du `.env`, toujours relancer avec `--clear`.

### Chrome — barre d’adresse (pas le terminal)

- Dashboard : `http://localhost:8081/?backend=10.42.0.1`
- Test caméra : ouvrir `scripts/mjpeg-viewer.html` dans Chrome (pas l’URL MJPEG seule — page blanche normale)
- Ou : `open scripts/mjpeg-viewer.html` depuis `terrain-dashboard-app`

## Sur la Raspberry Pi (SSH, optionnel)

```bash
curl -sS http://127.0.0.1:8000/health
# "camera_mjpeg_enabled": true
sudo systemctl restart terrain-backend-api
```

## Vérifications rapides (Mac)

```bash
curl -sS http://127.0.0.1:8780/health
curl -sS -I --max-time 15 http://127.0.0.1:8780/camera/mjpeg
```

## Variables déjà dans `.env`

| Variable | Rôle |
|----------|------|
| `EXPO_PUBLIC_BACKEND_HOST=10.42.0.1` | IP de la Pi sur le hotspot |
| `EXPO_PUBLIC_WS_URL=ws://127.0.0.1:8765` | Alertes via proxy local |
| `EXPO_PUBLIC_CAMERA_PROXY_URL=http://127.0.0.1:8780/camera/mjpeg` | Flux live dans le dashboard |
