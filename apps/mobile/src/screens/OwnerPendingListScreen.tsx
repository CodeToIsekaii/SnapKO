/**
 * OwnerPendingListScreen - View and approve/reject pending staff
 * Owner can see pending requests with name + phone and take action
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Animated,
} from "react-native";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Env } from "../env";

interface PendingProfile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  created_at: string;
}

interface OwnerPendingListScreenProps {
  onBack: () => void;
}

export default function OwnerPendingListScreen({
  onBack,
}: OwnerPendingListScreenProps) {
  const [pending, setPending] = useState<PendingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isRealtime, setIsRealtime] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const loadPending = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(
        `${Env.SUPABASE_URL}/rest/v1/profiles?status=eq.PENDING&role=eq.STAFF&select=id,full_name,phone_number,created_at&order=created_at.desc`,
        {
          headers: {
            apikey: Env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        setPending(data || []);
      }
    } catch (err) {
      console.error("Load pending error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  // Realtime subscription for new pending staff
  useEffect(() => {
    const setupRealtime = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        // Supabase client already has the session from AuthContext

        channelRef.current = supabase
          .channel("pending-staff")
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "profiles",
              filter: "status=eq.PENDING",
            },
            (payload) => {
              console.log("New pending staff:", payload.new);
              // Pulse animation for new entry
              Animated.sequence([
                Animated.timing(pulseAnim, {
                  toValue: 1.05,
                  duration: 200,
                  useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                  toValue: 1,
                  duration: 200,
                  useNativeDriver: true,
                }),
              ]).start();
              loadPending();
            }
          )
          .subscribe((status) => {
            setIsRealtime(status === "SUBSCRIBED");
          });
      } catch (err) {
        console.error("Realtime setup error:", err);
      }
    };

    setupRealtime();

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, [loadPending, pulseAnim]);

  const handleAction = async (profileId: string, approve: boolean) => {
    setActionLoading(profileId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not logged in");

      const res = await fetch(
        `${Env.SUPABASE_URL}/functions/v1/invite-approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: Env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ profileId, approve }),
        }
      );

      const result = await res.json();

      if (res.ok && result.success) {
        Alert.alert(
          approve ? "✅ Đã duyệt" : "❌ Đã từ chối",
          approve
            ? "Nhân viên có thể bắt đầu sử dụng app."
            : "Yêu cầu đã bị từ chối."
        );
        loadPending();
      } else {
        Alert.alert("Lỗi", result.error || "Không thể xử lý yêu cầu");
      }
    } catch (err) {
      Alert.alert("Lỗi", "Không thể kết nối server");
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#121212" }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 16,
          paddingTop: 60,
          borderBottomWidth: 1,
          borderBottomColor: "#2A2A2A",
        }}
      >
        <Pressable onPress={onBack}>
          <Text style={{ color: "#94A3B8", fontSize: 16 }}>← Quay lại</Text>
        </Pressable>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
          Chờ duyệt
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Badge */}
      {pending.length > 0 && (
        <View style={{ padding: 16, paddingBottom: 0 }}>
          <View
            style={{
              backgroundColor: "#F59E0B20",
              borderRadius: 8,
              padding: 12,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#F59E0B", fontSize: 24, marginRight: 12 }}>
              {pending.length}
            </Text>
            <Text style={{ color: "#F59E0B" }}>yêu cầu đang chờ duyệt</Text>
          </View>
        </View>
      )}

      {/* List */}
      <FlatList
        data={pending}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadPending} />
        }
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>✅</Text>
            <Text style={{ color: "#64748B", textAlign: "center" }}>
              Không có yêu cầu nào đang chờ duyệt
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>
                {item.full_name || "(Chưa có tên)"}
              </Text>
              <Text style={{ color: "#64748B", fontSize: 12 }}>
                {formatDate(item.created_at)}
              </Text>
            </View>

            <Text style={{ color: "#94A3B8", fontSize: 14, marginBottom: 16 }}>
              📞 {item.phone_number || "(Chưa có SĐT)"}
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => handleAction(item.id, false)}
                disabled={actionLoading === item.id}
                style={{
                  flex: 1,
                  backgroundColor: "#EF444420",
                  padding: 12,
                  borderRadius: 8,
                  alignItems: "center",
                  opacity: actionLoading === item.id ? 0.5 : 1,
                }}
              >
                <Text style={{ color: "#EF4444", fontWeight: "600" }}>
                  ❌ Từ chối
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleAction(item.id, true)}
                disabled={actionLoading === item.id}
                style={{
                  flex: 1,
                  backgroundColor: "#6B8E23",
                  padding: 12,
                  borderRadius: 8,
                  alignItems: "center",
                  opacity: actionLoading === item.id ? 0.5 : 1,
                }}
              >
                {actionLoading === item.id ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={{ color: "white", fontWeight: "600" }}>
                    ✅ Duyệt
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}
