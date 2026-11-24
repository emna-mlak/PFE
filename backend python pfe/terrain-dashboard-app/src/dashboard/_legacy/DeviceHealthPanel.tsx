import * as FileSystem from "expo-file-system";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";

import type { RealtimeStatus } from "../screens/dashboard/types";
import { useMissionControlStyles } from "./styles";

type Props = {
  wsStatus: RealtimeStatus;
  hasWsError: boolean;
  reconnectCount: number;
  cameraStreamUrl?: string | null;
};

type Led = "good" | "warn" | "bad" | "unk";

const LED: Record<Led, string> = {
  good: "#22C55E",
  warn: "#F59E0B",
  bad: "#EF4444",
  unk: "#64748B",
};

function useNavigatorOnline(): boolean | null {
  const [v, setV] = useState<boolean | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      setV(null);
      return;
    }
    const sync = () => setV(window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return v;
}

function useDiskFreeFraction(): number | null {
  const [pct, setPct] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS === "web") {
      setPct(null);
      return;
    }
    let cancelled = false;
    const sample = async () => {
      try {
        const [free, total] = await Promise.all([
          FileSystem.getFreeDiskStorageAsync(),
          FileSystem.getTotalDiskCapacityAsync(),
        ]);
        if (cancelled) return;
        if (typeof free === "number" && typeof total === "number" && total > 0) {
          setPct(Math.min(1, Math.max(0, free / total)));
        } else {
          setPct(null);
        }
      } catch {
        if (!cancelled) setPct(null);
      }
    };
    void sample();
    const id = setInterval(sample, 25_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return pct;
}

function Cell({ led, label, a11y }: { led: Led; label: string; a11y: string }) {
  const styles = useMissionControlStyles();
  return (
    <View style={styles.deviceHealthCell} accessibilityLabel={a11y} accessible>
      <View style={[styles.deviceHealthDot, { backgroundColor: LED[led] }]} />
      <Text style={styles.deviceHealthLbl} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Bandeau monitoring embarqué 7" : pastilles vert / orange / rouge, libellés courts (PI, CAM, WS, NET, DISK).
 */
export function DeviceHealthPanel({
  wsStatus,
  hasWsError,
  reconnectCount,
  cameraStreamUrl,
}: Props) {
  const styles = useMissionControlStyles();
  const online = useNavigatorOnline();
  const diskPct = useDiskFreeFraction();

  const piLed = useMemo((): Led => {
    if (wsStatus === "error") return "bad";
    if (wsStatus === "closed" && hasWsError) return "bad";
    if (wsStatus === "closed") return "bad";
    if (wsStatus === "connecting") return "warn";
    if (wsStatus === "open" && hasWsError) return "warn";
    if (wsStatus === "open" && reconnectCount >= 2) return "warn";
    return "good";
  }, [hasWsError, reconnectCount, wsStatus]);

  const camLed = useMemo((): Led => {
    const uri = cameraStreamUrl?.trim();
    if (!uri) return "bad";
    if (wsStatus !== "open") return "warn";
    return "good";
  }, [cameraStreamUrl, wsStatus]);

  const wsLed = useMemo((): Led => {
    if (wsStatus === "open" && !hasWsError) return "good";
    if (wsStatus === "connecting") return "warn";
    return "bad";
  }, [hasWsError, wsStatus]);

  const netLed = useMemo((): Led => {
    if (online === false) return "bad";
    if (online === true) return "good";
    if (wsStatus === "open") return "good";
    return "unk";
  }, [online, wsStatus]);

  const diskLed = useMemo((): Led => {
    if (diskPct === null) return "unk";
    if (diskPct < 0.08) return "bad";
    if (diskPct < 0.16) return "warn";
    return "good";
  }, [diskPct]);

  return (
    <View style={styles.deviceHealthWrap}>
      <Cell led={piLed} label="PI" a11y={`Raspberry Pi ${piLed}`} />
      <Cell led={camLed} label="CAM" a11y={`Caméra ${camLed}`} />
      <Cell led={wsLed} label="WS" a11y={`WebSocket ${wsLed}`} />
      <Cell led={netLed} label="NET" a11y={`Réseau ${netLed}`} />
      <Cell led={diskLed} label="DISK" a11y={`Stockage ${diskLed}`} />
    </View>
  );
}
