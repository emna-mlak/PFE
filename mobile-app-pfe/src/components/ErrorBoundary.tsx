import { Component, ReactNode } from "react";
import { Text, View } from "react-native";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#F8FAFC" }}>
          <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8, color: "#101828" }}>
            Erreur dans l&apos;application
          </Text>
          <Text style={{ color: "#475467", lineHeight: 20 }} selectable>
            {this.state.message || "Une erreur globale est survenue."}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}
