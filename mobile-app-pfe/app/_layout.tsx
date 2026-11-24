import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { Text, View } from "react-native";
import Toast from "react-native-toast-message";

import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { APP_BUILD_LABEL, APP_DISPLAY_NAME } from "../src/config/appBranding";
import { env } from "../src/config/env";
import { queryClient } from "../src/lib/queryClient";

if (__DEV__) {
  console.log(`[${APP_DISPLAY_NAME}] Bundle chargé — ${APP_BUILD_LABEL}`);
}

const convexClient = env.convexUrl ? new ConvexReactClient(env.convexUrl) : null;

export default function RootLayout() {
  if (!convexClient) {
    return (
      <ErrorBoundary>
        <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#F8FAFC" }}>
          <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12, color: "#101828" }}>
            Application non configurée
          </Text>
          <Text style={{ fontSize: 15, color: "#475467", lineHeight: 22 }}>
            L&apos;application ne peut pas démarrer : l&apos;adresse du serveur de données est manquante.
            Vérifiez le fichier <Text style={{ fontWeight: "600" }}>.env</Text> à la racine du projet, puis
            relancez l&apos;app avec{" "}
            <Text style={{ fontWeight: "600" }}>npm run start -- --clear</Text>.
          </Text>
        </View>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ConvexProvider client={convexClient}>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerTitleAlign: "center" }} />
          <Toast />
        </QueryClientProvider>
      </ConvexProvider>
    </ErrorBoundary>
  );
}
