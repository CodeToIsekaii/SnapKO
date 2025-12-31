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
import { InventoryService } from "../features/inventory/services/inventory.service";

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
  onOpenRecipes?: () => void;
  onOpenIngredients?: () => void;
}

export default function DashboardScreen({
  onOpenSettings,
  onOpenInventory,
  onOpenPendingList,
  onOpenRecipes,
  onOpenIngredients,
}: DashboardScreenProps) {
  const [totalValue, setTotalValue] = useState(0);
  const [ingredientCount, setIngredientCount] = useState(0);
  const [recipeCount, setRecipeCount] = useState(0);
  const [dailySummary, setDailySummary] = useState<DailySummary[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      // Initialize InventoryService if needed
      await InventoryService.init();

      // Load ingredients using InventoryService (uses correct database)
      const ings = await InventoryService.getAll();
      const total = ings.reduce(
        (sum: number, i) => sum + (i.warehouse_qty + i.bar_qty) * i.unit_cost,
        0
      );
      setTotalValue(total);
      setIngredientCount(ings.length);

      // TODO: Recipe count not yet implemented in InventoryService
      setRecipeCount(0);

      // Load low stock items as "recent activity" for now
      const lowStock = await InventoryService.getLowStock();
      setRecentLogs(
        lowStock.map((ing) => ({
          id: ing.id,
          type: "LOW_STOCK",
          ingredient_name: ing.name,
          quantity: ing.warehouse_qty + ing.bar_qty,
          created_at: new Date().toISOString(),
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
            backgroundColor: "#1A1A1A",
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: "#64748B", fontSize: 12, marginBottom: 4 }}>
            Tổng giá trị tồn kho
          </Text>
          <Text style={{ color: "#55A630", fontSize: 32, fontWeight: "700" }}>
            {formatCurrency(totalValue)}
          </Text>
        </View>

        {/* Quick Stats */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          <Pressable
            onPress={onOpenIngredients}
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
            onPress={onOpenRecipes}
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

        {/* 📸 3 SNAPS STRATEGY - Quick Actions */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              color: "#64748B",
              fontSize: 12,
              marginBottom: 8,
              textTransform: "uppercase",
            }}
          >
            3 Snaps - Thao tác nhanh
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* 📸 IMPORT SNAP */}
            <Pressable
              onPress={onOpenInventory}
              style={{
                flex: 1,
                backgroundColor: "#1A1A1A",
                borderRadius: 12,
                padding: 14,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#2A2A2A",
              }}
            >
              <Text style={{ fontSize: 28, marginBottom: 4 }}>📷</Text>
              <Text
                style={{ color: "#E07A2F", fontWeight: "600", fontSize: 12 }}
              >
                Nhập Hàng
              </Text>
            </Pressable>

            {/* 📉 SALES SNAP */}
            <Pressable
              onPress={onOpenInventory}
              style={{
                flex: 1,
                backgroundColor: "#1A1A1A",
                borderRadius: 12,
                padding: 14,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#2A2A2A",
              }}
            >
              <Text style={{ fontSize: 28, marginBottom: 4 }}>🧾</Text>
              <Text
                style={{ color: "#6B8E23", fontWeight: "600", fontSize: 12 }}
              >
                Bán Hàng
              </Text>
            </Pressable>

            {/* 📦 STOCK SNAP - Nổi bật nhất */}
            <Pressable
              onPress={onOpenInventory}
              style={{
                flex: 1,
                backgroundColor: "#E07A2F",
                borderRadius: 12,
                padding: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 28, marginBottom: 4 }}>📦</Text>
              <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }}>
                Kiểm Kho
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
                          ? "#E07A2F"
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
