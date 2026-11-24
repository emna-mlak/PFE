import { Audio } from "expo-av";
import { useCallback, useMemo, useRef, useState } from "react";

import { uploadVoiceCommand, VoiceCommandResponse } from "../services/voiceCommand";

type VoiceStage = "idle" | "recording" | "uploading" | "done" | "error";

type UseVoiceCommandResult = {
  stage: VoiceStage;
  isRecording: boolean;
  isUploading: boolean;
  canRetry: boolean;
  error: string | null;
  result: VoiceCommandResponse | null;
  recordingSeconds: number;
  startRecording: () => Promise<void>;
  stopAndAnalyze: () => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void;
};

const MIN_DURATION_MS = 8000;
const MAX_DURATION_MS = 11000;

function getRecordingOptions(): Audio.RecordingOptions {
  return {
    isMeteringEnabled: false,
    android: {
      extension: ".m4a",
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    ios: {
      extension: ".m4a",
      outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
      audioQuality: Audio.IOSAudioQuality.HIGH,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    web: {
      mimeType: "audio/webm",
      bitsPerSecond: 128000,
    },
  };
}

export function useVoiceCommand(): UseVoiceCommandResult {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const tickerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const retryUriRef = useRef<string | null>(null);

  const [stage, setStage] = useState<VoiceStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceCommandResponse | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const cleanupTimers = useCallback(() => {
    if (stopTimerRef.current) globalThis.clearTimeout(stopTimerRef.current);
    if (tickerRef.current) globalThis.clearInterval(tickerRef.current);
    stopTimerRef.current = null;
    tickerRef.current = null;
  }, []);

  const performUpload = useCallback(async (uri: string) => {
    setStage("uploading");
    setError(null);
    const payload = await uploadVoiceCommand(uri);
    retryUriRef.current = uri;
    setResult(payload);
    setStage("done");
  }, []);

  const startRecording = useCallback(async () => {
    if (stage === "recording" || stage === "uploading") return;
    setError(null);
    setResult(null);
    setRecordingSeconds(0);

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      setError("Permission microphone refusée.");
      setStage("error");
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });

    const created = await Audio.Recording.createAsync(getRecordingOptions());
    recordingRef.current = created.recording;
    startedAtRef.current = Date.now();
    setStage("recording");

    tickerRef.current = globalThis.setInterval(() => {
      const started = startedAtRef.current;
      if (!started) return;
      setRecordingSeconds(Math.floor((Date.now() - started) / 1000));
    }, 200);

    stopTimerRef.current = globalThis.setTimeout(() => {
      void stopAndAnalyze();
    }, MAX_DURATION_MS);
  }, [stage]);

  const stopAndAnalyze = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording || stage === "uploading") return;

    cleanupTimers();
    recordingRef.current = null;

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recording.getURI();
      if (!uri) {
        throw new Error("Enregistrement introuvable. Réessayez.");
      }

      const duration = Date.now() - (startedAtRef.current ?? Date.now());
      if (duration < MIN_DURATION_MS) {
        throw new Error("Enregistrement trop court. Parlez entre 8 et 11 secondes.");
      }

      await performUpload(uri);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur durant l'analyse vocale.";
      setError(message);
      setStage("error");
    } finally {
      startedAtRef.current = null;
    }
  }, [cleanupTimers, performUpload, stage]);

  const retry = useCallback(async () => {
    if (!retryUriRef.current || stage === "uploading") return;
    try {
      await performUpload(retryUriRef.current);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Échec du réessai.";
      setError(message);
      setStage("error");
    }
  }, [performUpload, stage]);

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
    setStage("idle");
    setRecordingSeconds(0);
  }, []);

  const canRetry = useMemo(() => retryUriRef.current != null, [stage, error, result]);

  return {
    stage,
    isRecording: stage === "recording",
    isUploading: stage === "uploading",
    canRetry,
    error,
    result,
    recordingSeconds,
    startRecording,
    stopAndAnalyze,
    retry,
    reset,
  };
}
