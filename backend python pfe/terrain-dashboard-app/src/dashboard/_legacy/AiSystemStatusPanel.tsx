import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import type { PlateReading, RealtimeStatus } from "../screens/dashboard/types";
import { useTheme } from "../theme/ThemeContext";
import { useMissionControlStyles } from "./styles";

type Tone = "good" | "warn" | "bad" | "neutral";

const TONE_STRIP: Record<Tone, string> = {
  good: "#22C55E",
  warn: "#FB923C",
  bad: "#EF4444",
  neutral: "#64748B",
};

const TONE_VALUE: Record<Tone, string> = {
  good: "#16A34A",
  warn: "#EA580C",
  bad: "#DC2626",
  neutral: "#94A3B8",
};

type MiniProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  value: string;
  tone: Tone;
  iconColor: string;
};

function MiniCard({ icon, label, value, tone, iconColor }: MiniProps) {
  const styles = useMissionControlStyles();
  return (
    <View style={styles.aiMiniCard}>
      <View style={[styles.aiMiniStrip, { backgroundColor: TONE_STRIP[tone] }]} />
      <MaterialCommunityIcons name={icon} size={16} color={iconColor} style={styles.aiMiniIcon} />
      <View style={styles.aiMiniTextCol}>
        <Text style={styles.aiMiniLbl} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.aiMiniVal, { color: TONE_VALUE[tone] }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

type Props = {
  wsStatus: RealtimeStatus;
  eventsPerSec: number;
  reconnectCount: number;
  hasWsError: boolean;
  readings: PlateReading[];
  batteryPercent: number | null;
};

function useNowMs(intervalMs: number) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return t;
}

export function AiSystemStatusPanel({
  wsStatus,
  eventsPerSec,
  reconnectCount,
  hasWsError,
  readings,
  batteryPercent,
}: Props) {
  const styles = useMissionControlStyles();
  const { colors } = useTheme();
  const now = useNowMs(400);

  const ocrAvg = useMemo(() => {
    const slice = readings.slice(0, 24).filter((r) => typeof r.confidence === "number");
    if (slice.length === 0) return null;
    return Math.round(slice.reduce((a, r) => a + (r.confidence as number), 0) / slice.length);
  }, [readings]);

  const lastAgeMs = readings[0] ? now - readings[0].ts : null;

  const yolo = useMemo(() => {
    if (wsStatus === "open") return { v: "ACTIVE", t: "good" as Tone };
    if (wsStatus === "connecting") return { v: "WAIT", t: "warn" as Tone };
    if (wsStatus === "error") return { v: "FAIL", t: "bad" as Tone };
    return { v: "IDLE", t: "neutral" as Tone };
  }, [wsStatus]);

  const ocr = useMemo(() => {
    if (ocrAvg == null) return { v: "—", t: "neutral" as Tone };
    if (ocrAvg >= 85) return { v: `${ocrAvg}%`, t: "good" as Tone };
    if (ocrAvg >= 60) return { v: `${ocrAvg}%`, t: "warn" as Tone };
    return { v: `${ocrAvg}%`, t: "bad" as Tone };
  }, [ocrAvg]);

  const fps = useMemo(() => {
    if (wsStatus !== "open") return { v: "—", t: "neutral" as Tone };
    const n = Math.round(eventsPerSec);
    if (n >= 15) return { v: String(n), t: "good" as Tone };
    if (n >= 5) return { v: String(n), t: "warn" as Tone };
    return { v: String(n), t: "bad" as Tone };
  }, [eventsPerSec, wsStatus]);

  const lat = useMemo(() => {
    if (lastAgeMs == null) return { v: "—", t: "neutral" as Tone };
    if (lastAgeMs < 800) return { v: `${lastAgeMs}ms`, t: "good" as Tone };
    if (lastAgeMs < 4000) return { v: `${lastAgeMs}ms`, t: "warn" as Tone };
    return { v: `${lastAgeMs}ms`, t: "bad" as Tone };
  }, [lastAgeMs]);

  const bat = useMemo(() => {
    if (batteryPercent == null) return { v: "—", t: "neutral" as Tone };
    if (batteryPercent > 50) return { v: `${batteryPercent}%`, t: "good" as Tone };
    if (batteryPercent >= 20) return { v: `${batteryPercent}%`, t: "warn" as Tone };
    return { v: `${batteryPercent}%`, t: "bad" as Tone };
  }, [batteryPercent]);

  const net = useMemo(() => {
    if (wsStatus === "error" || hasWsError) return { v: "ERR", t: "bad" as Tone };
    if (wsStatus === "closed") return { v: "OFF", t: "neutral" as Tone };
    if (wsStatus === "connecting") return { v: "SYN", t: "warn" as Tone };
    if (reconnectCount > 0) return { v: "REC", t: "warn" as Tone };
    return { v: "OK", t: "good" as Tone };
  }, [hasWsError, reconnectCount, wsStatus]);

  const iconMuted = colors.sub;

  return (
    <View style={styles.aiPanelWrap}>
      <Text style={styles.aiPanelHdr}>AI SYS</Text>
      <View style={styles.aiGrid2x3}>
        <View style={styles.aiGridRow}>
          <MiniCard icon="radar" label="YOLO" value={yolo.v} tone={yolo.t} iconColor={iconMuted} />
          <MiniCard icon="scan-helper" label="OCR" value={ocr.v} tone={ocr.t} iconColor={iconMuted} />
        </View>
        <View style={styles.aiGridRow}>
          <MiniCard icon="speedometer" label="FPS" value={fps.v} tone={fps.t} iconColor={iconMuted} />
          <MiniCard icon="timer-outline" label="LAT" value={lat.v} tone={lat.t} iconColor={iconMuted} />
        </View>
        <View style={styles.aiGridRow}>
          <MiniCard icon="battery" label="BAT" value={bat.v} tone={bat.t} iconColor={iconMuted} />
          <MiniCard icon="wifi" label="NET" value={net.v} tone={net.t} iconColor={iconMuted} />
        </View>
      </View>
    </View>
  );
}
