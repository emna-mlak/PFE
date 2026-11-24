import React from "react";
import { ScrollView, View } from "react-native";

import type { PlateReading, SortMode, StatusFilter, UnpaidEntry } from "../../screens/dashboard/types";
import { UnpaidPriorityPanel } from "./UnpaidPriorityPanel";
import { CompactControlsBar } from "./CompactControlsBar";
import { MissionEventFeed } from "./MissionEventFeed";
import { ReplaySnapshotPanel } from "./ReplaySnapshotPanel";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  readings: PlateReading[];
  pipelineReadings: PlateReading[];
  shownCount: number;
  unpaidEntries: UnpaidEntry[];
  activeUnpaid: UnpaidEntry | null;
  onToggleTreated: (plate: string) => void;
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (v: StatusFilter) => void;
  sortMode: SortMode;
  onToggleSort: () => void;
  onClearScreen: () => void;
  onResetFilters: () => void;
};

/** EVENTS : historique + filtres + replay léger + impayés (ex-FLUX + ex-INFOS). */
export function TacticalEventsView(props: Props) {
  const styles = useMissionControlStyles();

  return (
    <View style={styles.tabPage}>
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
      <View style={styles.fluxFeedWrap}>
        <MissionEventFeed readings={props.readings} shownCount={props.shownCount} variant="flux" />
      </View>
      <ScrollView
        style={styles.tacticalEventsAuxScroll}
        contentContainerStyle={styles.tacticalEventsAuxContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <ReplaySnapshotPanel readings={props.pipelineReadings} />
        <UnpaidPriorityPanel
          unpaidEntries={props.unpaidEntries}
          activeUnpaid={props.activeUnpaid}
          onToggleTreated={props.onToggleTreated}
        />
      </ScrollView>
    </View>
  );
}
