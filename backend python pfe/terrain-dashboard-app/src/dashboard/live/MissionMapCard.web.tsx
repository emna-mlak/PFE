import React, { useMemo } from "react";
import { Dimensions, Text, View, type ViewStyle } from "react-native";

import type { MapCluster, MapPinInput } from "../shared/mapTypes";
import type { MissionMapCardProps } from "./MissionMapCard.types";
import { clusterPins } from "./simpleMapCluster";
import { useMissionControlStyles } from "../shared/styles";

function readingsToPins(readings: MissionMapCardProps["readings"]): MapPinInput[] {
  const out: MapPinInput[] = [];
  const seen = new Set<string>();
  for (const r of readings) {
    if (r.latitude == null || r.longitude == null) continue;
    const key = `${r.plate}-${r.latitude}-${r.longitude}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const critical = r.status === "vignette_impayee" || r.status === "vehicule_recherche";
    out.push({ id: r.id, latitude: r.latitude, longitude: r.longitude, critical });
    if (out.length >= 120) break;
  }
  return out;
}

/** Mini-carte sans react-native-maps (aperçu web / fallback). */
export function MissionMapCard({ readings, operatorPosition, maxHeightFraction = 0.4 }: MissionMapCardProps) {
  const styles = useMissionControlStyles();
  const h = Dimensions.get("window").height;
  const maxH = Math.round(h * maxHeightFraction);
  const op = operatorPosition ?? { latitude: 36.8065, longitude: 10.1815 };

  const pins = useMemo(() => readingsToPins(readings), [readings]);
  const clusters = useMemo(() => clusterPins(pins, 0.0035), [pins]);

  const latMin = op.latitude - 0.02;
  const latMax = op.latitude + 0.02;
  const lngMin = op.longitude - 0.02;
  const lngMax = op.longitude + 0.02;

  const toXY = (lat: number, lng: number): ViewStyle => {
    const x = ((lng - lngMin) / (lngMax - lngMin)) * 100;
    const y = (1 - (lat - latMin) / (latMax - latMin)) * 100;
    return {
      position: "absolute",
      left: `${Math.max(2, Math.min(98, x))}%` as `${number}%`,
      top: `${Math.max(2, Math.min(98, y))}%` as `${number}%`,
    };
  };

  return (
    <View style={[styles.mapCard, { maxHeight: maxH, height: maxH }]}>
      <View style={styles.mapWebInner}>
        <View style={[styles.mapWebOp, toXY(op.latitude, op.longitude)]} />
        {clusters.map((c: MapCluster) => (
          <View
            key={c.id}
            style={[
              c.count > 1 ? styles.mapWebCluster : c.critical ? styles.mapWebPinCrit : styles.mapWebPin,
              toXY(c.latitude, c.longitude),
            ]}
          >
            {c.count > 1 ? <Text style={styles.mapWebClusterTxt}>{c.count}</Text> : null}
          </View>
        ))}
        <View style={styles.mapWebHint}>
          <Text style={styles.mapWebHintTxt}>Carte native sur appareil (Android / iOS)</Text>
        </View>
      </View>
    </View>
  );
}
