import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Vibration } from "react-native";

import { AlertEngine } from "./alertEngine";
import type { AlertTier } from "./alertEngine";
import type { AlertViewModel, InfoAlertModel, VehicleBackendResult, WarningBannerModel } from "../../types/vehicle";

type UseAlertControllerOptions = {
  cooldownMs?: number;
  hideAfterMs?: number;
  onSpeak?: (text: string) => Promise<void> | void;
  enableHaptics?: boolean;
};

const CRITICAL_INITIAL: AlertViewModel = {
  visible: false,
  title: "VEHICULE RECHERCHE",
  plate: "",
  severity: "critical",
};

const WARNING_INITIAL: WarningBannerModel = {
  visible: false,
  title: "",
  plate: "",
};

const INFO_INITIAL: InfoAlertModel = {
  visible: false,
  message: "",
};

function vibrateForTier(tier: AlertTier, enable: boolean) {
  if (!enable) return;
  if (tier === "critical") {
    Vibration.vibrate([0, 220, 100, 220, 100, 380]);
    return;
  }
  if (tier === "warning") {
    Vibration.vibrate([0, 160, 90, 160]);
    return;
  }
  Vibration.vibrate([0, 28, 24, 28]);
}

export function useAlertController(options: UseAlertControllerOptions = {}) {
  const enableHaptics = options.enableHaptics ?? true;
  const onSpeak = options.onSpeak;

  const engine = useMemo(
    () =>
      new AlertEngine({
        cooldownMs: options.cooldownMs,
        hideAfterMs: options.hideAfterMs,
      }),
    [options.cooldownMs, options.hideAfterMs]
  );

  const [criticalAlert, setCriticalAlert] = useState<AlertViewModel>(CRITICAL_INITIAL);
  const [warningBanner, setWarningBanner] = useState<WarningBannerModel>(WARNING_INITIAL);
  const [infoAlert, setInfoAlert] = useState<InfoAlertModel>(INFO_INITIAL);

  const criticalVisibleRef = useRef(false);
  useEffect(() => {
    criticalVisibleRef.current = criticalAlert.visible;
  }, [criticalAlert.visible]);

  const timersRef = useRef<{
    critical: ReturnType<typeof setTimeout> | null;
    warning: ReturnType<typeof setTimeout> | null;
    info: ReturnType<typeof setTimeout> | null;
  }>({ critical: null, warning: null, info: null });

  const clearTimer = useCallback((which: keyof typeof timersRef.current) => {
    const t = timersRef.current[which];
    if (t) clearTimeout(t);
    timersRef.current[which] = null;
  }, []);

  const hideCritical = useCallback(() => {
    clearTimer("critical");
    setCriticalAlert((p) => ({ ...p, visible: false }));
  }, [clearTimer]);

  const hideWarning = useCallback(() => {
    clearTimer("warning");
    setWarningBanner(WARNING_INITIAL);
  }, [clearTimer]);

  const hideInfo = useCallback(() => {
    clearTimer("info");
    setInfoAlert(INFO_INITIAL);
  }, [clearTimer]);

  const onVehicleResult = useCallback(
    async (payload: VehicleBackendResult) => {
      const trigger = engine.peek(payload);
      if (!trigger) return false;

      if (trigger.tier === "warning" && criticalVisibleRef.current) {
        engine.commit(trigger.plateKey, "warning");
        return false;
      }

      engine.commit(trigger.plateKey, trigger.tier);

      if (trigger.tier === "critical") {
        clearTimer("warning");
        setWarningBanner(WARNING_INITIAL);
        clearTimer("critical");
        setCriticalAlert({
          visible: true,
          title: trigger.title,
          plate: trigger.plate,
          severity: "critical",
        });
        timersRef.current.critical = setTimeout(hideCritical, trigger.hideAfterMs);
        vibrateForTier("critical", enableHaptics);
        if (onSpeak && trigger.ttsText) await onSpeak(trigger.ttsText);
        return true;
      }

      if (trigger.tier === "warning") {
        clearTimer("warning");
        setWarningBanner({
          visible: true,
          title: trigger.title,
          plate: trigger.plate,
        });
        timersRef.current.warning = setTimeout(hideWarning, trigger.hideAfterMs);
        vibrateForTier("warning", enableHaptics);
        if (onSpeak && trigger.ttsText) await onSpeak(trigger.ttsText);
        return true;
      }

      clearTimer("info");
      setInfoAlert({
        visible: true,
        message: trigger.message ?? "",
      });
      timersRef.current.info = setTimeout(hideInfo, trigger.hideAfterMs);
      vibrateForTier("info", enableHaptics);
      return true;
    },
    [clearTimer, enableHaptics, engine, hideCritical, hideInfo, hideWarning, onSpeak]
  );

  useEffect(
    () => () => {
      clearTimer("critical");
      clearTimer("warning");
      clearTimer("info");
    },
    [clearTimer]
  );

  return {
    criticalAlert,
    warningBanner,
    infoAlert,
    hideCritical,
    hideWarning,
    hideInfo,
    onVehicleResult,
  };
}
