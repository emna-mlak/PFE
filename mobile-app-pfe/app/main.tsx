import { Stack } from "expo-router";

import { MainScreen } from "../src/features/auth/MainScreen";

export default function MainRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <MainScreen />
    </>
  );
}
