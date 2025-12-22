/**
 * DashboardScreen - Realtime COGS chart and recent activity
 * Shows inventory value, recent logs with staff info
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
} from "react-native";
import * as SQLite from "expo-sqlite";

interface DailySummary {
  date: string;
  imports: number;
  waste: number;
}

interface RecentLog {
  id: string;
  type: string;
  ingredient_name: string;
  quantity: number;
  created_at: string;
}

interface DashboardScreenProps {
  onOpenSettings: () => void;
  onOpenInventory: () => void;
  onOpenPendingList: () => void;
}

export default function DashboardScreen({
  onOpenSettings,
  onOpenInventory,
  onOpenPendingList,
}: DashboardScreenProps) {
  const [totalValue, setTotalValue] = useState(0);
  const [ingredientCount, setIngredientCount] = useState(0);
  const [recipeCount, setRecipeCount] = useState(0);
  const [dailySummary, setDailySummary] = useState<DailySummary[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const db = await SQLite.openDatabaseAsync("snapko.db");

      // Load ingredients
      const ings = await db.getAllAsync<{
        warehouse_qty: number;
        bar_qty: number;
        unit_cost: number;
      }>(
        "SELECT warehouse_qty, bar_qty, unit_cost FROM local_ingredients WHERE archived = 0"
      );

      const total = ings.reduce(
        (sum, i) => sum + (i.warehouse_qty + i.bar_qty) * i.unit_cost,
        0
      );
      setTotalValue(total);
      setIngredientCount(ings.length);

      // Load recipes count
      const recipes = await db.getAllAsync("SELECT id FROM local_recipes");
      setRecipeCount(recipes.length);

      // Load recent logs (mock - would be from pending_sync_logs)
      const logs = await db.getAllAsync<{
        id: string;
        type: string;
        created_at: string;
      }>(
        "SELECT id, type, created_at FROM pending_sync_logs ORDER BY created_at DESC LIMIT 10"
      );

      setRecentLogs(
        logs.map((l) => ({
          ...l,
          ingredient_name: "Nguyên liệu",
          quantity: 0,
        }))
      );
    } catch (err) {
      console.log("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (value: number) => {
    return value.toLocaleString("vi-VN") + " đ";
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
        <Pressable onPress={onOpenSettings}>
          <Text style={{ color: "#94A3B8", fontSize: 16 }}>⚙️ Cài đặt</Text>
        </Pressable>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
          Dashboard
        </Text>
        <Pressable onPress={onOpenPendingList}>
          <Text style={{ color: "#F59E0B", fontSize: 16 }}>👥</Text>
        </Pressable>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadData} />
        }
        contentContainerStyle={{ padding: 16 }}
      >
        {/* Main Stats */}
        <View
          style={{
            backgroundColor: "#1E293B",
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: "#64748B", fontSize: 12, marginBottom: 4 }}>
            Tổng giá trị tồn kho
          </Text>
          <Text style={{ color: "#22C55E", fontSize: 32, fontWeight: "700" }}>
            {formatCurrency(totalValue)}
          </Text>
        </View>

        {/* Quick Stats */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          <Pressable
            onPress={onOpenInventory}
            style={{
              flex: 1,
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <Text style={{ color: "#E07A2F", fontSize: 24, fontWeight: "700" }}>
              {ingredientCount}
            </Text>
            <Text style={{ color: "#64748B", fontSize: 12 }}>Nguyên liệu</Text>
          </Pressable>
          <Pressable
            onPress={onOpenInventory}
            style={{
              flex: 1,
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <Text style={{ color: "#F59E0B", fontSize: 24, fontWeight: "700" }}>
              {recipeCount}
            </Text>
            <Text style={{ color: "#64748B", fontSize: 12 }}>Món</Text>
          </Pressable>
        </View>

        {/* Quick Actions */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              color: "#64748B",
              fontSize: 12,
              marginBottom: 8,
              textTransform: "uppercase",
            }}
          >
            Thao tác nhanh
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={onOpenInventory}
              style={{
                flex: 1,
                backgroundColor: "#E07A2F",
                borderRadius: 12,
                padding: 16,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 24, marginBottom: 4 }}>📷</Text>
              <Text style={{ color: "white", fontWeight: "600" }}>
                Nhập kho
              </Text>
            </Pressable>
            <Pressable
              onPress={onOpenInventory}
              style={{
                flex: 1,
                backgroundColor: "#22C55E",
                borderRadius: 12,
                padding: 16,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 24, marginBottom: 4 }}>🛒</Text>
              <Text style={{ color: "white", fontWeight: "600" }}>
                Bán hàng
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Recent Activity */}
        <View>
          <Text
            style={{
              color: "#64748B",
              fontSize: 12,
              marginBottom: 8,
              textTransform: "uppercase",
            }}
          >
            Hoạt động gần đây
          </Text>
          {recentLogs.length === 0 ? (
            <View
              style={{
                backgroundColor: "#1A1A1A",
                borderRadius: 12,
                padding: 24,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#64748B" }}>Chưa có hoạt động nào</Text>
            </View>
          ) : (
            recentLogs.slice(0, 5).map((log) => (
              <View
                key={log.id}
                style={{
                  backgroundColor: "#1A1A1A",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View>
                  <Text
                    style={{
                      color:
                        log.type === "IMPORT"
                          ? "#3B82F6"
                          : log.type === "WASTE"
                          ? "#EF4444"
                          : "#94A3B8",
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {log.type}
                  </Text>
                </View>
                <Text style={{ color: "#64748B", fontSize: 11 }}>
                  {new Date(log.created_at).toLocaleString("vi-VN")}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
