import React, { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";

import type { RealtimeStatus } from "../../screens/dashboard/types";
import type { InfoAlertModel } from "../../types/vehicle";
import type { SystemHealth } from "../shared/systemHealth";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  status: RealtimeStatus;
  systemHealth: SystemHealth;
  alertOpenCount: number;
  clockText: string;
  eventsPerSec: number;
  onSetLight: () => void;
  onSetDark: () => void;
  infoAlert: InfoAlertModel;
  onDismissInfo: () => void;
  onTestTts?: () => void;
};

export function TopStatusStrip({
  status,
  systemHealth,
  alertOpenCount,
  clockText,
  eventsPerSec,
  onSetLight,
  onSetDark,
  infoAlert,
  onDismissInfo,
  onTestTts,
}: Props) {
  const styles = useMissionControlStyles();
  const pulse = useRef(new Animated.Value(1)).current;
  const infoPulse = useRef(new Animated.Value(1)).current;
  const live = status === "open";

  useEffect(() => {
    if (!live) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [live, pulse]);

  useEffect(() => {
    if (!infoAlert.visible) {
      infoPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(infoPulse, { toValue: 0.72, duration: 650, useNativeDriver: true }),
        Animated.timing(infoPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [infoAlert.visible, infoPulse]);

  const wsLabel =
    status === "open" ? "ONLINE" : status === "connecting" ? "SYNC" : status === "error" ? "ERR" : "OFF";

  const healthStyle =
    systemHealth === "OK" ? styles.healthOk : systemHealth === "WARN" ? styles.healthWarn : styles.healthFail;

  return (
    <View style={styles.statusStrip}>
      <View style={styles.statusStripRow}>
        <View style={styles.topLeft}>
          <Animated.View style={[styles.liveDot, !live && styles.liveDotOff, { opacity: live ? pulse : 1 }]} />
          <Text style={styles.topLabel}>WS {wsLabel}</Text>
          <View style={[styles.healthPill, healthStyle]}>
            <Text style={styles.healthPillText}>SYS {systemHealth}</Text>
          </View>
          <View style={[styles.alertBadge, alertOpenCount === 0 && styles.alertBadgeZero]}>
            <Text style={[styles.alertBadgeText, alertOpenCount === 0 && styles.alertBadgeTextZero]}>
              ALRT {alertOpenCount}
            </Text>
          </View>
          {infoAlert.visible ? (
            <Pressable onPress={onDismissInfo} hitSlop={6}>
              <Animated.View style={[styles.infoAlertChip, { opacity: infoPulse }]}>
                <Text style={styles.infoAlertChipText} numberOfLines={1}>
                  {infoAlert.message}
                </Text>
              </Animated.View>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.topMono}>{clockText}</Text>
        <View style={styles.topRight}>
          <Text style={styles.topMono}>{eventsPerSec}/s</Text>
          <Pressable onPress={onSetLight} style={styles.themeMini}>
            <Text style={styles.themeMiniText}>C</Text>
          </Pressable>
          <Pressable onPress={onSetDark} style={styles.themeMini}>
            <Text style={styles.themeMiniText}>S</Text>
          </Pressable>
          {onTestTts ? (
            <Pressable onPress={onTestTts} style={styles.themeMini} accessibilityLabel="Tester la synthèse vocale">
              <Text style={styles.themeMiniText}>TTS</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
