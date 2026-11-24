import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import type { PlateReading } from "../../screens/dashboard/types";
import { computeThreatScore, threatScoreColor } from "./threatScoreModel";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  readings: PlateReading[];
};

/** Widget Threat Score — score central 0–100, couleur dynamique, ≤3 facteurs, style radar tactique. */
export function ThreatScoreWidget({ readings }: Props) {
  const styles = useMissionControlStyles();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 4_000);
    return () => clearInterval(id);
  }, []);

  const { score, factors } = useMemo(() => computeThreatScore(readings, now), [readings, now]);
  const col = threatScoreColor(score);

  return (
    <View style={[styles.threatWidget, { borderColor: col.track, shadowColor: col.main }]}>
      <View style={[styles.threatRadarRing, { borderColor: col.track }]}>
        <View style={[styles.threatRadarInner, { borderColor: col.main }]}>
          <Text style={styles.threatLabel}>THREAT AI</Text>
          <View style={styles.threatScoreRow}>
            <Text style={[styles.threatScore, { color: col.main }]}>{score}</Text>
            <Text style={styles.threatPct}>%</Text>
          </View>
        </View>
      </View>
      <View style={styles.threatFactors}>
        {factors.map((f) => (
          <View key={f.label} style={styles.threatFactorRow}>
            <View style={[styles.threatDot, { backgroundColor: col.main }]} />
            <Text style={styles.threatFactorText} numberOfLines={1}>
              {f.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
