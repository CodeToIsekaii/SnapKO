/**
 * SalesCameraModal - Camera with 3-section grid overlay for long receipts
 * Helps staff split long Z-Reports into multiple photos for better OCR accuracy
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
  totalPhotos?: number; // Total photos taken so far
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Receipt frame - taller aspect ratio for receipts
const FRAME_WIDTH = SCREEN_WIDTH * 0.92;
const FRAME_HEIGHT = SCREEN_HEIGHT * 0.55;

export function SalesCameraModal({
  visible,
  onCapture,
  onClose,
  totalPhotos = 0,
}: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });

      if (photo?.uri) {
        onCapture(photo.uri);
      }
    } catch (err) {
      console.error("[SalesCamera] Capture error:", err);
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
            Cần quyền truy cập Camera để chụp hóa đơn
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
          {/* Dark overlay with transparent center */}
          <View style={styles.overlay}>
            {/* Top dark area */}
            <View style={styles.darkTop} />

            {/* Middle row: dark sides + transparent center with grid */}
            <View style={styles.middleRow}>
              <View style={styles.darkSide} />

              {/* Receipt Guide Frame with 3-section grid */}
              <View style={styles.guideFrame}>
                {/* Section 1 */}
                <View style={styles.section}>
                  <View style={styles.sectionLabel}>
                    <Text style={styles.sectionNumber}>1/3</Text>
                  </View>
                </View>

                {/* Divider Line 1 */}
                <View style={styles.dividerLine}>
                  <View style={styles.dividerDash} />
                </View>

                {/* Section 2 */}
                <View style={styles.section}>
                  <View style={styles.sectionLabel}>
                    <Text style={styles.sectionNumber}>2/3</Text>
                  </View>
                </View>

                {/* Divider Line 2 */}
                <View style={styles.dividerLine}>
                  <View style={styles.dividerDash} />
                </View>

                {/* Section 3 */}
                <View style={styles.section}>
                  <View style={styles.sectionLabel}>
                    <Text style={styles.sectionNumber}>3/3</Text>
                  </View>
                </View>

                {/* Corner markers */}
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
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
            <Text style={styles.headerTitle}>Chụp Hóa Đơn Bán Hàng</Text>
            <View style={styles.headerButton} />
          </View>

          {/* Instructions */}
          <View style={styles.instructions}>
            <View style={styles.instructionBox}>
              <Ionicons name="information-circle" size={20} color="#E07A2F" />
              <Text style={styles.instructionText}>
                Bill dài? Chụp từng phần (1/3, 2/3, 3/3)
              </Text>
            </View>
            <Text style={styles.instructionSubtext}>
              Căn sao cho mỗi ảnh chứa ~10 dòng, không bị cắt chữ
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
              {isCapturing
                ? "Đang chụp..."
                : totalPhotos > 0
                  ? `Ảnh ${totalPhotos + 1} • Nhấn để chụp thêm`
                  : "Nhấn để chụp"}
            </Text>
            {totalPhotos > 0 && (
              <Text style={styles.photoCount}>Đã chụp: {totalPhotos} ảnh</Text>
            )}
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
  },
  section: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 8,
  },
  sectionLabel: {
    backgroundColor: "rgba(224, 122, 47, 0.8)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  sectionNumber: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
  dividerLine: {
    width: "100%",
    height: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  dividerDash: {
    width: "90%",
    height: 2,
    backgroundColor: "#E07A2F",
    opacity: 0.8,
  },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
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
    top: 105,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
  },
  instructionBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  instructionText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  instructionSubtext: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    textAlign: "center",
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
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    marginTop: 12,
    fontWeight: "500",
  },
  photoCount: {
    color: "#4ADE80",
    fontSize: 13,
    marginTop: 4,
    fontWeight: "600",
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
