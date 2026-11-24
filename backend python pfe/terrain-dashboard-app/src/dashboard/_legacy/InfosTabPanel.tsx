import React from "react";
import { ScrollView, View } from "react-native";

import type { PlateReading, RealtimeStatus, UnpaidEntry } from "../screens/dashboard/types";
import { UnpaidPriorityPanel } from "../screens/dashboard/components/UnpaidPriorityPanel";
import { AiSystemStatusPanel } from "./AiSystemStatusPanel";
import { MissionAlertStrip } from "./MissionAlertStrip";
import { ReplaySnapshotPanel } from "./ReplaySnapshotPanel";
import { useMissionControlStyles } from "./styles";

type Props = {
  status: RealtimeStatus;
  reconnectCount: number;
  unpaidOpenCount: number;
  activeUnpaid: UnpaidEntry | null;
  unpaidEntries: UnpaidEntry[];
  onToggleTreated: (plate: string) => void;
  pipelineReadings: PlateReading[];
  eventsPerSec: number;
  hasWsError: boolean;
  batteryPercent: number | null;
};

/** Onglet INFOS : résumé alertes + état AI + file impayés (sans sidebar). */
export function InfosTabPanel(props: Props) {
  const styles = useMissionControlStyles();

  return (
    <ScrollView style={styles.tabPageScroll} contentContainerStyle={styles.tabPageScrollContent}>
      <MissionAlertStrip unpaidOpenCount={props.unpaidOpenCount} activeUnpaid={props.activeUnpaid} />
      <ReplaySnapshotPanel readings={props.pipelineReadings} />
      <AiSystemStatusPanel
        wsStatus={props.status}
        eventsPerSec={props.eventsPerSec}
        reconnectCount={props.reconnectCount}
        hasWsError={props.hasWsError}
        readings={props.pipelineReadings}
        batteryPercent={props.batteryPercent}
      />
      <UnpaidPriorityPanel
        unpaidEntries={props.unpaidEntries}
        activeUnpaid={props.activeUnpaid}
        onToggleTreated={props.onToggleTreated}
      />
    </ScrollView>
  );
}
