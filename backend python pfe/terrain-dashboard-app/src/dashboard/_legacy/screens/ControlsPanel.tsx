import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useTheme } from "../../../theme/ThemeContext";
import { FILTERS, type SortMode, type StatusFilter } from "../types";
import { useDashboardStyles } from "../styles";

/* Zone recherche + filtres statut + boutons d’action sur la liste. */
type Props = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  sortMode: SortMode;
  onToggleSort: () => void;
  onClearScreen: () => void;
  onResetFilters: () => void;
};

export function ControlsPanel({
  searchTerm,
  onSearchTermChange,
  statusFilter,
  onStatusFilterChange,
  sortMode,
  onToggleSort,
  onClearScreen,
  onResetFilters,
}: Props) {
  const styles = useDashboardStyles();
  const { colors } = useTheme();

  return (
    <>
      {/* colors.placeholder : même gris / contraste en clair et en sombre */}
      <TextInput
        style={styles.searchInput}
        value={searchTerm}
        onChangeText={onSearchTermChange}
        placeholder="Rechercher une plaque..."
        placeholderTextColor={colors.placeholder}
        autoCapitalize="characters"
        /* Android : texte du champ aligné verticalement (comportement type “champ”, pas bouton). */
        textAlignVertical="center"
      />

      {/* Un chip par valeur de FILTERS (tous, impayé, OK…) */}
      <View style={styles.filtersRow}>
        {FILTERS.map((filter) => {
          const active = statusFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              onPress={() => onStatusFilterChange(filter.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Tri chronologique, vider la mémoire affichée, remettre filtres par défaut */}
      <View style={styles.actionsRow}>
        <Pressable style={styles.secondaryAction} onPress={onToggleSort}>
          <Text style={styles.secondaryActionText}>
            Tri: {sortMode === "recent" ? "Plus recents" : "Plus anciens"}
          </Text>
        </Pressable>
        <Pressable style={styles.secondaryAction} onPress={onClearScreen}>
          <Text style={styles.secondaryActionText}>Vider l'ecran</Text>
        </Pressable>
        <Pressable style={styles.secondaryAction} onPress={onResetFilters}>
          <Text style={styles.secondaryActionText}>Reset filtres</Text>
        </Pressable>
      </View>
    </>
  );
}
