import React from "react";
import { View } from "react-native";

import type { OperatorPosition } from "./mapTypes";
import type { CameraDetectionBox } from "./cameraOverlayTypes";
import type { PlateReading, RealtimeStatus, UnpaidEntry } from "../screens/dashboard/types";
import { AiSystemStatusPanel } from "./AiSystemStatusPanel";
import { DeviceHealthPanel } from "./DeviceHealthPanel";
import { EmbeddedCameraPanel } from "./EmbeddedCameraPanel";
import { MissionAlertStrip } from "./MissionAlertStrip";
import { MissionEventFeed } from "./MissionEventFeed";
import { ThreatScoreWidget } from "./ThreatScoreWidget";
import { MissionMapCard } from "./MissionMapCard";
import { useMissionControlStyles } from "./styles";

type Props = {
  status: RealtimeStatus;
  reconnectCount: number;
  eventsPerSec: number;
  hasWsError: boolean;
  batteryPercent: number | null;
  unpaidOpenCount: number;
  activeUnpaid: UnpaidEntry | null;
  /** Liste affichée (filtres) : flux + carte. */
  readings: PlateReading[];
  /** Pipeline complet : métriques AI (OCR, latence) même si le flux est filtré. */
  pipelineReadings: PlateReading[];
  shownCount: number;
  operatorPosition: OperatorPosition | null;
  cameraStreamUrl?: string | null;
  cameraBoxes: CameraDetectionBox[];
};

/** Grille 2 colonnes max : caméra + carte (≤40 %) | alertes + AI + timeline. */
export function MainLiveGrid({
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
    <View style={styles.bodyRow}>
      <View style={styles.colCameraColumn}>
        <View style={styles.cameraStackFlex}>
          <EmbeddedCameraPanel
            status={status}
            streamUrl={cameraStreamUrl}
            fps={eventsPerSec}
            boxes={cameraBoxes}
          />
        </View>
        <MissionMapCard readings={readings} operatorPosition={operatorPosition} maxHeightFraction={0.4} />
      </View>
      <View style={styles.colOps}>
        <MissionAlertStrip unpaidOpenCount={unpaidOpenCount} activeUnpaid={activeUnpaid} />
        <DeviceHealthPanel
          wsStatus={status}
          hasWsError={hasWsError}
          reconnectCount={reconnectCount}
          cameraStreamUrl={cameraStreamUrl}
        />
        <ThreatScoreWidget readings={pipelineReadings} />
        <AiSystemStatusPanel
          wsStatus={status}
          eventsPerSec={eventsPerSec}
          reconnectCount={reconnectCount}
          hasWsError={hasWsError}
          readings={pipelineReadings}
          batteryPercent={batteryPercent}
        />
        <MissionEventFeed readings={readings} shownCount={shownCount} />
      </View>
    </View>
  );
}
