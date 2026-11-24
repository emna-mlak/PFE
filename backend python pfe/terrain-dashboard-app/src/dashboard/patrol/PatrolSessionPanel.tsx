import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { useMissionControlStyles } from "../shared/styles";

type Props = {
  sessionStartedAtMs: number;
  detectionCount: number;
  activeAlerts: number;
  gpsStatus: string;
};

function formatSessionDuration(elapsedMs: number): string {
  const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function gpsTone(gps: string): "good" | "warn" | "bad" {
  const u = gps.toUpperCase();
  if (u.includes("NO") && u.includes("FIX")) return "bad";
  if (u.includes("FIX") || u.includes("3D") || u.includes("2D")) return "good";
  if (u.includes("OK")) return "good";
  return "warn";
}

const GPS_COLOR: Record<"good" | "warn" | "bad", string> = {
  good: "#22C55E",
  warn: "#F59E0B",
  bad: "#EF4444",
};

/**
 * Vue opération « cockpit » 7" : durée session, détections, alertes actives, statut GPS — chiffres larges, peu de texte.
 */
export function PatrolSessionPanel({ sessionStartedAtMs, detectionCount, activeAlerts, gpsStatus }: Props) {
  const styles = useMissionControlStyles();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = now - sessionStartedAtMs;
  const durationStr = useMemo(() => formatSessionDuration(elapsed), [elapsed]);
  const tone = useMemo(() => gpsTone(gpsStatus), [gpsStatus]);
  const alertNumStyle = activeAlerts > 0 ? { color: "#F97316" as const } : undefined;

  return (
    <View style={styles.patrolRoot}>
      <Text style={styles.patrolBadge} accessibilityRole="header">
        PATROL
      </Text>

      <Text style={styles.patrolDuration} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
        {durationStr}
      </Text>
      <Text style={styles.patrolDurationCap}>SESSION</Text>

      <View style={styles.patrolKpiRow}>
        <View style={styles.patrolKpiCell}>
          <Text style={styles.patrolKpiNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.35}>
            {detectionCount}
          </Text>
          <Text style={styles.patrolKpiCap}>DETECTIONS</Text>
        </View>
        <View style={styles.patrolKpiCell}>
          <Text
            style={[styles.patrolKpiNum, alertNumStyle]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.35}
          >
            {activeAlerts}
          </Text>
          <Text style={styles.patrolKpiCap}>ALERTES</Text>
        </View>
      </View>

      <View style={styles.patrolGpsBlock}>
        <Text style={styles.patrolGpsCap}>GPS</Text>
        <Text style={[styles.patrolGpsVal, { color: GPS_COLOR[tone] }]} numberOfLines={2} adjustsFontSizeToFit>
          {gpsStatus.trim() || "—"}
        </Text>
      </View>
    </View>
  );
}
