import { Audio } from "expo-av";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { Text } from "react-native";

import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Screen } from "../../components/ui/Screen";
import { sendLiveCaptureFramePlaceholder } from "../../services/detection/pythonDetection";

export function LiveCaptureScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasMic, setHasMic] = useState(false);
  const [running, setRunning] = useState(false);

  const askMic = async () => {
    const result = await Audio.requestPermissionsAsync();
    setHasMic(result.granted);
  };

  const startSession = async () => {
    setRunning(true);
    await sendLiveCaptureFramePlaceholder({
      sessionId: `sess-${Date.now()}`,
      note: "Hook OCR placeholder",
    });
  };

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Capture en direct</Text>
      {!cameraPermission?.granted ? (
        <Button label="Autoriser la camera" onPress={requestCameraPermission} />
      ) : (
        <CameraView style={{ height: 260, borderRadius: 12 }} />
      )}
      {!hasMic && <Button label="Autoriser le microphone" onPress={askMic} />}
      <Badge label={running ? "Session en cours" : "Session arretee"} />
      <Button label="Demarrer session" onPress={startSession} />
      <Button label="Arreter session" onPress={() => setRunning(false)} />
    </Screen>
  );
}
