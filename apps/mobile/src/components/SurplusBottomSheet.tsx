/**
 * SurplusBottomSheet - Animated bottom sheet for surplus detection
 * Per .UXUIrules Section 3.D.4: Dư kho handling
 * Uses Animated.View for smooth slide-up animation
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  TouchableWithoutFeedback,
} from "react-native";

const SHEET_HEIGHT = 280;

interface SurplusItem {
  name: string;
  surplus: number;
  unit: string;
}

interface SurplusBottomSheetProps {
  visible: boolean;
  items: SurplusItem[];
  onConfirm: () => void; // "Đúng, tạo phiếu nhập bù"
  onDismiss: () => void; // "Không, tôi đếm sai"
}

export default function SurplusBottomSheet({
  visible,
  items,
  onConfirm,
  onDismiss,
}: SurplusBottomSheetProps) {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 150,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SHEET_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, opacity]);

  if (!visible) return null;

  const totalSurplus = items.length;

  return (
    <View style={styles.container}>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onDismiss}>
        <Animated.View style={[styles.backdrop, { opacity }]} />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.icon}>📦</Text>
          <Text style={styles.title}>Phát hiện Dư Kho!</Text>
          <Text style={styles.description}>
            Có <Text style={styles.highlight}>{totalSurplus} món</Text> dư hơn
            so với lý thuyết.{"\n"}
            Bạn có quên ghi nhận hàng nhập từ Kho Tổng không?
          </Text>

          {/* Item preview */}
          {items.slice(0, 2).map((item, index) => (
            <View key={index} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemSurplus}>
                +{item.surplus} {item.unit}
              </Text>
            </View>
          ))}
          {items.length > 2 && (
            <Text style={styles.moreText}>+{items.length - 2} món khác...</Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.primaryButton} onPress={onConfirm}>
            <Text style={styles.primaryText}>Đúng, Tạo phiếu nhập bù</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={onDismiss}>
            <Text style={styles.secondaryText}>Không, tôi đếm sai</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  sheet: {
    backgroundColor: "#1A1A1A",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: SHEET_HEIGHT,
    paddingBottom: 34, // Safe area
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#3A3A3A",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
  },
  content: {
    padding: 20,
    alignItems: "center",
  },
  icon: {
    fontSize: 36,
    marginBottom: 8,
  },
  title: {
    color: "#FFC857", // Mustard Yellow for surplus
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  description: {
    color: "#B8B3A8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  highlight: {
    color: "#F5F3EF",
    fontWeight: "700",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    backgroundColor: "#121212",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  itemName: {
    color: "#F5F3EF",
    fontSize: 14,
  },
  itemSurplus: {
    color: "#6B8E23", // Olive Green for positive
    fontSize: 14,
    fontWeight: "600",
  },
  moreText: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 4,
  },
  actions: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  primaryButton: {
    backgroundColor: "#E07A2F",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryText: {
    color: "#F5F3EF",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryText: {
    color: "#94A3B8",
    fontSize: 14,
  },
});
