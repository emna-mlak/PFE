import React from "react";
import { Dimensions, Text, View } from "react-native";

import type { OperatorPosition } from "../shared/mapTypes";
import type { PlateReading } from "../../screens/dashboard/types";
import { MissionMapCard } from "./MissionMapCard";
import { TACTICAL_MAP_HEIGHT_PX, TACTICAL_MAP_WIDTH_PERCENT } from "../shared/tacticalLayout";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  readings: PlateReading[];
  operatorPosition: OperatorPosition | null;
};

/** Carte tactique compacte (~28 % largeur bande bas LIVE). */
export function TacticalMiniMap({ readings, operatorPosition }: Props) {
  const styles = useMissionControlStyles();
  const fraction = TACTICAL_MAP_HEIGHT_PX / Math.max(320, Dimensions.get("window").height);

  return (
    <View style={[styles.tacticalMapWrap, { width: TACTICAL_MAP_WIDTH_PERCENT }]}>
      <Text style={styles.tacticalMapLbl}>MAP</Text>
      <View style={styles.tacticalMapInner}>
        <MissionMapCard readings={readings} operatorPosition={operatorPosition} maxHeightFraction={fraction} />
      </View>
    </View>
  );
}
