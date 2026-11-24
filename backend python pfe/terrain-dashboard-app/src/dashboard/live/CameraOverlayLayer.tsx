import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { CameraDetectionBox } from "../shared/cameraOverlayTypes";
import { DEFAULT_CAMERA_CONFIDENCE_THRESHOLD } from "../shared/cameraOverlayTypes";

type Props = {
  boxes: CameraDetectionBox[];
  confidenceThreshold?: number;
};

export function CameraOverlayLayer({
  boxes,
  confidenceThreshold = DEFAULT_CAMERA_CONFIDENCE_THRESHOLD,
}: Props) {
  return (
    <View style={styles.wrap} pointerEvents="none">
      {boxes.map((b) => {
        const showConf = b.confidence != null && b.confidence >= confidenceThreshold;
        const pct =
          b.confidence != null
            ? Math.round(b.confidence * (b.confidence <= 1 ? 100 : 1))
            : null;
        return (
          <View
            key={b.id}
            style={[
              styles.box,
              {
                left: `${b.x * 100}%`,
                top: `${b.y * 100}%`,
                width: `${b.w * 100}%`,
                height: `${b.h * 100}%`,
              },
            ]}
          >
            {showConf && pct != null ? (
              <Text style={styles.conf}>{pct}%</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
  },
  box: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(74, 222, 128, 0.95)",
    backgroundColor: "transparent",
  },
  conf: {
    position: "absolute",
    top: 1,
    left: 1,
    fontSize: 8,
    fontWeight: "800",
    color: "#F8FAFC",
    backgroundColor: "rgba(0,0,0,0.42)",
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
    overflow: "hidden",
  },
});
