import type { OperatorPosition } from "../shared/mapTypes";
import type { PlateReading } from "../../screens/dashboard/types";

export type MissionMapCardProps = {
  readings: PlateReading[];
  operatorPosition: OperatorPosition | null;
  /** Hauteur max = fraction de la fenêtre (défaut 0.4 = 40 %). */
  maxHeightFraction?: number;
};
