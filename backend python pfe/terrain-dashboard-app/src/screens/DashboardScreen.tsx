import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Battery from "expo-battery";
import * as Speech from "expo-speech";

import { resolveCameraStreamUrl } from "../config/cameraStreamUrl";
import { CriticalAlertOverlay, useAlertController } from "../dashboard/alerts";
import { MissionControlLayout } from "../dashboard";
import {
  payloadHasDetectionsKey,
  pickDetectionsFromPayload,
} from "../dashboard/shared/cameraDetectionsFromPayload";
import type { CameraDetectionBox } from "../dashboard/shared/cameraOverlayTypes";
import type { OperatorPosition } from "../dashboard/shared/mapTypes";
import type { VehicleBackendResult } from "../types/vehicle";
import { RealtimeClient } from "../services/realtimeClient";
import { useTheme } from "../theme/ThemeContext";
import {
  pickConfidenceFromPayload,
  pickCoordsFromPayload,
  pickPlateFromPayload,
  pickStatusFromPayload,
} from "./dashboard/parsers";
import { computeCounters, computeUnpaidEntries, filterReadings, sortReadings } from "./dashboard/selectors";
import {
  MAX_VISIBLE_READINGS,
  type DashboardVehiclePayload,
  type PlateReading,
  type RealtimeStatus,
  type SortMode,
  type StatusFilter,
} from "./dashboard/types";

type Props = {
  wsUrl: string;
};

export function DashboardScreen({ wsUrl }: Props) {
  const { mode, setMode } = useTheme();

  const operatorPosition = useMemo<OperatorPosition | null>(() => {
    const la = process.env.EXPO_PUBLIC_OPERATOR_LAT?.trim();
    const lo = process.env.EXPO_PUBLIC_OPERATOR_LON?.trim();
    const lat = la ? parseFloat(la) : 36.8065;
    const lng = lo ? parseFloat(lo) : 10.1815;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { latitude: 36.8065, longitude: 10.1815 };
    return { latitude: lat, longitude: lng };
  }, []);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [readings, setReadings] = useState<PlateReading[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [searchTerm, setSearchTerm] = useState("");
  const [reconnectCount, setReconnectCount] = useState(0);
  const [lastError, setLastError] = useState<string>("");
  const [treatedPlates, setTreatedPlates] = useState<Record<string, true>>({});
  const hasOpenedRef = useRef(false);
  const frenchVoiceIdRef = useRef<string | null>(null);
  const [connectingHint, setConnectingHint] = useState("");
  const eventTimestampsRef = useRef<number[]>([]);
  const [eventsPerSec, setEventsPerSec] = useState(0);
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [cameraBoxes, setCameraBoxes] = useState<CameraDetectionBox[]>([]);

  const cameraStreamUrl = useMemo(() => resolveCameraStreamUrl(), []);

  const resetViewOptions = useCallback(() => {
    setStatusFilter("all");
    setSearchTerm("");
    setSortMode("recent");
  }, []);

  const resolveFrenchVoiceId = useCallback(async () => {
    if (frenchVoiceIdRef.current !== null) return frenchVoiceIdRef.current || undefined;
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const best =
        voices.find((v) => v.language?.toLowerCase() === "fr-fr") ??
        voices.find((v) => v.language?.toLowerCase().startsWith("fr"));
      frenchVoiceIdRef.current = best?.identifier ?? "";
      return best?.identifier;
    } catch {
      frenchVoiceIdRef.current = "";
      return undefined;
    }
  }, []);

  const onSpeak = useCallback(async (text: string) => {
    const voiceId = await resolveFrenchVoiceId();
    Speech.stop();
    Speech.speak(text, {
      language: "fr-FR",
      voice: voiceId,
      rate: 0.95,
      pitch: 1.0,
    });
  }, [resolveFrenchVoiceId]);

  const alertOptions = useMemo(
    () => ({
      cooldownMs: 12_000,
      hideAfterMs: 4_500,
      enableHaptics: true,
      onSpeak,
    }),
    [onSpeak]
  );

  const {
    criticalAlert,
    warningBanner,
    infoAlert,
    hideCritical,
    hideWarning,
    hideInfo,
    onVehicleResult,
  } = useAlertController(alertOptions);

  const onVehicleEvent = useCallback(
    (payload: DashboardVehiclePayload) => {
      void onVehicleResult(payload);

      if (payloadHasDetectionsKey(payload)) {
        setCameraBoxes(pickDetectionsFromPayload(payload));
      }

      const plate = pickPlateFromPayload(payload);
      if (!plate) {
        if (__DEV__) {
          const keys = Object.keys(payload as object).slice(0, 12).join(", ");
          console.warn("[terrain] WS message sans plaque lisible — champs:", keys || "(vide)");
        }
        return;
      }

      const statusText = pickStatusFromPayload(payload);
      const coords = pickCoordsFromPayload(payload);
      const conf = pickConfidenceFromPayload(payload);
      const now = Date.now();
      const next: PlateReading = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        plate,
        status: statusText || "inconnu",
        ts: now,
      };
      if (coords.latitude != null) next.latitude = coords.latitude;
      if (coords.longitude != null) next.longitude = coords.longitude;
      if (conf != null) next.confidence = conf;

      eventTimestampsRef.current.push(now);
      if (eventTimestampsRef.current.length > 200) {
        eventTimestampsRef.current = eventTimestampsRef.current.slice(-200);
      }

      setReadings((prev) => [next, ...prev].slice(0, MAX_VISIBLE_READINGS));
    },
    [onVehicleResult]
  );

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      eventTimestampsRef.current = eventTimestampsRef.current.filter((x) => t - x <= 1000);
      setEventsPerSec(eventTimestampsRef.current.length);
    }, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let sub: { remove: () => void } | undefined;

    const applyLevel = (raw: number) => {
      if (cancelled) return;
      if (raw < 0 || raw > 1) setBatteryPercent(null);
      else setBatteryPercent(Math.round(raw * 100));
    };

    void (async () => {
      try {
        const ps = await Battery.getPowerStateAsync();
        applyLevel(ps.batteryLevel);
      } catch {
        if (!cancelled) setBatteryPercent(null);
      }
    })();

    /* expo-battery web : pas d'addListener sur le module natif — évite TypeError au montage. */
    if (Platform.OS !== "web") {
      try {
        sub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
          applyLevel(batteryLevel);
        });
      } catch {
        /* ignore */
      }
    }

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const handleRealtimeError = useCallback((error: unknown) => {
    setLastError(String(error ?? "unknown error"));
    console.warn("Realtime error:", error);
  }, []);

  const handleRealtimeStatus = useCallback((nextStatus: RealtimeStatus) => {
    setStatus(nextStatus);
    if (nextStatus === "open") {
      if (hasOpenedRef.current) {
        setReconnectCount((count) => count + 1);
      }
      hasOpenedRef.current = true;
      setLastError("");
    }
  }, []);

  const client = useMemo(
    () =>
      new RealtimeClient(wsUrl, {
        onVehicleEvent,
        onStatus: handleRealtimeStatus,
        onError: handleRealtimeError,
      }),
    [handleRealtimeError, handleRealtimeStatus, onVehicleEvent, wsUrl]
  );

  useEffect(() => {
    client.start();
    return () => client.stop();
  }, [client]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      setConnectingHint("");
      return;
    }
    if (status !== "connecting") {
      setConnectingHint("");
      return;
    }
    const id = window.setTimeout(() => {
      let ncTarget = "IP_PI 8000";
      try {
        const httpish = wsUrl.replace(/^ws/i, "http");
        const u = new URL(httpish);
        ncTarget = `${u.hostname} ${u.port || "8000"}`;
      } catch {
        /* ignore */
      }
      setConnectingHint(
        `Connexion longue ? Mac : nc -zv ${ncTarget} — Pi : sudo ufw allow 8000/tcp && sudo ufw reload`
      );
    }, 4000);
    return () => window.clearTimeout(id);
  }, [status, wsUrl]);

  const normalizedSearch = searchTerm.trim().toUpperCase();
  const filteredReadings = useMemo(
    () => filterReadings(readings, statusFilter, normalizedSearch),
    [normalizedSearch, readings, statusFilter]
  );
  const displayedReadings = useMemo(() => sortReadings(filteredReadings, sortMode), [filteredReadings, sortMode]);
  const counters = useMemo(() => computeCounters(readings, filteredReadings.length), [filteredReadings.length, readings]);
  const unpaidEntries = useMemo(() => computeUnpaidEntries(readings, treatedPlates), [readings, treatedPlates]);

  const activeUnpaid = unpaidEntries.find((item) => !item.treated) ?? null;
  const unpaidOpenCount = unpaidEntries.filter((item) => !item.treated).length;

  const toggleTreated = useCallback((plate: string) => {
    setTreatedPlates((prev) => {
      if (prev[plate]) {
        const copy = { ...prev };
        delete copy[plate];
        return copy;
      }
      return { ...prev, [plate]: true };
    });
  }, []);

  /** Simule une vignette impayée (bannière + expo-speech), sans WebSocket. */
  const handleTestDashboardTts = useCallback(async () => {
    const suffix = String(Date.now()).slice(-4);
    const plate = `240 TUN ${suffix}`;
    const payload: VehicleBackendResult = {
      vehicleStatus: "vignette_impayee",
      secondaryText: plate,
      matricule: `240TUN${suffix}`,
    };
    await onVehicleResult(payload);
  }, [onVehicleResult]);

  return (
    <>
      <MissionControlLayout
        mode={mode}
        onSetLight={() => setMode("light")}
        onSetDark={() => setMode("dark")}
        wsUrl={wsUrl}
        status={status}
        reconnectCount={reconnectCount}
        alertOpenCount={unpaidOpenCount}
        eventsPerSec={eventsPerSec}
        readings={displayedReadings}
        pipelineReadings={readings}
        shownCount={counters.shown}
        counters={{ total: counters.total, unpaid: counters.unpaid }}
        unpaidEntries={unpaidEntries}
        activeUnpaid={activeUnpaid}
        unpaidOpenCount={unpaidOpenCount}
        onToggleTreated={toggleTreated}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sortMode={sortMode}
        onToggleSort={() => setSortMode((prev) => (prev === "recent" ? "oldest" : "recent"))}
        onClearScreen={() => {
          setReadings([]);
          setCameraBoxes([]);
        }}
        onResetFilters={resetViewOptions}
        connectingHint={connectingHint}
        lastError={lastError}
        gpsStatus="NO FIX"
        operatorPosition={operatorPosition}
        batteryPercent={batteryPercent}
        cameraStreamUrl={cameraStreamUrl}
        cameraBoxes={cameraBoxes}
        warningBanner={warningBanner}
        infoAlert={infoAlert}
        onDismissWarning={hideWarning}
        onDismissInfo={hideInfo}
        onTestTts={__DEV__ ? handleTestDashboardTts : undefined}
      />
      <CriticalAlertOverlay alert={criticalAlert} onDismiss={hideCritical} />
    </>
  );
}
