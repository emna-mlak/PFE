import { useMemo } from "react";
import { StyleSheet } from "react-native";

import { useTheme } from "../../theme/ThemeContext";

/**
 * Hook qui renvoie tous les styles du dashboard pour le thème actuel.
 * On mémorise le StyleSheet : il est recalculé si la palette ou le mode (clair / sombre) change.
 */
export function useDashboardStyles() {
  const { colors: c, mode } = useTheme();

  return useMemo(
    () =>
      StyleSheet.create({
        /* --- Écran racine & titres --- */
        root: { flex: 1, backgroundColor: c.rootBg },
        content: { flex: 1, padding: 24, paddingTop: 32 },
        header: { color: c.header, fontSize: 30, fontWeight: "800" },
        sub: { color: c.sub, fontSize: 16, marginTop: 8 },
        status: { color: c.status, fontSize: 16, marginTop: 20 },

        /* --- Panneau santé WebSocket (URL, reconnexions, erreurs) --- */
        healthPanel: {
          marginTop: 8,
          padding: 12,
          borderWidth: 1,
          borderColor: c.healthPanelBorder,
          borderRadius: 10,
          backgroundColor: c.healthPanelBg,
        },
        healthText: {
          color: c.healthText,
          marginTop: 6,
          fontSize: 13,
        },
        healthError: {
          color: c.healthError,
          marginTop: 6,
          fontSize: 12,
        },

        /* --- Badges de compteurs (total, impayés, OK…) --- */
        countersRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 10,
        },
        counterBadge: {
          color: c.counterBadgeText,
          fontSize: 12,
          borderWidth: 1,
          borderColor: c.counterBadgeBorder,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: c.counterBadgeBg,
        },

        /* --- Recherche & filtres par statut --- */
        searchInput: {
          marginTop: 12,
          borderWidth: 1,
          borderColor: c.searchInputBorder,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: c.searchInputText,
          /* En clair : fond grisé pour ne pas confondre avec les boutons (fond theme plein). */
          backgroundColor: mode === "light" ? "#ECECEC" : c.searchInputBg,
        },
        filtersRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 10,
        },
        filterChip: {
          borderWidth: 1,
          borderColor: c.filterChipBorder,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 7,
          backgroundColor: c.filterChipBg,
        },
        filterChipActive: {
          borderColor: c.filterChipActiveBorder,
          backgroundColor: c.filterChipActiveBg,
        },
        filterText: {
          color: c.filterText,
          fontSize: 12,
          fontWeight: "700",
        },
        filterTextActive: {
          color: c.filterTextActive,
        },

        /* --- Boutons secondaires (tri, vider, reset filtres) : fond theme + texte centré --- */
        actionsRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
          marginTop: 10,
        },
        secondaryAction: {
          flexGrow: 1,
          minWidth: 130,
          minHeight: 48,
          borderWidth: 1,
          borderColor: c.secondaryActionBorder,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: c.secondaryActionBg,
          alignItems: "center",
          justifyContent: "center",
        },
        secondaryActionText: {
          color: c.secondaryActionText,
          fontSize: 12,
          fontWeight: "700",
          textAlign: "center",
          width: "100%",
        },

        /* --- Liste du flux (carte + lignes) --- */
        feedContainer: {
          marginTop: 24,
          flex: 1,
          borderWidth: 1,
          borderColor: c.feedBorder,
          borderRadius: 14,
          backgroundColor: c.feedBg,
          overflow: "hidden",
        },
        feedTitle: {
          color: c.feedTitle,
          fontSize: 17,
          fontWeight: "700",
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: c.feedTitleBorder,
        },
        feedList: {
          paddingBottom: 8,
        },
        emptyText: {
          color: c.emptyText,
          fontSize: 14,
          textAlign: "center",
          paddingVertical: 18,
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: c.rowBorder,
          gap: 8,
        },
        rowPlate: {
          color: c.rowPlate,
          fontSize: 16,
          fontWeight: "700",
          flex: 1.1,
        },
        rowStatus: {
          fontSize: 13,
          fontWeight: "700",
          textTransform: "uppercase",
          flex: 1,
        },
        rowTime: {
          color: c.rowTime,
          fontSize: 12,
          fontVariant: ["tabular-nums"],
          minWidth: 70,
          textAlign: "right",
        },

        /* Couleurs du texte de statut sur une ligne (impayé, recherché, payé, inconnu) */
        statusUnpaid: { color: c.statusUnpaid },
        statusWanted: { color: c.statusWanted },
        statusPaid: { color: c.statusPaid },
        statusUnknown: { color: c.statusUnknown },

        /* --- Bloc "impayés prioritaires" (liste courte + actions) --- */
        unpaidContainer: {
          marginTop: 12,
          borderWidth: 1,
          borderColor: c.unpaidContainerBorder,
          borderRadius: 12,
          backgroundColor: c.unpaidContainerBg,
          padding: 12,
          gap: 8,
        },
        unpaidTitle: {
          color: c.unpaidTitle,
          fontWeight: "800",
          fontSize: 15,
        },
        unpaidActive: {
          color: c.unpaidActive,
          fontSize: 13,
          fontWeight: "700",
        },
        unpaidNone: {
          color: c.unpaidNone,
          fontSize: 13,
        },
        unpaidRow: {
          borderWidth: 1,
          borderColor: c.unpaidRowBorder,
          borderRadius: 10,
          backgroundColor: c.unpaidRowBg,
          padding: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        },
        unpaidRowMain: {
          flex: 1,
        },
        unpaidPlate: {
          color: c.unpaidPlate,
          fontSize: 15,
          fontWeight: "800",
        },
        unpaidMeta: {
          color: c.unpaidMeta,
          fontSize: 12,
          marginTop: 2,
        },
        unpaidAction: {
          borderWidth: 1,
          borderColor: c.unpaidActionBorder,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 7,
          backgroundColor: c.unpaidActionBg,
        },
        unpaidActionText: {
          color: c.unpaidActionText,
          fontSize: 12,
          fontWeight: "700",
        },

        /* --- Choix thème Clair / Sombre (barre sous le sous-titre) --- */
        themeBar: {
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginTop: 14,
        },
        themeLabel: {
          color: c.header,
          fontSize: 14,
          fontWeight: "700",
        },
        themeButton: {
          borderWidth: 1,
          borderColor: c.secondaryActionBorder,
          borderRadius: 8,
          paddingHorizontal: 14,
          paddingVertical: 8,
          backgroundColor: c.secondaryActionBg,
        },
        themeButtonActive: {
          borderColor: c.filterChipActiveBorder,
          backgroundColor: c.filterChipActiveBg,
        },
        themeButtonText: {
          color: c.secondaryActionText,
          fontSize: 13,
          fontWeight: "700",
        },
        themeButtonTextActive: {
          color: c.filterTextActive,
        },
      }),
    [c, mode]
  );
}
