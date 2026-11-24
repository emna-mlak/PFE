export type VehicleBackendResult = {
  vehicleStatus?: string;
  statutVehicule?: string;
  vehiculeRecherche?: boolean;
  secondaryText?: string;
  matricule?: string;
  /** Message court niveau INFO (bannière discrète), optionnel. */
  terrainInfo?: string;
  infoBanner?: string;
  uiInfo?: string;
  [key: string]: unknown;
};

export type AlertViewModel = {
  visible: boolean;
  title: string;
  plate: string;
  severity?: "danger" | "critical";
};

export type WarningBannerModel = {
  visible: boolean;
  title: string;
  plate: string;
};

export type InfoAlertModel = {
  visible: boolean;
  message: string;
};
