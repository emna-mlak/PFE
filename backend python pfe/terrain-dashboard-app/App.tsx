import React, { useMemo } from "react";
import { Platform, View, type ViewStyle } from "react-native";

import { resolveAlertsWsUrl } from "./src/config/alertsWsUrl";
import { resolveCameraStreamUrl } from "./src/config/cameraStreamUrl";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { ThemeProvider } from "./src/theme/ThemeContext";

export default function App() {
  /* URL WebSocket unique pour toute la session (env / plateforme). */
  const wsUrl = useMemo(() => resolveAlertsWsUrl(), []);
  const cameraUrl = useMemo(() => resolveCameraStreamUrl(), []);

  if (__DEV__) {
    const src = process.env.EXPO_PUBLIC_WS_URL
      ? "EXPO_PUBLIC_WS_URL"
      : process.env.EXPO_PUBLIC_BACKEND_HOST
        ? "EXPO_PUBLIC_BACKEND_HOST"
        : Platform.OS === "web"
          ? "web hostname / localhost"
          : "debugger/bundle";
    console.warn(`[terrain] WebSocket URL (${Platform.OS}):`, wsUrl, `(${src})`);
    if (cameraUrl) console.warn(`[terrain] Camera stream URL (${Platform.OS}):`, cameraUrl);
  }

  /* ThemeProvider doit envelopper l’écran : useTheme() et AsyncStorage vivent ici. */
  return (
    <ThemeProvider>
      <View style={[{ flex: 1 }, Platform.OS === "web" ? ({ height: "100%" } as ViewStyle) : null]}>
        <DashboardScreen wsUrl={wsUrl} />
      </View>
    </ThemeProvider>
  );
}
