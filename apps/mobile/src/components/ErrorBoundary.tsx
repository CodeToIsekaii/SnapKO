/**
 * ErrorBoundary - Crash recovery for React Native
 * Shows friendly error screen instead of app crash
 */

import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to error reporting service (e.g., Sentry)
    console.error("ErrorBoundary caught:", error, errorInfo);

    // TODO: Send to Sentry or similar
    // Sentry.captureException(error);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>😅</Text>
          <Text style={styles.title}>Oops! Có lỗi xảy ra</Text>
          <Text style={styles.message}>
            Ứng dụng gặp sự cố không mong muốn.{"\n"}
            Vui lòng thử lại hoặc liên hệ hỗ trợ.
          </Text>

          {__DEV__ && this.state.error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{this.state.error.message}</Text>
            </View>
          )}

          <Pressable style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Thử lại</Text>
          </Pressable>

          <Text style={styles.contact}>Hỗ trợ: support@snapko.vn</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
  },
  message: {
    color: "#94A3B8",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    maxWidth: "100%",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    fontFamily: "monospace",
  },
  button: {
    backgroundColor: "#E07A2F",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  contact: {
    color: "#64748B",
    fontSize: 12,
  },
});
