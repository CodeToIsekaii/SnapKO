/**
 * Dynamic Camera Route - [snapType].tsx
 * Per .antigravityrules Section 4: camera/[snapType].tsx
 *
 * Handles all 3-Snap workflows:
 * - 'import': Invoice snap (Snap 1)
 * - 'sales': POS report snap (Snap 2)
 * - 'stock': Stock check snap (Snap 3)
 * - 'transfer': Transfer ticket snap
 */

import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";

const COLORS = {
  background: "#121212",
  surface: "#1A1A1A",
  primary: "#E07A2F",
  success: "#6B8E23",
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
};

// Snap types configuration per .antigravityrules Section D
const SNAP_CONFIGS: Record<
  string,
  {
    title: string;
    subtitle: string;
    icon: string;
    overlayHint: string;
  }
> = {
  import: {
    title: "Nhập hàng",
    subtitle: "Chụp hóa đơn nhập",
    icon: "arrow-down-circle",
    overlayHint: "Căn chỉnh hóa đơn vào khung hình",
  },
  sales: {
    title: "Ghi bán",
    subtitle: "Chụp báo cáo POS",
    icon: "arrow-up-circle",
    overlayHint: "Căn chỉnh báo cáo Z vào khung hình",
  },
  stock: {
    title: "Kiểm kho",
    subtitle: "Chụp phiếu kiểm",
    icon: "clipboard",
    overlayHint: "Căn chỉnh danh sách nguyên liệu vào khung hình",
  },
  transfer: {
    title: "Chuyển kho",
    subtitle: "Chụp phiếu chuyển",
    icon: "swap-horizontal",
    overlayHint: "Căn chỉnh phiếu chuyển vào khung hình",
  },
};

export default function CameraSnapScreen() {
  const router = useRouter();
  const { snapType } = useLocalSearchParams<{ snapType: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [flashMode, setFlashMode] = useState<"off" | "on">("off");

  const config = SNAP_CONFIGS[snapType || "import"] || SNAP_CONFIGS.import;

  // Request camera permission on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  const handleCapture = async () => {
    setIsCapturing(true);
    try {
      // TODO: Implement actual camera capture
      // Per .antigravityrules: Use expo-image-manipulator for compression
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Navigate to review screen with captured image
      // For now, just go back
      router.back();
    } catch (error) {
      console.error("Capture error:", error);
    } finally {
      setIsCapturing(false);
    }
  };

  const toggleFlash = () => {
    setFlashMode((prev) => (prev === "off" ? "on" : "off"));
  };

  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons
          name="camera-outline"
          size={64}
          color={COLORS.textSecondary}
        />
        <Text style={styles.permissionTitle}>Cần quyền Camera</Text>
        <Text style={styles.permissionText}>
          Ứng dụng cần quyền truy cập camera để chụp ảnh
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Cấp quyền</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Camera View */}
      <CameraView style={styles.camera} facing="back" flash={flashMode}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={styles.title}>{config.title}</Text>
            <Text style={styles.subtitle}>{config.subtitle}</Text>
          </View>

          <TouchableOpacity style={styles.iconButton} onPress={toggleFlash}>
            <Ionicons
              name={flashMode === "on" ? "flash" : "flash-off"}
              size={24}
              color="#FFF"
            />
          </TouchableOpacity>
        </View>

        {/* Overlay hint */}
        <View style={styles.overlayContainer}>
          <View style={styles.overlayFrame} />
          <Text style={styles.overlayHint}>{config.overlayHint}</Text>
        </View>

        {/* Bottom Bar */}
        <View style={styles.bottomBar}>
          <View style={styles.bottomLeft} />

          <TouchableOpacity
            style={styles.captureButton}
            onPress={handleCapture}
            disabled={isCapturing}
          >
            {isCapturing ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : (
              <View style={styles.captureButtonInner} />
            )}
          </TouchableOpacity>

          <View style={styles.bottomRight} />
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
    padding: 40,
    gap: 16,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  permissionText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  permissionButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  camera: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleContainer: {
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFF",
  },
  subtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  overlayContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  overlayFrame: {
    width: "85%",
    aspectRatio: 0.7,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: 12,
    borderStyle: "dashed",
  },
  overlayHint: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginTop: 16,
    textAlign: "center",
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    paddingBottom: 50,
    paddingTop: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  bottomLeft: {
    width: 50,
  },
  bottomRight: {
    width: 50,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 4,
    borderColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FFF",
  },
});
