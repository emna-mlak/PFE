import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

type Props = {
  uri: string;
};

function escapeAttr(url: string): string {
  return url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function CameraStreamView({ uri }: Props) {
  const html = useMemo(() => {
    if (!uri || !/^https?:\/\//i.test(uri)) return "";
    const safe = escapeAttr(uri);
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/></head>
<body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;">
<img src="${safe}" style="max-width:100%;max-height:100vh;object-fit:contain;display:block;" alt="" />
</body></html>`;
  }, [uri]);

  if (!html) {
    return <View style={styles.fallback} />;
  }

  return (
    <WebView
      source={{ html }}
      style={styles.web}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      androidLayerType="hardware"
      originWhitelist={["*"]}
      setSupportMultipleWindows={false}
    />
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: "#000000" },
  fallback: { flex: 1, backgroundColor: "#000000" },
});
