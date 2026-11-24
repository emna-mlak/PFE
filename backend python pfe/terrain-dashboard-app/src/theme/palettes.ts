/**
 * Fichier central des couleurs du dashboard.
 *
 * - darkPalette : **Embedded Tactical Dark** — supervision edge / mission control
 *   (gris bleuté profond, pas de noir #000 en chrome UI, accents bleu IA, sévérités lisibles LCD).
 * - lightPalette : thème clair "terrain" — contraste fort pour soleil dans l’habitacle.
 */

export type ThemeMode = "light" | "dark";

/**
 * Une "palette" = toutes les couleurs dont les styles du dashboard ont besoin.
 * Les noms suivent l’usage dans les composants (root, healthPanel, feed, unpaid, etc.).
 */
export type DashboardPalette = {
  rootBg: string;
  /** Bandeau supérieur / chrome tactique (légèrement relevé du canvas). */
  stripBg: string;
  /** Zones enfoncées : puits, anneaux intérieurs, fonds secondaires. */
  wellBg: string;
  header: string;
  sub: string;
  status: string;
  healthPanelBg: string;
  healthPanelBorder: string;
  healthText: string;
  healthError: string;
  counterBadgeBg: string;
  counterBadgeBorder: string;
  counterBadgeText: string;
  searchInputBg: string;
  searchInputBorder: string;
  searchInputText: string;
  placeholder: string;
  filterChipBg: string;
  filterChipBorder: string;
  filterChipActiveBg: string;
  filterChipActiveBorder: string;
  filterText: string;
  filterTextActive: string;
  secondaryActionBg: string;
  secondaryActionBorder: string;
  secondaryActionText: string;
  feedBg: string;
  feedBorder: string;
  feedTitle: string;
  feedTitleBorder: string;
  emptyText: string;
  rowBorder: string;
  rowPlate: string;
  rowTime: string;
  statusUnpaid: string;
  statusWanted: string;
  statusPaid: string;
  statusUnknown: string;
  unpaidContainerBg: string;
  unpaidContainerBorder: string;
  unpaidTitle: string;
  unpaidActive: string;
  unpaidNone: string;
  unpaidRowBg: string;
  unpaidRowBorder: string;
  unpaidPlate: string;
  unpaidMeta: string;
  unpaidActionBg: string;
  unpaidActionBorder: string;
  unpaidActionText: string;
  vignetteOverlayDangerBg: string;
  vignetteOverlayCriticalBg: string;
  vignetteOverlayTitle: string;
  vignetteOverlayPlate: string;
};

/**
 * Dark **Embedded Tactical** — hiérarchie Z0–Z3, contraste LCD, accents bleu IA.
 *
 * Z0 `#080A10` canvas · Z1 `#0E131D` strip · Z2 `#121B27` panels · Z3 `#0A0E16` wells
 * Bordures `#243246` (structure sans grillage agressif)
 * Critique `#E11D48` / warning `#FB923C` / OK `#34D399` / IA `#3B82F6`–`#93C5FD`
 */
export const darkPalette: DashboardPalette = {
  rootBg: "#080A10",
  stripBg: "#0E131D",
  wellBg: "#0A0E16",
  header: "#F1F5F9",
  sub: "#8B9AAF",
  status: "#D8DEE9",
  healthPanelBg: "#121B27",
  healthPanelBorder: "#243246",
  healthText: "#B4C0D4",
  healthError: "#FB7185",
  counterBadgeBg: "#151E2C",
  counterBadgeBorder: "#2A3A52",
  counterBadgeText: "#E8EDF4",
  searchInputBg: "#0A0E16",
  searchInputBorder: "#2A3A52",
  searchInputText: "#E8EDF4",
  placeholder: "#6B7C94",
  filterChipBg: "#0F1620",
  filterChipBorder: "#2A3548",
  filterChipActiveBg: "#152A45",
  filterChipActiveBorder: "#3B82F6",
  filterText: "#B8C4D4",
  filterTextActive: "#E0F0FF",
  secondaryActionBg: "#151E2C",
  secondaryActionBorder: "#2F4158",
  secondaryActionText: "#E8EDF4",
  feedBg: "#101820",
  feedBorder: "#1F2D40",
  feedTitle: "#F1F5F9",
  feedTitleBorder: "#243246",
  emptyText: "#7C8CA3",
  rowBorder: "#1C2838",
  rowPlate: "#F1F5F9",
  rowTime: "#8B9AAF",
  statusUnpaid: "#E11D48",
  statusWanted: "#FB923C",
  statusPaid: "#34D399",
  statusUnknown: "#FBBF24",
  unpaidContainerBg: "#3A0F14",
  unpaidContainerBorder: "#9F1239",
  unpaidTitle: "#FFE4E6",
  unpaidActive: "#FDA4AF",
  unpaidNone: "#FECDD3",
  unpaidRowBg: "#5C1620",
  unpaidRowBorder: "#BE123C",
  unpaidPlate: "#FFFFFF",
  unpaidMeta: "#FECDD3",
  unpaidActionBg: "#9F1239",
  unpaidActionBorder: "#FDA4AF",
  unpaidActionText: "#FFFFFF",
  vignetteOverlayDangerBg: "#BE123C",
  vignetteOverlayCriticalBg: "#7C2D12",
  vignetteOverlayTitle: "#FFFFFF",
  vignetteOverlayPlate: "#FFFFFF",
};

/**
 * Thème clair "plein soleil" :
 * - fond blanc, texte noir, bordures noires pour le contraste.
 * - statuts et accents très saturés pour rester distincts malgré les reflets.
 * - overlay alerte : rouge vif + texte blanc (lisible sur fond d’alerte).
 */
export const lightPalette: DashboardPalette = {
  rootBg: "#FFFFFF",
  stripBg: "#EEF2F7",
  wellBg: "#F8FAFC",
  header: "#000000",
  sub: "#000000",
  status: "#000000",
  healthPanelBg: "#FFFFFF",
  healthPanelBorder: "#000000",
  healthText: "#000000",
  healthError: "#C40000",
  counterBadgeBg: "#FFFFFF",
  counterBadgeBorder: "#000000",
  counterBadgeText: "#000000",
  searchInputBg: "#FFFFFF",
  searchInputBorder: "#000000",
  searchInputText: "#000000",
  placeholder: "#555555",
  filterChipBg: "#FFFFFF",
  filterChipBorder: "#000000",
  filterChipActiveBg: "#0050FF",
  filterChipActiveBorder: "#000080",
  filterText: "#000000",
  filterTextActive: "#FFFFFF",
  secondaryActionBg: "#FFFFFF",
  secondaryActionBorder: "#000000",
  secondaryActionText: "#000000",
  feedBg: "#FFFFFF",
  feedBorder: "#000000",
  feedTitle: "#000000",
  feedTitleBorder: "#000000",
  emptyText: "#000000",
  rowBorder: "#000000",
  rowPlate: "#000000",
  rowTime: "#000000",
  statusUnpaid: "#C40000",
  statusWanted: "#E65100",
  statusPaid: "#008A2E",
  statusUnknown: "#C17800",
  unpaidContainerBg: "#FFEBEE",
  unpaidContainerBorder: "#C40000",
  unpaidTitle: "#000000",
  unpaidActive: "#000000",
  unpaidNone: "#000000",
  unpaidRowBg: "#FFCDD2",
  unpaidRowBorder: "#C40000",
  unpaidPlate: "#000000",
  unpaidMeta: "#000000",
  unpaidActionBg: "#C40000",
  unpaidActionBorder: "#000000",
  unpaidActionText: "#FFFFFF",
  vignetteOverlayDangerBg: "#D50000",
  vignetteOverlayCriticalBg: "#BF360C",
  vignetteOverlayTitle: "#FFFFFF",
  vignetteOverlayPlate: "#FFFFFF",
};
