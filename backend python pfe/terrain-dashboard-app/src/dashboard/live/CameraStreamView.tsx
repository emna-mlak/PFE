import { Platform } from "react-native";

import { CameraStreamView as CameraStreamViewNative } from "./CameraStreamView.native";
import { CameraStreamView as CameraStreamViewWeb } from "./CameraStreamView.web";

export const CameraStreamView = Platform.OS === "web" ? CameraStreamViewWeb : CameraStreamViewNative;
