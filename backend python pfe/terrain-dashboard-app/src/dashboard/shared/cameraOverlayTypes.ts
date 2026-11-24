/** Boîtes YOLO / détection en coordonnées normalisées 0–1 (origine haut-gauche). */
export type CameraDetectionBox = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
  label?: string;
};

export const DEFAULT_CAMERA_CONFIDENCE_THRESHOLD = 0.55;
