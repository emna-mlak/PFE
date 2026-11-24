# Convex Backend - PFE MVP

This repository contains the Convex backend for the mobile app flow:
- agent login profile fetch,
- vehicule/vignette lookup,
- infraction creation and updates,
- audit logs.

## Convex endpoints

- Cloud URL: `https://careful-elephant-671.convex.cloud`
- HTTP Actions URL: `https://careful-elephant-671.convex.site`

## Setup

1. Install dependencies:
   - `npm install`
2. Start Convex dev:
   - `npm run dev`

## Main functions

- `agents.upsertAgent`
- `agents.getCurrentAgent`
- `vehicules.upsertVehicule`
- `vehicules.getByMatricule`
- `vignettes.upsertVignette`
- `vignettes.getByMatricule`
- `vignettes.getActiveByMatricule`
- `infractions.create`
- `infractions.updateStatut`
- `infractions.listByMatricule`
- `audit.logAction`
- `audit.listByEntity`
- `seed.seedDemoData`

## Self-hosted Pi + mobile login

- Self-hosted: `npm run convex:docker:up`, dashboard `:6791`, API `:3210`, HTTP `:3211`
- Sync agents from cloud so Expo login works offline on hotspot: see `scripts/sync-agents-cloud-to-pi.sh` and `self-hosted/docker/systemd/INSTALL.txt` §3b

```bash
npm run agents:export-cloud   # Mac + Internet
npm run agents:import-pi      # Pi (after scp agents-cloud.jsonl)
```

## Notes

- Python/OCR/smart detection are intentionally out of this repo scope for now.
- This repo is focused on Convex app logic and data sync for Expo.
