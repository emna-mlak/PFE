import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { PlateReading } from "../screens/dashboard/types";
import { useTheme } from "../theme/ThemeContext";
import { buildAnalyticsSnapshot, maxInArray } from "./terrainAnalyticsModel";
import type { SystemHealth } from "./systemHealth";
import { useMissionControlStyles } from "./styles";

type Props = {
  readings: PlateReading[];
  eventsPerSec: number;
  systemHealth: SystemHealth;
};

function MiniBars({ values, color, maxH }: { values: number[]; color: string; maxH: number }) {
  const maxV = maxInArray(values);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: maxH, gap: 4 }}>
      {values.map((v, i) => {
        const h = Math.max(4, Math.round((v / maxV) * (maxH - 4)));
        return (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <View
              style={{
                width: "100%",
                height: h,
                borderRadius: 3,
                backgroundColor: color,
                opacity: 0.88,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

function MiniStack3({
  unpaid,
  wanted,
  other,
  maxH,
  colors,
}: {
  unpaid: number;
  wanted: number;
  other: number;
  maxH: number;
  colors: { unpaid: string; wanted: string; other: string };
}) {
  const maxV = Math.max(1, unpaid, wanted, other);
  const hU = Math.max(3, Math.round((unpaid / maxV) * (maxH - 8)));
  const hW = Math.max(3, Math.round((wanted / maxV) * (maxH - 8)));
  const hO = Math.max(3, Math.round((other / maxV) * (maxH - 8)));
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", height: maxH, gap: 8 }}>
      <View style={{ alignItems: "center", flex: 1 }}>
        <View style={{ width: "70%", height: hU, borderRadius: 4, backgroundColor: colors.unpaid }} />
        <Text style={{ fontSize: 7, marginTop: 2, fontWeight: "800", color: colors.unpaid }}>I</Text>
      </View>
      <View style={{ alignItems: "center", flex: 1 }}>
        <View style={{ width: "70%", height: hW, borderRadius: 4, backgroundColor: colors.wanted }} />
        <Text style={{ fontSize: 7, marginTop: 2, fontWeight: "800", color: colors.wanted }}>R</Text>
      </View>
      <View style={{ alignItems: "center", flex: 1 }}>
        <View style={{ width: "70%", height: hO, borderRadius: 4, backgroundColor: colors.other }} />
        <Text style={{ fontSize: 7, marginTop: 2, fontWeight: "800", color: colors.other }}>+</Text>
      </View>
    </View>
  );
}

/** Analytics session (mémoire tampon) — 4 KPI + 2 mini-graphiques max, format 7". */
export function TerrainAnalyticsPanel({ readings, eventsPerSec, systemHealth }: Props) {
  const styles = useMissionControlStyles();
  const { colors } = useTheme();
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 3_000);
    return () => clearInterval(id);
  }, []);

  const snap = useMemo(
    () => buildAnalyticsSnapshot(readings, tick, eventsPerSec),
    [readings, tick, eventsPerSec]
  );

  const topLine =
    snap.topPlates.length === 0
      ? "—"
      : snap.topPlates
          .slice(0, 3)
          .map((p) => `${p.plate}(${p.count})`)
          .join(" · ");

  const healthShort = systemHealth === "OK" ? "OK" : systemHealth === "WARN" ? "!" : "×";

  return (
    <ScrollView style={styles.analyticsScroll} contentContainerStyle={styles.analyticsScrollContent}>
      <Text style={styles.analyticsTitle}>SESSION</Text>
      <Text style={styles.analyticsSub}>Mémoire tampon · pas d&apos;historique serveur</Text>

      <View style={styles.analyticsKpiBlock}>
        <View style={styles.analyticsKpiRow}>
          <View style={styles.analyticsKpiCell}>
            <Text style={styles.analyticsKpiLbl}>DÉT / H</Text>
            <Text style={styles.analyticsKpiVal}>{snap.detectionsPerHour}</Text>
          </View>
          <View style={styles.analyticsKpiCell}>
            <Text style={styles.analyticsKpiLbl}>ALRT / 24H</Text>
            <Text style={styles.analyticsKpiVal}>{snap.alertsPerDayWindow}</Text>
          </View>
        </View>
        <View style={styles.analyticsKpiCellFull}>
          <Text style={styles.analyticsKpiLbl}>TOP PLAQUES</Text>
          <Text style={styles.analyticsKpiSmall} numberOfLines={2}>
            {topLine}
          </Text>
        </View>
        <View style={styles.analyticsKpiRow}>
          <View style={[styles.analyticsKpiCell, { flex: 1 }]}>
            <Text style={styles.analyticsKpiLbl}>SYS</Text>
            <Text style={styles.analyticsKpiVal}>
              {healthShort} {Math.round(snap.perfEventsPerSec)}/s
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.analyticsChartCard}>
        <Text style={styles.analyticsChartTitle}>Détections · 6×10 min</Text>
        <MiniBars values={snap.detectionBuckets6} color={colors.filterChipActiveBorder} maxH={56} />
      </View>

      <View style={styles.analyticsChartCard}>
        <Text style={styles.analyticsChartTitle}>Lecture 24h · I / R / +</Text>
        <MiniStack3
          unpaid={snap.alertBars.unpaid}
          wanted={snap.alertBars.wanted}
          other={snap.alertBars.other}
          maxH={56}
          colors={{
            unpaid: colors.statusUnpaid,
            wanted: colors.statusWanted,
            other: colors.sub,
          }}
        />
      </View>
    </ScrollView>
  );
}
