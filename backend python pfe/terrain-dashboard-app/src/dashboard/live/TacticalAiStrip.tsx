import React, { useMemo } from "react";
import { Text, View } from "react-native";

import type { PlateReading, RealtimeStatus } from "../../screens/dashboard/types";
import { computeTacticalAiMetrics, TACTICAL_TONE_COLOR, type TacticalMetric } from "../shared/tacticalAiMetrics";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  wsStatus: RealtimeStatus;
  eventsPerSec: number;
  reconnectCount: number;
  hasWsError: boolean;
  readings: PlateReading[];
  batteryPercent: number | null;
};

function Cell({ label, metric }: { label: string; metric: TacticalMetric }) {
  const styles = useMissionControlStyles();
  const color = TACTICAL_TONE_COLOR[metric.tone];

  return (
    <View style={styles.tacticalAiCell}>
      <View style={[styles.tacticalAiStripBar, { backgroundColor: color }]} />
      <Text style={styles.tacticalAiLbl}>{label}</Text>
      <Text style={[styles.tacticalAiVal, { color }]} numberOfLines={1}>
        {metric.value}
      </Text>
    </View>
  );
}

/** FPS · OCR · NET · BAT — une ligne, sans icônes (glance LCD 7"). */
export function TacticalAiStrip(props: Props) {
  const styles = useMissionControlStyles();
  const m = useMemo(
    () =>
      computeTacticalAiMetrics({
        wsStatus: props.wsStatus,
        eventsPerSec: props.eventsPerSec,
        reconnectCount: props.reconnectCount,
        hasWsError: props.hasWsError,
        readings: props.readings,
        batteryPercent: props.batteryPercent,
      }),
    [
      props.batteryPercent,
      props.eventsPerSec,
      props.hasWsError,
      props.readings,
      props.reconnectCount,
      props.wsStatus,
    ]
  );

  return (
    <View style={styles.tacticalAiStrip} accessibilityRole="summary">
      <Cell label="FPS" metric={m.fps} />
      <Cell label="OCR" metric={m.ocr} />
      <Cell label="NET" metric={m.net} />
      <Cell label="BAT" metric={m.bat} />
    </View>
  );
}
