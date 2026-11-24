import React from "react";
import { Text, View } from "react-native";

import { useMissionControlStyles } from "./styles";
import type { SystemHealth } from "./systemHealth";

type Props = {
  lastPlate: string;
  lastStatus: string;
  lastTimeLabel: string;
  gpsStatus: string;
  deviceLine: string;
  systemHealth: SystemHealth;
  totalEvents: number;
  unpaidTotal: number;
};

export function BottomBarCompact({
  lastPlate,
  lastStatus,
  lastTimeLabel,
  gpsStatus,
  deviceLine,
  systemHealth,
  totalEvents,
  unpaidTotal,
}: Props) {
  const styles = useMissionControlStyles();
  const healthStyle =
    systemHealth === "OK" ? styles.healthOk : systemHealth === "WARN" ? styles.healthWarn : styles.healthFail;

  return (
    <View style={styles.bottomBar}>
      <View style={styles.bottomRow1}>
        <View style={styles.bottomBlockGrow}>
          <Text style={styles.bottomLabel}>Dernier event</Text>
          <Text style={styles.bottomValue} numberOfLines={1}>
            {lastPlate || "—"} · {lastStatus || "—"} · {lastTimeLabel}
          </Text>
        </View>
        <View style={styles.bottomIndicators}>
          <View style={styles.indPill}>
            <Text style={styles.indPillText}>EVT {totalEvents}</Text>
          </View>
          <View style={styles.indPill}>
            <Text style={styles.indPillText}>IMP {unpaidTotal}</Text>
          </View>
        </View>
      </View>
      <View style={styles.bottomRow2}>
        <View style={styles.bottomBlockGrow}>
          <Text style={styles.bottomLabel}>GPS</Text>
          <Text style={styles.bottomValue} numberOfLines={1}>
            {gpsStatus}
          </Text>
        </View>
        <View style={[styles.bottomBlockGrow, styles.bottomBlockEnd]}>
          <Text style={styles.bottomLabel}>Device / santé</Text>
          <View style={styles.bottomDeviceRow}>
            <Text style={[styles.bottomValue, styles.bottomValueShrink]} numberOfLines={1}>
              {deviceLine}
            </Text>
            <View style={[styles.healthPillMini, healthStyle]}>
              <Text style={styles.healthPillText}>{systemHealth}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
