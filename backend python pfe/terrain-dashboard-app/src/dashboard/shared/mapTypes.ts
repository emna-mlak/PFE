/** Pin carte (plaque / cluster). */
export type MapPinInput = {
  id: string;
  latitude: number;
  longitude: number;
  critical: boolean;
};

/** Après regroupement léger (pseudo-clustering sans lib lourde). */
export type MapCluster = {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  critical: boolean;
};

export type OperatorPosition = {
  latitude: number;
  longitude: number;
};
