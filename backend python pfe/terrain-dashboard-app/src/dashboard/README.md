# Dashboard — Embedded Tactical Mission Terminal

Architecture LCD 7" (React Native / Expo).

```
dashboard/
├── layout/     MissionControlLayout, onglets, strip, status line
├── live/       Caméra, carte, AI strip, alertes compactes
├── events/     Historique, filtres, replay, impayés
├── patrol/     Session, stats texte, threat score
├── alerts/     CriticalAlertOverlay, WarningAlertBanner, useAlertController, alertEngine
├── shared/     styles, layout constants, modèles, santé système
└── _legacy/    Anciens panels (ne pas importer)
```

Données / parsing : `src/screens/dashboard/{types,selectors,parsers}.ts`
