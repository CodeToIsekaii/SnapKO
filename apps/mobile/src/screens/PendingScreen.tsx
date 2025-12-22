/**
 * PendingScreen - Waiting for Owner approval
 * Shows status and allows retry/cancel
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Animated,
} from "react-native";

interface PendingScreenProps {
  profileId: string;
  onApproved: () => void;
  onCancel: () => void;
}

export default function PendingScreen({
  profileId,
  onApproved,
  onCancel,
}: PendingScreenProps) {
  const [pulseAnim] = useState(new Animated.Value(1));

  // Pulse animation for the waiting indicator
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // TODO: Poll for approval status or use realtime subscription
  // For now, this is a static screen

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0F172A",
        padding: 24,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Animated waiting indicator */}
      <Animated.View
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: "#1E293B",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 32,
          transform: [{ scale: pulseAnim }],
        }}
      >
        <ActivityIndicator size="large" color="#3B82F6" />
      </Animated.View>

      {/* Status text */}
      <Text
        style={{
          color: "white",
          fontSize: 24,
          fontWeight: "bold",
          marginBottom: 12,
          textAlign: "center",
        }}
      >
        Đang chờ duyệt
      </Text>

      <Text
        style={{
          color: "#94A3B8",
          fontSize: 16,
          textAlign: "center",
          marginBottom: 32,
          lineHeight: 24,
        }}
      >
        Yêu cầu của bạn đã được gửi.{"\n"}
        Owner sẽ duyệt trong ít phút.
      </Text>

      {/* Info box */}
      <View
        style={{
          backgroundColor: "#1E293B",
          borderRadius: 16,
          padding: 20,
          width: "100%",
          marginBottom: 32,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#F59E0B",
              marginRight: 12,
            }}
          />
          <Text style={{ color: "#F59E0B", fontWeight: "600" }}>
            Trạng thái: PENDING
          </Text>
        </View>

        <Text style={{ color: "#64748B", fontSize: 12 }}>
          ID: {profileId.slice(0, 8)}...
        </Text>
      </View>

      {/* Tips */}
      <View
        style={{
          backgroundColor: "#172554",
          borderRadius: 12,
          padding: 16,
          width: "100%",
          marginBottom: 32,
        }}
      >
        <Text style={{ color: "#93C5FD", fontSize: 14, marginBottom: 8 }}>
          💡 Mẹo
        </Text>
        <Text style={{ color: "#BFDBFE", fontSize: 13, lineHeight: 20 }}>
          • Liên hệ Owner để được duyệt nhanh hơn{"\n"}• Màn hình sẽ tự cập nhật
          khi được duyệt{"\n"}• Bạn có thể quay lại sau và mở app để kiểm tra
        </Text>
      </View>

      {/* Cancel button */}
      <Pressable
        onPress={onCancel}
        style={{
          padding: 16,
        }}
      >
        <Text style={{ color: "#EF4444", fontSize: 16 }}>Hủy yêu cầu</Text>
      </Pressable>
    </View>
  );
}
