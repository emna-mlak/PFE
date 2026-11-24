import React, { useMemo } from "react";
import { Text, View } from "react-native";

import type { RealtimeStatus } from "../../screens/dashboard/types";
import type { SystemHealth } from "../shared/systemHealth";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  wsStatus: RealtimeStatus;
  hasWsError: boolean;
  totalEvents: number;
  gpsStatus: string;
  systemHealth: SystemHealth;
};

type SegTone = "good" | "warn" | "bad" | "neutral";

const SEG_COLOR: Record<SegTone, string> = {
  good: "#34D399",
  warn: "#FB923C",
  bad: "#F87171",
  neutral: "#94A3B8",
};

function wsSegment(status: RealtimeStatus, hasWsError: boolean): { text: string; tone: SegTone } {
  if (status === "error" || hasWsError) return { text: "WS ERR", tone: "bad" };
  if (status === "open") return { text: "WS ONLINE", tone: "good" };
  if (status === "connecting") return { text: "WS SYNC", tone: "warn" };
  return { text: "WS OFF", tone: "neutral" };
}

function gpsSegment(gps: string): { text: string; tone: SegTone } {
  const u = gps.toUpperCase();
  if (u.includes("NO") && u.includes("FIX")) return { text: "GPS NO FIX", tone: "bad" };
  if (u.includes("LOCK") || u.includes("3D") || u.includes("2D") || (u.includes("FIX") && !u.includes("NO"))) {
    return { text: "GPS LOCK", tone: "good" };
  }
  if (u.includes("OK")) return { text: "GPS OK", tone: "good" };
  const t = gps.trim();
  if (!t || t === "—") return { text: "GPS —", tone: "neutral" };
  return { text: t.length > 14 ? "GPS …" : `GPS ${t}`, tone: "warn" };
}

function piSegment(health: SystemHealth): { text: string; tone: SegTone } {
  if (health === "OK") return { text: "PI5 OK", tone: "good" };
  if (health === "WARN") return { text: "PI5 WARN", tone: "warn" };
  return { text: "PI5 FAIL", tone: "bad" };
}

function Seg({ text, tone }: { text: string; tone: SegTone }) {
  return <Text style={{ color: SEG_COLOR[tone] }}>{text}</Text>;
}

/** Ligne status unique : WS ONLINE · 24 EVT · GPS LOCK · PI5 OK */
export function TacticalStatusLine({ wsStatus, hasWsError, totalEvents, gpsStatus, systemHealth }: Props) {
  const styles = useMissionControlStyles();
  const segments = useMemo(() => {
    const ws = wsSegment(wsStatus, hasWsError);
    const gps = gpsSegment(gpsStatus);
    const pi = piSegment(systemHealth);
    const evt: { text: string; tone: SegTone } = {
      text: `${totalEvents} EVT`,
      tone: totalEvents > 0 ? "neutral" : "neutral",
    };
    return [ws, evt, gps, pi];
  }, [gpsStatus, hasWsError, systemHealth, totalEvents, wsStatus]);

  return (
    <View style={styles.tacticalStatusLineWrap}>
      <Text style={styles.tacticalStatusLine} numberOfLines={1} ellipsizeMode="tail">
        {segments.map((s, i) => (
          <React.Fragment key={s.text}>
            {i > 0 ? <Text style={styles.tacticalStatusSep}> · </Text> : null}
            <Seg text={s.text} tone={s.tone} />
          </React.Fragment>
        ))}
      </Text>
    </View>
  );
}
