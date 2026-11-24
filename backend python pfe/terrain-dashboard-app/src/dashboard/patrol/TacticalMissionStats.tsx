import React, { useMemo } from "react";
import { Text, View } from "react-native";

import type { PlateReading } from "../../screens/dashboard/types";
import { buildAnalyticsSnapshot } from "./terrainAnalyticsModel";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  readings: PlateReading[];
};

/** Stats session textuelles : DET · ALT · TOP (sans graphiques). */
export function TacticalMissionStats({ readings }: Props) {
  const styles = useMissionControlStyles();
  const snap = useMemo(() => buildAnalyticsSnapshot(readings, Date.now(), 0), [readings]);

  const det = readings.length;
  const alt = snap.alertsPerDayWindow;
  const top = snap.topPlates[0]?.plate ?? "—";

  return (
    <View style={styles.tacticalMissionStats}>
      <Text style={styles.tacticalMissionStatsText} numberOfLines={1}>
        <Text style={styles.tacticalMissionLbl}>DET </Text>
        <Text style={styles.tacticalMissionVal}>{det}</Text>
        <Text style={styles.tacticalMissionSep}> · </Text>
        <Text style={styles.tacticalMissionLbl}>ALT </Text>
        <Text style={[styles.tacticalMissionVal, alt > 0 && styles.tacticalMissionValHot]}>{alt}</Text>
        <Text style={styles.tacticalMissionSep}> · </Text>
        <Text style={styles.tacticalMissionLbl}>TOP </Text>
        <Text style={styles.tacticalMissionVal}>{top}</Text>
      </Text>
    </View>
  );
}
