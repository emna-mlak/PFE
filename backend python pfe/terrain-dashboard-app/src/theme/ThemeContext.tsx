import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { darkPalette, lightPalette, type DashboardPalette, type ThemeMode } from "./palettes";

/** Clé AsyncStorage : une seule valeur "light" ou "dark" est stockée. */
const STORAGE_KEY = "terrain_dashboard_theme_mode";

/** Ce que reçoit tout composant qui appelle useTheme(). */
type ThemeContextValue = {
  mode: ThemeMode;
  colors: DashboardPalette;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Enveloppe l’app : garde le thème en mémoire, le recharge au démarrage,
 * et le sauvegarde à chaque changement.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  /* Valeur par défaut avant lecture du stockage (évite un flash si tu préfères sombre). */
  const [mode, setModeState] = useState<ThemeMode>("dark");

  /* Au montage : relire le dernier choix utilisateur sur le téléphone / tablette. */
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      if (stored === "light" || stored === "dark") {
        setModeState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Bascule explicite (ex. bouton "Clair") : met à jour l’UI + disque. */
  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  /* Bascule inverse : pratique pour un seul bouton "jour / nuit". */
  const toggleTheme = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      void AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  /* Objet couleurs figé (light ou dark) : les écrans ne font que lire `colors`. */
  const colors = mode === "light" ? lightPalette : darkPalette;

  const value = useMemo(
    () => ({
      mode,
      colors,
      setMode,
      toggleTheme,
    }),
    [colors, mode, setMode, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * À utiliser dans n’importe quel composant enfant de ThemeProvider.
 * Donne accès au mode, aux couleurs, et aux fonctions de changement.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme doit etre utilise dans un ThemeProvider");
  }
  return ctx;
}
