import React, { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";

import type { WarningBannerModel } from "../../types/vehicle";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  model: WarningBannerModel;
  onDismiss: () => void;
};

/** Alerte WARNING — bandeau haut, orange pulsé, tap pour masquer. */
export function WarningAlertBanner({ model, onDismiss }: Props) {
  const styles = useMissionControlStyles();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!model.visible) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.82, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [model.visible, pulse]);

  if (!model.visible) return null;

  return (
    <Pressable onPress={onDismiss} accessibilityRole="summary">
      <Animated.View style={[styles.warningBanner, { opacity: pulse }]}>
        <Text style={styles.warningBannerTitle}>{model.title}</Text>
        <Text style={styles.warningBannerPlate} numberOfLines={1}>
          {model.plate}
        </Text>
        <Text style={styles.warningBannerHint}>Toucher pour masquer</Text>
      </Animated.View>
    </Pressable>
  );
}
