import React, { useCallback, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

type Props = {
  uri: string;
};

function isLikelyMjpegStream(uri: string): boolean {
  const u = uri.toLowerCase();
  return u.includes("mjpeg") || u.includes("/camera/mjpeg");
}

/**
 * MJPEG : `<iframe>` en principal (Chrome + RN Web gèrent mal le multipart avec `<img>`).
 * `minHeight` évite une zone noire si le parent flex n’a pas encore une hauteur.
 */
export function CameraStreamView({ uri }: Props) {
  const [iframeKey, setIframeKey] = useState(0);

  const reloadIframe = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  if (!uri || !/^https?:\/\//i.test(uri)) {
    return <View style={{ flex: 1, minHeight: 200, backgroundColor: "#000000" }} />;
  }

  if (isLikelyMjpegStream(uri)) {
    return (
      <View
        style={{
          flex: 1,
          minHeight: 220,
          width: "100%",
          backgroundColor: "#000000",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <iframe
          key={`${uri}-${iframeKey}`}
          title="Flux caméra MJPEG"
          src={uri}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
          }}
        />
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 8,
            paddingVertical: 6,
            backgroundColor: "rgba(15,23,42,0.75)",
          }}
        >
          <Pressable onPress={() => void Linking.openURL(uri)} hitSlop={8}>
            <Text style={{ color: "#38bdf8", fontSize: 12, textDecorationLine: "underline" }}>
              Ouvrir dans un onglet
            </Text>
          </Pressable>
          <Pressable onPress={reloadIframe} hitSlop={8}>
            <Text style={{ color: "#94a3b8", fontSize: 12 }}>Actualiser</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 200, backgroundColor: "#000000", overflow: "hidden" }}>
      <img
        src={uri}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    </View>
  );
}
