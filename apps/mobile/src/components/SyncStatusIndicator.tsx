/**
 * SyncStatusIndicator - Shows sync status in header
 * Per .UXUIrules: "Use a subtle indicator in the header area:
 * ✅ (Synced) / ☁️ (Offline - Saved locally) / 🔄 (Syncing)"
 */

import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Animated } from "react-native";
import {
  subscribeSyncStatus,
  SyncStatus,
  syncPendingLogs,
} from "../sync/syncEngine";
import * as SQLite from "expo-sqlite";

interface SyncStatusIndicatorProps {
  compact?: boolean; // Show only icon in compact mode
}

export function SyncStatusIndicator({
  compact = false,
}: SyncStatusIndicatorProps) {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: true,
    pendingCount: 0,
    lastSyncAt: null,
    isSyncing: false,
  });
  const [spinAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus(setStatus);
    return unsubscribe;
  }, []);

  // Spin animation for syncing
  useEffect(() => {
    if (status.isSyncing) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.setValue(0);
    }
  }, [status.isSyncing, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Manual sync trigger
  const handleManualSync = async () => {
    if (status.isSyncing || !status.isOnline || status.pendingCount === 0)
      return;

    try {
      const db = await SQLite.openDatabaseAsync("snapko.db");
      await syncPendingLogs(db);
    } catch (err) {
      console.error("Manual sync failed:", err);
    }
  };

  // Get display info based on status
  const getStatusInfo = () => {
    if (status.isSyncing) {
      return {
        icon: "🔄",
        text: "Đang đồng bộ...",
        color: "#FFC857", // Mustard Yellow
      };
    }
    if (!status.isOnline) {
      return {
        icon: "☁️",
        text: `Offline (${status.pendingCount} chờ)`,
        color: "#94A3B8",
      };
    }
    if (status.pendingCount > 0) {
      return {
        icon: "⏳",
        text: `${status.pendingCount} chờ đồng bộ`,
        color: "#E07A2F", // Burnt Orange
      };
    }
    return {
      icon: "✅",
      text: "Đã đồng bộ",
      color: "#6B8E23", // Olive Green
    };
  };

  const info = getStatusInfo();

  if (compact) {
    return (
      <Pressable onPress={handleManualSync}>
        {status.isSyncing ? (
          <Animated.Text
            style={{ fontSize: 16, transform: [{ rotate: spin }] }}
          >
            {info.icon}
          </Animated.Text>
        ) : (
          <Text style={{ fontSize: 16 }}>{info.icon}</Text>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handleManualSync}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#1A1A1A",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 6,
      }}
    >
      {status.isSyncing ? (
        <Animated.Text style={{ fontSize: 14, transform: [{ rotate: spin }] }}>
          {info.icon}
        </Animated.Text>
      ) : (
        <Text style={{ fontSize: 14 }}>{info.icon}</Text>
      )}
      <Text style={{ color: info.color, fontSize: 12, fontWeight: "500" }}>
        {info.text}
      </Text>
    </Pressable>
  );
}
