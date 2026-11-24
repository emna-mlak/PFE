import React, { useMemo } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";

import type { MapPinInput } from "../shared/mapTypes";
import type { MissionMapCardProps } from "./MissionMapCard.types";
import { clusterPins } from "./simpleMapCluster";
import { useMissionControlStyles } from "../shared/styles";

const DEFAULT_DELTA = 0.035;

const markerStyles = StyleSheet.create({
  opDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#0EA5E9",
    borderWidth: 2,
    borderColor: "#E0F2FE",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#64748B",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  critDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#DC2626",
    borderWidth: 2,
    borderColor: "#FECACA",
  },
  clusterLabel: { color: "#FFF", fontSize: 9, fontWeight: "900" },
  clusterBubble: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#334155",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  clusterBubbleCrit: { backgroundColor: "#B91C1C" },
  overlayHint: {
    position: "absolute",
    top: 4,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  overlayHintText: { color: "#E2E8F0", fontSize: 9, fontWeight: "700" },
});

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

export function MissionMapCard({ readings, operatorPosition, maxHeightFraction = 0.4 }: MissionMapCardProps) {
  const styles = useMissionControlStyles();
  const h = Dimensions.get("window").height;
  const maxH = Math.round(h * maxHeightFraction);

  const op = operatorPosition ?? { latitude: 36.8065, longitude: 10.1815 };

  const pins = useMemo(() => readingsToPins(readings), [readings]);
  const clusters = useMemo(() => clusterPins(pins, 0.0035), [pins]);

  const region = useMemo(
    () => ({
      latitude: op.latitude,
      longitude: op.longitude,
      latitudeDelta: DEFAULT_DELTA,
      longitudeDelta: DEFAULT_DELTA,
    }),
    [op.latitude, op.longitude]
  );

  const heatPoints = useMemo(() => clusters.filter((c) => c.critical).slice(0, 6), [clusters]);

  return (
    <View style={[styles.mapCard, { maxHeight: maxH, height: maxH }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        rotateEnabled={false}
        pitchEnabled={false}
        scrollEnabled
        zoomEnabled
        toolbarEnabled={false}
        mapType="mutedStandard"
      >
        <Circle
          center={{ latitude: op.latitude, longitude: op.longitude }}
          radius={20}
          strokeColor="#38BDF8"
          fillColor="rgba(56,189,248,0.18)"
          strokeWidth={2}
        />
        <Marker coordinate={{ latitude: op.latitude, longitude: op.longitude }} tracksViewChanges={false}>
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <View style={markerStyles.opDot} />
          </View>
        </Marker>

        {heatPoints.map((c) => (
          <Circle
            key={`heat-${c.id}`}
            center={{ latitude: c.latitude, longitude: c.longitude }}
            radius={42}
            fillColor="rgba(248,113,113,0.1)"
            strokeWidth={0}
          />
        ))}

        {clusters.map((c) => (
          <Marker
            key={c.id}
            coordinate={{ latitude: c.latitude, longitude: c.longitude }}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={{ alignItems: "center", justifyContent: "center" }}>
              {c.count > 1 ? (
                <View style={[markerStyles.clusterBubble, c.critical && markerStyles.clusterBubbleCrit]}>
                  <Text style={markerStyles.clusterLabel}>{c.count}</Text>
                </View>
              ) : (
                <View style={c.critical ? markerStyles.critDot : markerStyles.dot} />
              )}
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={markerStyles.overlayHint} pointerEvents="none">
        <Text style={markerStyles.overlayHintText}>
          {pins.length === 0 ? "GPS plaques → payload" : `${clusters.length} grp · ${pins.length} pts`}
        </Text>
      </View>
    </View>
  );
}
