import { useState } from "react";

export const useLiveCaptureSession = () => {
  const [isRunning, setIsRunning] = useState(false);
  return {
    isRunning,
    start: () => setIsRunning(true),
    stop: () => setIsRunning(false),
  };
};
