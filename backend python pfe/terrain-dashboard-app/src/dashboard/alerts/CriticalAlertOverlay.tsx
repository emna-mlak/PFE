import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import type { AlertViewModel } from "../../types/vehicle";
import { useTheme } from "../../theme/ThemeContext";

type Props = {
  alert: AlertViewModel;
  onDismiss: () => void;
};

/**
 * Alerte CRITICAL plein écran — priorité absolue, flash rouge léger, tap pour fermer avant timeout.
 */
export function CriticalAlertOverlay({ alert, onDismiss }: Props) {
  const { colors } = useTheme();
  const flash = useRef(new Animated.Value(0.55)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!alert.visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flash, { toValue: 0.88, duration: 380, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0.42, duration: 380, useNativeDriver: true }),
      ])
    );
    loop.start();
    const cardPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.94, duration: 520, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 520, useNativeDriver: true }),
      ])
    );
    cardPulse.start();
    return () => {
      loop.stop();
      cardPulse.stop();
    };
  }, [alert.visible, flash, pulse]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          ...StyleSheet.absoluteFillObject,
          zIndex: 10000,
          elevation: 120,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 12,
        },
        veil: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: "#B91C1C",
        },
        card: {
          maxWidth: 520,
          width: "100%",
          borderRadius: 14,
          borderWidth: 2,
          borderColor: "rgba(255,255,255,0.35)",
          backgroundColor: "rgba(0,0,0,0.72)",
          paddingVertical: 22,
          paddingHorizontal: 18,
          alignItems: "center",
        },
        title: {
          color: colors.vignetteOverlayTitle,
          fontSize: 28,
          fontWeight: "900",
          textAlign: "center",
          letterSpacing: 0.5,
        },
        plate: {
          color: colors.vignetteOverlayPlate,
          fontSize: 40,
          fontWeight: "800",
          textAlign: "center",
          marginTop: 10,
          fontVariant: ["tabular-nums"] as const,
        },
        hint: {
          marginTop: 14,
          color: "rgba(255,255,255,0.55)",
          fontSize: 11,
          fontWeight: "700",
        },
      }),
    [colors]
  );

  if (!alert.visible) return null;

  return (
    <Pressable style={styles.root} onPress={onDismiss} accessibilityRole="alert">
      <Animated.View style={[styles.veil, { opacity: flash }]} pointerEvents="none" />
      <Animated.View style={[styles.card, { opacity: pulse }]}>
        <MaterialCommunityIcons name="alert-octagon" size={36} color="#FECACA" />
        <Text style={styles.title}>{alert.title}</Text>
        <Text style={styles.plate}>{alert.plate}</Text>
        <Text style={styles.hint}>Toucher pour masquer</Text>
      </Animated.View>
    </Pressable>
  );
}
