import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { PlateReading } from "../../screens/dashboard/types";
import { useMissionControlStyles } from "../shared/styles";

const REPLAY_WINDOW = 14;
const REPLAY_STEP_MS = 1_100;

type Props = {
  readings: PlateReading[];
};

function formatGps(r: PlateReading): string {
  const la = r.latitude;
  const lo = r.longitude;
  if (typeof la === "number" && typeof lo === "number" && Number.isFinite(la) && Number.isFinite(lo)) {
    return `${la.toFixed(5)}, ${lo.toFixed(5)}`;
  }
  return "—";
}

function formatTs(ts: number): string {
  try {
    return new Date(ts).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * Replay léger 7" : dernière preuve (idle), lecture pas-à-pas des événements récents (sans timeline).
 */
export function ReplaySnapshotPanel({ readings }: Props) {
  const styles = useMissionControlStyles();
  const chainAsc = useMemo(() => {
    const slice = readings.slice(0, REPLAY_WINDOW);
    return [...slice].sort((a, b) => a.ts - b.ts);
  }, [readings]);

  const latest = chainAsc.length ? chainAsc[chainAsc.length - 1] : null;
  const [playing, setPlaying] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!playing || chainAsc.length < 2) return;
    const id = setInterval(() => {
      setStepIdx((i) => {
        if (i >= chainAsc.length - 1) {
          setPlaying(false);
          return chainAsc.length - 1;
        }
        return i + 1;
      });
    }, REPLAY_STEP_MS);
    return () => clearInterval(id);
  }, [playing, chainAsc.length]);

  const safeIdx = Math.min(stepIdx, Math.max(0, chainAsc.length - 1));
  const shown = playing ? chainAsc[safeIdx] ?? null : latest;
  const canReplay = chainAsc.length >= 2;

  const onReplay = useCallback(() => {
    if (!canReplay) return;
    setStepIdx(0);
    setPlaying(true);
  }, [canReplay]);

  const onStop = useCallback(() => {
    setPlaying(false);
    setStepIdx(0);
  }, []);

  if (!shown) {
    return (
      <View style={styles.replayRoot}>
        <Text style={styles.replayEmpty}>Aucun événement à rejouer</Text>
        <Pressable
          style={[styles.replayBtn, styles.replayBtnDisabled]}
          disabled
          accessibilityRole="button"
          accessibilityLabel="Replay"
        >
          <Text style={styles.replayBtnText}>REPLAY</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.replayRoot}>
      <Text style={styles.replayHdr}>EVIDENCE</Text>

      <View style={styles.replaySnapCard}>
        <Text style={styles.replayPlate} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
          {shown.plate}
        </Text>
        <Text style={styles.replayStatus} numberOfLines={2}>
          {shown.status}
        </Text>
        {typeof shown.confidence === "number" ? (
          <Text style={styles.replayConf}>OCR {Math.round(shown.confidence)}%</Text>
        ) : null}
        <View style={styles.replayDivider} />
        <Text style={styles.replayGpsLbl}>GPS</Text>
        <Text style={styles.replayGpsVal} selectable numberOfLines={2}>
          {formatGps(shown)}
        </Text>
        <Text style={styles.replayTimeLbl}>HORODATAGE</Text>
        <Text style={styles.replayTimeVal}>{formatTs(shown.ts)}</Text>
      </View>

      {playing ? (
        <Text style={styles.replayIndex}>
          {safeIdx + 1}/{chainAsc.length}
        </Text>
      ) : null}

      <View style={styles.replayBtnRow}>
        {playing ? (
          <Pressable
            onPress={onStop}
            style={({ pressed }) => [styles.replayBtn, styles.replayBtnStop, pressed && styles.replayBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Arrêter le replay"
          >
            <Text style={styles.replayBtnText}>STOP</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onReplay}
            style={({ pressed }) => [
              styles.replayBtn,
              styles.replayBtnPlay,
              !canReplay && styles.replayBtnDisabled,
              pressed && canReplay && styles.replayBtnPressed,
            ]}
            disabled={!canReplay}
            accessibilityRole="button"
            accessibilityLabel="Lancer le replay des derniers événements"
          >
            <Text style={[styles.replayBtnText, !canReplay && styles.replayBtnTextDisabled]}>REPLAY</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
