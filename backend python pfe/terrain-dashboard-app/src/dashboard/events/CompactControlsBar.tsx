import React from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useTheme } from "../../theme/ThemeContext";
import { FILTERS, type SortMode, type StatusFilter } from "../../screens/dashboard/types";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (v: StatusFilter) => void;
  sortMode: SortMode;
  onToggleSort: () => void;
  onClearScreen: () => void;
  onResetFilters: () => void;
};

export function CompactControlsBar({
  searchTerm,
  onSearchTermChange,
  statusFilter,
  onStatusFilterChange,
  sortMode,
  onToggleSort,
  onClearScreen,
  onResetFilters,
}: Props) {
  const styles = useMissionControlStyles();
  const { colors } = useTheme();

  return (
    <View style={styles.controlsBar}>
      <TextInput
        style={styles.searchMini}
        value={searchTerm}
        onChangeText={onSearchTermChange}
        placeholder="Plaque…"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="characters"
        textAlignVertical="center"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
        <View style={styles.chipsRow}>
          {FILTERS.map((f) => {
            const on = statusFilter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => onStatusFilterChange(f.key)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.actionsMiniRow}>
        <Pressable style={styles.btnMini} onPress={onToggleSort}>
          <Text style={styles.btnMiniText}>{sortMode === "recent" ? "Récent" : "Ancien"}</Text>
        </Pressable>
        <Pressable style={styles.btnMini} onPress={onClearScreen}>
          <Text style={styles.btnMiniText}>Vider</Text>
        </Pressable>
        <Pressable style={styles.btnMini} onPress={onResetFilters}>
          <Text style={styles.btnMiniText}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}
