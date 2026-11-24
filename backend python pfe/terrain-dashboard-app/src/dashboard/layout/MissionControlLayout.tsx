import React, { useEffect, useMemo, useState } from "react";
import { Platform, SafeAreaView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import type { PlateReading, RealtimeStatus, SortMode, StatusFilter, UnpaidEntry } from "../../screens/dashboard/types";
import type { InfoAlertModel, WarningBannerModel } from "../../types/vehicle";
import { WarningAlertBanner } from "../alerts/WarningAlertBanner";
import { TacticalEventsView } from "../events/TacticalEventsView";
import { TacticalLiveView } from "../live/TacticalLiveView";
import { TacticalPatrolView } from "../patrol/TacticalPatrolView";
import type { CameraDetectionBox } from "../shared/cameraOverlayTypes";
import type { OperatorPosition } from "../shared/mapTypes";
import { computeSystemHealth } from "../shared/systemHealth";
import { useMissionControlStyles } from "../shared/styles";
import type { MissionTab } from "./MissionTabBar";
import { MissionTabBar } from "./MissionTabBar";
import { TacticalStatusLine } from "./TacticalStatusLine";
import { TopStatusStrip } from "./TopStatusStrip";

type Props = {
  mode: "light" | "dark";
  onSetLight: () => void;
  onSetDark: () => void;
  wsUrl: string;
  status: RealtimeStatus;
  reconnectCount: number;
  alertOpenCount: number;
  eventsPerSec: number;
  readings: PlateReading[];
  pipelineReadings: PlateReading[];
  shownCount: number;
  counters: { total: number; unpaid: number };
  unpaidEntries: UnpaidEntry[];
  activeUnpaid: UnpaidEntry | null;
  unpaidOpenCount: number;
  onToggleTreated: (plate: string) => void;
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (v: StatusFilter) => void;
  sortMode: SortMode;
  onToggleSort: () => void;
  onClearScreen: () => void;
  onResetFilters: () => void;
  connectingHint: string;
  lastError: string;
  gpsStatus: string;
  operatorPosition: OperatorPosition | null;
  batteryPercent: number | null;
  cameraStreamUrl?: string | null;
  cameraBoxes: CameraDetectionBox[];
  warningBanner: WarningBannerModel;
  infoAlert: InfoAlertModel;
  onDismissWarning: () => void;
  onDismissInfo: () => void;
  /** Mode dev : simule alerte vignette impayée + TTS. */
  onTestTts?: () => void;
};

export function MissionControlLayout(props: Props) {
  const styles = useMissionControlStyles();
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString("fr-FR"));
  const [tab, setTab] = useState<MissionTab>("live");
  const [sessionStartedAtMs] = useState(() => Date.now());

  const systemHealth = useMemo(
    () => computeSystemHealth(props.status, props.reconnectCount, Boolean(props.lastError)),
    [props.lastError, props.reconnectCount, props.status]
  );

  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString("fr-FR")), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style={props.mode === "light" ? "dark" : "light"} />

      <TopStatusStrip
        status={props.status}
        systemHealth={systemHealth}
        alertOpenCount={props.alertOpenCount}
        clockText={clock}
        eventsPerSec={props.eventsPerSec}
        onSetLight={props.onSetLight}
        onSetDark={props.onSetDark}
        infoAlert={props.infoAlert}
        onDismissInfo={props.onDismissInfo}
        onTestTts={props.onTestTts}
      />
      <WarningAlertBanner model={props.warningBanner} onDismiss={props.onDismissWarning} />

      <MissionTabBar active={tab} onChange={setTab} />

      <View style={styles.mainPad}>
        {props.lastError ? (
          <Text style={styles.hintError} selectable numberOfLines={2}>
            {props.lastError}
          </Text>
        ) : null}
        {props.connectingHint && Platform.OS === "web" ? (
          <Text style={styles.hintError} selectable numberOfLines={2}>
            {props.connectingHint}
          </Text>
        ) : null}

        <View style={styles.mainBody}>
          {tab === "live" ? (
            <TacticalLiveView
              status={props.status}
              reconnectCount={props.reconnectCount}
              eventsPerSec={props.eventsPerSec}
              hasWsError={Boolean(props.lastError)}
              batteryPercent={props.batteryPercent}
              unpaidOpenCount={props.unpaidOpenCount}
              activeUnpaid={props.activeUnpaid}
              readings={props.readings}
              pipelineReadings={props.pipelineReadings}
              shownCount={props.shownCount}
              operatorPosition={props.operatorPosition}
              cameraStreamUrl={props.cameraStreamUrl}
              cameraBoxes={props.cameraBoxes}
            />
          ) : null}

          {tab === "events" ? (
            <TacticalEventsView
              readings={props.readings}
              pipelineReadings={props.pipelineReadings}
              shownCount={props.shownCount}
              unpaidEntries={props.unpaidEntries}
              activeUnpaid={props.activeUnpaid}
              onToggleTreated={props.onToggleTreated}
              searchTerm={props.searchTerm}
              onSearchTermChange={props.onSearchTermChange}
              statusFilter={props.statusFilter}
              onStatusFilterChange={props.onStatusFilterChange}
              sortMode={props.sortMode}
              onToggleSort={props.onToggleSort}
              onClearScreen={props.onClearScreen}
              onResetFilters={props.onResetFilters}
            />
          ) : null}

          {tab === "patrol" ? (
            <TacticalPatrolView
              sessionStartedAtMs={sessionStartedAtMs}
              detectionCount={props.pipelineReadings.length}
              activeAlerts={props.alertOpenCount}
              gpsStatus={props.gpsStatus}
              pipelineReadings={props.pipelineReadings}
            />
          ) : null}
        </View>
      </View>

      <TacticalStatusLine
        wsStatus={props.status}
        hasWsError={Boolean(props.lastError)}
        totalEvents={props.counters.total}
        gpsStatus={props.gpsStatus}
        systemHealth={systemHealth}
      />
    </SafeAreaView>
  );
}
