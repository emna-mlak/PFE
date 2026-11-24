# Terrain Dashboard (React Native)

Dashboard terrain dediee, separee de l'app mobile d'infraction.
Objectif: rester toujours visible, afficher des alertes critiques en moins d'1 seconde.

## Modules

- `src/services/realtimeClient.ts`: connexion WebSocket backend.
- `src/alert/alertEngine.ts`: cooldown anti-repetition + regles de declenchement.
- `src/alert/useAlertController.ts`: orchestration UI/audio/haptique.
- `src/components/CriticalAlertOverlay.tsx`: alerte CRITICAL plein écran (flash rouge + tap pour masquer).
- `src/screens/DashboardScreen.tsx`: ecran principal.

## Evenement attendu du backend

```json
{
  "vehicleStatus": "vignette_impayee",
  "secondaryText": "240 TUN 7473"
}
```

## Demarrage rapide

1. Cree un projet RN/Expo.
2. Copie ce dossier dans ton projet.
3. Monte `DashboardScreen` dans `App.tsx`.
4. Configure `wsUrl` (backend push).

## Notes terrain

- Activer mode kiosk sur tablette Android.
- Garder luminosite ecran elevee.
- Prevoir alimentation continue + auto-relaunch app.
