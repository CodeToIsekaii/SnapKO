/**
 * DocumentCameraModal - Camera with A4 guide frame overlay
 * Helps staff align document properly for better OCR accuracy
 */

import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Dimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  visible: boolean;
  onCapture: (uri: string) => void;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// A4 aspect ratio is 1:1.414 (portrait)
const FRAME_WIDTH = SCREEN_WIDTH * 0.9;
const FRAME_HEIGHT = FRAME_WIDTH * 1.414;

export function DocumentCameraModal({ visible, onCapture, onClose }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (photo?.uri) {
        onCapture(photo.uri);
      }
    } catch (err) {
      console.error("[DocumentCamera] Capture error:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  if (!permission) {
    return null;
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#94A3B8" />
          <Text style={styles.permissionText}>
            Cần quyền truy cập Camera để chụp phiếu kiểm kho
          </Text>
          <Pressable
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Cấp quyền Camera</Text>
          </Pressable>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Đóng</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          {/* Dark overlay with transparent center (A4 guide frame) */}
          <View style={styles.overlay}>
            {/* Top dark area */}
            <View style={styles.darkTop} />

            {/* Middle row: dark sides + transparent center */}
            <View style={styles.middleRow}>
              <View style={styles.darkSide} />

              {/* A4 Guide Frame */}
              <View style={styles.guideFrame}>
                {/* Corner markers */}
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />

                {/* Guide text */}
                <Text style={styles.guideText}>Căn phiếu vào khung này</Text>
              </View>

              <View style={styles.darkSide} />
            </View>

            {/* Bottom dark area */}
            <View style={styles.darkBottom} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.headerButton}>
              <Ionicons name="close" size={28} color="white" />
            </Pressable>
            <Text style={styles.headerTitle}>Chụp Phiếu Kiểm Kho</Text>
            <View style={styles.headerButton} />
          </View>

          {/* Instructions */}
          <View style={styles.instructions}>
            <Text style={styles.instructionText}>
              📋 Đặt phiếu thẳng, vuông góc với camera
            </Text>
            <Text style={styles.instructionText}>
              💡 Đảm bảo đủ ánh sáng, tránh bóng đổ
            </Text>
          </View>

          {/* Capture button */}
          <View style={styles.captureContainer}>
            <Pressable
              onPress={handleCapture}
              disabled={isCapturing}
              style={({ pressed }) => [
                styles.captureButton,
                pressed && styles.captureButtonPressed,
                isCapturing && styles.captureButtonDisabled,
              ]}
            >
              <View style={styles.captureButtonInner} />
            </Pressable>
            <Text style={styles.captureHint}>
              {isCapturing ? "Đang chụp..." : "Nhấn để chụp"}
            </Text>
          </View>
        </CameraView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  darkTop: {
    flex: 1,
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  middleRow: {
    flexDirection: "row",
    height: FRAME_HEIGHT,
  },
  darkSide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  darkBottom: {
    flex: 1,
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  guideFrame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    borderWidth: 2,
    borderColor: "#E07A2F",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "#E07A2F",
    borderWidth: 3,
  },
  topLeft: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  guideText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  header: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  instructions: {
    position: "absolute",
    top: 110,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 4,
  },
  instructionText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  captureContainer: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "white",
  },
  captureButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "white",
  },
  captureHint: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginTop: 12,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: "#121212",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  permissionText: {
    color: "#94A3B8",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: "#E07A2F",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  closeButton: {
    marginTop: 16,
  },
  closeButtonText: {
    color: "#94A3B8",
    fontSize: 14,
  },
});
