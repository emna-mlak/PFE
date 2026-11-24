import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Pressable, SafeAreaView, Text, View, useWindowDimensions } from "react-native";

import type { RealtimeStatus } from "../../screens/dashboard/types";
import { CameraOverlayLayer } from "./CameraOverlayLayer";
import { CameraStreamView } from "./CameraStreamView";
import type { CameraDetectionBox } from "../shared/cameraOverlayTypes";
import { DEFAULT_CAMERA_CONFIDENCE_THRESHOLD } from "../shared/cameraOverlayTypes";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  status: RealtimeStatus;
  streamUrl?: string | null;
  fps: number;
  boxes: CameraDetectionBox[];
  confidenceThreshold?: number;
  /** Remplit le parent (bande LIVE tactique) sans plafond 48 % fenêtre. */
  dominant?: boolean;
};

const COMPACT_HEIGHT_FRAC = 0.48;

function CameraPlaceholder({ live }: { live: boolean }) {
  const styles = useMissionControlStyles();
  return (
    <View style={styles.embedCameraPlaceholder}>
      <Text style={[styles.embedCameraPlaceholderHint, live && styles.embedCameraPlaceholderLive]}>
        {live ? "● LIVE" : "—"}
      </Text>
      <Text style={styles.embedCameraPlaceholderSub}>Caméra</Text>
    </View>
  );
}

function CameraStage({
  streamUrl,
  live,
  boxes,
  confidenceThreshold,
  fps,
  toolbar,
  onToolbarPress,
}: {
  streamUrl?: string | null;
  live: boolean;
  boxes: CameraDetectionBox[];
  confidenceThreshold: number;
  fps: number;
  toolbar: "expand" | "exit";
  onToolbarPress: () => void;
}) {
  const styles = useMissionControlStyles();
  const showFps = live;
  const uri = streamUrl?.trim() || "";

  return (
    <View style={styles.embedCameraStage}>
      {uri ? <CameraStreamView uri={uri} /> : <CameraPlaceholder live={live} />}
      <CameraOverlayLayer boxes={boxes} confidenceThreshold={confidenceThreshold} />
      <View style={styles.embedCameraToolbar} pointerEvents="box-none">
        <Pressable
          onPress={onToolbarPress}
          style={styles.embedCameraIconBtn}
          hitSlop={14}
          accessibilityLabel={toolbar === "expand" ? "Plein écran" : "Quitter plein écran"}
        >
          <MaterialCommunityIcons
            name={toolbar === "expand" ? "fullscreen" : "fullscreen-exit"}
            size={toolbar === "expand" ? 18 : 20}
            color="#F8FAFC"
          />
        </Pressable>
        {showFps ? (
          <Text style={styles.embedCameraFps}>{Math.max(0, Math.round(fps))}</Text>
        ) : (
          <View style={{ minWidth: 28 }} />
        )}
      </View>
    </View>
  );
}

export function EmbeddedCameraPanel({
  status,
  streamUrl,
  fps,
  boxes,
  confidenceThreshold = DEFAULT_CAMERA_CONFIDENCE_THRESHOLD,
  dominant = false,
}: Props) {
  const styles = useMissionControlStyles();
  const [fullscreen, setFullscreen] = useState(false);
  const live = status === "open";
  const { height: windowHeight } = useWindowDimensions();
  /* Au 1er rendu web, la hauteur peut être 0 : un maxHeight figé rendait la zone caméra invisible. */
  const compactMaxH = Math.max(280, Math.round(windowHeight * COMPACT_HEIGHT_FRAC));
  const shellStyle = dominant
    ? [styles.embedCameraShell, styles.embedCameraShellDominant, live && styles.embedCameraShellLive]
    : [styles.embedCameraShell, live && styles.embedCameraShellLive, { maxHeight: compactMaxH }];

  return (
    <>
      <View style={shellStyle}>
        <View style={styles.embedCameraInner}>
          {!fullscreen ? (
            <CameraStage
              streamUrl={streamUrl}
              live={live}
              boxes={boxes}
              confidenceThreshold={confidenceThreshold}
              fps={fps}
              toolbar="expand"
              onToolbarPress={() => setFullscreen(true)}
            />
          ) : (
            <View style={styles.embedCameraFullscreenHint}>
              <Text style={styles.embedCameraFullscreenHintText}>Plein écran actif</Text>
            </View>
          )}
        </View>
      </View>

      <Modal
        visible={fullscreen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setFullscreen(false)}
      >
        <SafeAreaView style={styles.embedCameraModalRoot}>
          <View style={styles.embedCameraModalBody}>
            <CameraStage
              streamUrl={streamUrl}
              live={live}
              boxes={boxes}
              confidenceThreshold={confidenceThreshold}
              fps={fps}
              toolbar="exit"
              onToolbarPress={() => setFullscreen(false)}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
