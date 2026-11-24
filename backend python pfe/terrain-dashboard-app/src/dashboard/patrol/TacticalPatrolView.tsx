import React from "react";
import { ScrollView, View } from "react-native";

import type { PlateReading } from "../../screens/dashboard/types";
import { PatrolSessionPanel } from "./PatrolSessionPanel";
import { TacticalMissionStats } from "./TacticalMissionStats";
import { ThreatScoreWidget } from "./ThreatScoreWidget";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  sessionStartedAtMs: number;
  detectionCount: number;
  activeAlerts: number;
  gpsStatus: string;
  pipelineReadings: PlateReading[];
};

/** PATROL : session + KPI + stats texte + threat score (ex-STATS fusionné). */
export function TacticalPatrolView({
  sessionStartedAtMs,
  detectionCount,
  activeAlerts,
  gpsStatus,
  pipelineReadings,
}: Props) {
  const styles = useMissionControlStyles();

  return (
    <ScrollView style={styles.tabPageScroll} contentContainerStyle={styles.tacticalPatrolScroll}>
      <PatrolSessionPanel
        sessionStartedAtMs={sessionStartedAtMs}
        detectionCount={detectionCount}
        activeAlerts={activeAlerts}
        gpsStatus={gpsStatus}
      />
      <TacticalMissionStats readings={pipelineReadings} />
      <View style={styles.tacticalPatrolThreat}>
        <ThreatScoreWidget readings={pipelineReadings} />
      </View>
    </ScrollView>
  );
}
