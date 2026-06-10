/**
 * PendingScreen - Waiting for Owner approval
 * Uses REALTIME subscription to detect status changes instantly
 * When approved -> auto navigate to app (no login required - already has session)
 * When rejected -> show message and go back to join screen
 */

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Animated,
  Alert,
} from "react-native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";

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
  const [status, setStatus] = useState<string>("PENDING");
  const { refreshProfile } = useAuth();

  // CRITICAL: Track if we've already handled a final status to prevent duplicate alerts
  const hasHandledFinalStatus = useRef(false);

  // 📡 REALTIME LISTENER - detect when owner approves/rejects
  useEffect(() => {
    if (!profileId) return;

    console.log("[PendingScreen] Starting realtime listener for:", profileId);

    const channel = supabase
      .channel(`profile-status-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${profileId}`,
        },
        async (payload) => {
          // GUARD: Prevent duplicate handling
          if (hasHandledFinalStatus.current) return;

          const newStatus = (payload.new as { status: string }).status;
          console.log("🔔 [PendingScreen] Status changed:", newStatus);
          setStatus(newStatus);

          if (newStatus === "ACTIVE") {
            hasHandledFinalStatus.current = true; // Mark as handled
            await refreshProfile();
            Alert.alert(
              "🎉 Đã được duyệt!",
              "Owner đã phê duyệt yêu cầu của bạn. Bạn có thể bắt đầu sử dụng app.",
              [{ text: "Tiếp tục", onPress: onApproved }]
            );
          } else if (newStatus === "REJECTED" || newStatus === "INACTIVE") {
            hasHandledFinalStatus.current = true; // Mark as handled
            Alert.alert(
              "❌ Yêu cầu bị từ chối",
              "Owner đã từ chối yêu cầu tham gia của bạn.",
              [{ text: "Quay lại", onPress: onCancel }]
            );
          }
        }
      )
      .subscribe((subscribeStatus) => {
        console.log("[PendingScreen] Subscription status:", subscribeStatus);
        if (subscribeStatus === "TIMED_OUT" || subscribeStatus === "CLOSED") {
          console.warn(
            "[PendingScreen] Lost connection, falling back to polling"
          );
          // Fallback: poll every 10 seconds if realtime fails
          startPollingFallback();
        }
      });

    return () => {
      console.log("[PendingScreen] Cleaning up realtime listener");
      supabase.removeChannel(channel);
    };
  }, [profileId, refreshProfile, onApproved, onCancel]);

  // Fallback polling if realtime fails
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const startPollingFallback = () => {
    // Don't start if already handled
    if (hasHandledFinalStatus.current) return;

    const poll = async () => {
      // GUARD: Prevent duplicate handling
      if (hasHandledFinalStatus.current) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
        return;
      }

      try {
        const data = await api
          .get<{ status?: string }>("/profiles/me")
          .catch(() => null);

        if (data?.status && data.status !== "PENDING") {
          hasHandledFinalStatus.current = true; // Mark as handled
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current); // Stop polling
          }

          setStatus(data.status);
          if (data.status === "ACTIVE") {
            await refreshProfile();
            Alert.alert("🎉 Đã được duyệt!", "Bạn có thể sử dụng app.", [
              { text: "Tiếp tục", onPress: onApproved },
            ]);
          } else if (data.status === "REJECTED" || data.status === "INACTIVE") {
            Alert.alert("❌ Yêu cầu bị từ chối", "", [
              { text: "Quay lại", onPress: onCancel },
            ]);
          }
        }
      } catch (err) {
        console.error("[PendingScreen] Poll error:", err);
      }
    };

    pollingIntervalRef.current = setInterval(poll, 10000);
    // Also poll immediately
    poll();
  };

  // Pulse animation
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

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#121212",
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
          backgroundColor: "#1A1A1A",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 32,
          transform: [{ scale: pulseAnim }],
        }}
      >
        <ActivityIndicator size="large" color="#E07A2F" />
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
        Màn hình sẽ tự động chuyển khi được duyệt.
      </Text>

      {/* Info box */}
      <View
        style={{
          backgroundColor: "#1A1A1A",
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
              backgroundColor:
                status === "ACTIVE"
                  ? "#22C55E"
                  : status === "REJECTED"
                  ? "#EF4444"
                  : "#F59E0B",
              marginRight: 12,
            }}
          />
          <Text
            style={{
              color:
                status === "ACTIVE"
                  ? "#22C55E"
                  : status === "REJECTED"
                  ? "#EF4444"
                  : "#F59E0B",
              fontWeight: "600",
            }}
          >
            Trạng thái: {status}
          </Text>
        </View>

        <Text style={{ color: "#64748B", fontSize: 12 }}>
          ID: {profileId.slice(0, 8)}...
        </Text>
      </View>

      {/* Tips */}
      <View
        style={{
          backgroundColor: "#1A1A1A",
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
          • Liên hệ Owner để được duyệt nhanh hơn{"\n"}• Màn hình sẽ tự động
          chuyển khi được duyệt{"\n"}• Bạn có thể để điện thoại đây và chờ
        </Text>
      </View>

      {/* Cancel button */}
      <Pressable onPress={onCancel} style={{ padding: 16 }}>
        <Text style={{ color: "#EF4444", fontSize: 16 }}>Hủy yêu cầu</Text>
      </Pressable>
    </View>
  );
}
