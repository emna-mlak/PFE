import React from "react";
import { View } from "react-native";

import type { OperatorPosition } from "../shared/mapTypes";
import type { CameraDetectionBox } from "../shared/cameraOverlayTypes";
import type { PlateReading, RealtimeStatus, UnpaidEntry } from "../../screens/dashboard/types";
import { EmbeddedCameraPanel } from "./EmbeddedCameraPanel";
import { MissionAlertStrip } from "./MissionAlertStrip";
import { MissionEventFeed } from "../events/MissionEventFeed";
import { TacticalAiStrip } from "./TacticalAiStrip";
import { TacticalMiniMap } from "./TacticalMiniMap";
import {
  TACTICAL_CAMERA_BAND_FLEX,
  TACTICAL_OPS_BAND_FLEX,
} from "../shared/tacticalLayout";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  status: RealtimeStatus;
  reconnectCount: number;
  eventsPerSec: number;
  hasWsError: boolean;
  batteryPercent: number | null;
  unpaidOpenCount: number;
  activeUnpaid: UnpaidEntry | null;
  readings: PlateReading[];
  pipelineReadings: PlateReading[];
  shownCount: number;
  operatorPosition: OperatorPosition | null;
  cameraStreamUrl?: string | null;
  cameraBoxes: CameraDetectionBox[];
};

/**
 * Prototype LIVE — terminal embarqué : caméra dominante (~68 %), bande ops compacte.
 * Remplace MainLiveGrid sur l’onglet LIVE uniquement.
 */
export function TacticalLiveView({
  status,
  reconnectCount,
  eventsPerSec,
  hasWsError,
  batteryPercent,
  unpaidOpenCount,
  activeUnpaid,
  readings,
  pipelineReadings,
  shownCount,
  operatorPosition,
  cameraStreamUrl,
  cameraBoxes,
}: Props) {
  const styles = useMissionControlStyles();

  return (
    <View style={styles.tacticalLiveRoot}>
      <View style={[styles.tacticalCameraBand, { flex: TACTICAL_CAMERA_BAND_FLEX }]}>
        <EmbeddedCameraPanel
          status={status}
          streamUrl={cameraStreamUrl}
          fps={eventsPerSec}
          boxes={cameraBoxes}
          dominant
        />
      </View>

      <View style={[styles.tacticalOpsBand, { flex: TACTICAL_OPS_BAND_FLEX }]}>
        <TacticalMiniMap readings={readings} operatorPosition={operatorPosition} />

        <View style={styles.tacticalOpsCol}>
          <MissionAlertStrip unpaidOpenCount={unpaidOpenCount} activeUnpaid={activeUnpaid} />
          <TacticalAiStrip
            wsStatus={status}
            eventsPerSec={eventsPerSec}
            reconnectCount={reconnectCount}
            hasWsError={hasWsError}
            readings={pipelineReadings}
            batteryPercent={batteryPercent}
          />
          <MissionEventFeed
            readings={readings}
            shownCount={shownCount}
            variant="tactical"
          />
        </View>
      </View>
    </View>
  );
}
