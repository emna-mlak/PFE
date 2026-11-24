import React from "react";
import { View } from "react-native";

import type { PlateReading, SortMode, StatusFilter } from "../screens/dashboard/types";
import { CompactControlsBar } from "./CompactControlsBar";
import { MissionEventFeed } from "./MissionEventFeed";
import { useMissionControlStyles } from "./styles";

type Props = {
  readings: PlateReading[];
  shownCount: number;
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (v: StatusFilter) => void;
  sortMode: SortMode;
  onToggleSort: () => void;
  onClearScreen: () => void;
  onResetFilters: () => void;
};

/** Onglet FLUX : timeline pleine hauteur + filtres (lecture rapide terrain). */
export function FluxTabPanel(props: Props) {
  const styles = useMissionControlStyles();

  return (
    <View style={styles.tabPage}>
      <View style={styles.fluxFeedWrap}>
        <MissionEventFeed readings={props.readings} shownCount={props.shownCount} variant="flux" />
      </View>
      <CompactControlsBar
        searchTerm={props.searchTerm}
        onSearchTermChange={props.onSearchTermChange}
        statusFilter={props.statusFilter}
        onStatusFilterChange={props.onStatusFilterChange}
        sortMode={props.sortMode}
        onToggleSort={props.onToggleSort}
        onClearScreen={props.onClearScreen}
        onResetFilters={props.onResetFilters}
      />
    </View>
  );
}
