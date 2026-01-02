/**
 * DashboardScreen - Realtime COGS chart and recent activity
 * Shows inventory value, recent logs with staff info
 *
 * MODEL-BASED UI:
 * - SIMPLE: 3 buttons (Nhập, Bán, Kiểm) - direct to inventory
 * - STANDARD: 3 buttons + Area Modal + "Cấp Hàng Khẩn" button
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
  Platform,
  ToastAndroid,
} from "react-native";
import { InventoryService } from "../features/inventory/services/inventory.service";
import { useInventoryModel } from "../contexts/InventoryModelContext";
import { supabase } from "../lib/supabase";
import AreaSelectorModal, {
  StorageArea,
  CheckMode,
} from "../components/AreaSelectorModal";

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
  onOpenInventory: (
    snapMode?: string,
    areaType?: StorageArea,
    checkMode?: CheckMode
  ) => void;
  onOpenPendingList: () => void;
  onOpenRecipes?: () => void;
  onOpenIngredients?: () => void;
  onOpenTransfer?: () => void; // New: For ad-hoc transfer (STANDARD only)
}

export default function DashboardScreen({
  onOpenSettings,
  onOpenInventory,
  onOpenPendingList,
  onOpenRecipes,
  onOpenIngredients,
  onOpenTransfer,
}: DashboardScreenProps) {
  const { model, businessId, isStandard, syncModel } = useInventoryModel();
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [currentSnapMode, setCurrentSnapMode] = useState<string>("stock");
  const [totalValue, setTotalValue] = useState(0);
  const [ingredientCount, setIngredientCount] = useState(0);
  const [recipeCount, setRecipeCount] = useState(0);
  const [dailySummary, setDailySummary] = useState<DailySummary[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Debug: Log when Dashboard mounts with current businessId
  useEffect(() => {
    console.log("🏠 [Dashboard] Component mounted, businessId:", businessId);
  }, []);

  // Debug: Log when businessId changes
  useEffect(() => {
    console.log("🏠 [Dashboard] businessId changed to:", businessId);
  }, [businessId]);

  const loadData = useCallback(async () => {
    try {
      // Sync model from server first (for pull-to-refresh)
      await syncModel();

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
  }, [syncModel]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // NOTE: Realtime subscription for model sync is now handled at Context level (InventoryModelContext)
  // This prevents race condition where Dashboard mounts before businessId is available

  // Separate refreshing state for pull-to-refresh (like Facebook)
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    console.log("🔄 Pull-to-refresh triggered...");

    try {
      // Sync model from server
      await syncModel();

      // Reload all data
      await InventoryService.init();
      const ings = await InventoryService.getAll();
      const total = ings.reduce(
        (sum: number, i) => sum + (i.warehouse_qty + i.bar_qty) * i.unit_cost,
        0
      );
      setTotalValue(total);
      setIngredientCount(ings.length);

      console.log("✅ Refresh complete!");
      Alert.alert("Cập nhật thành công", "Dữ liệu đã được đồng bộ mới nhất.");
    } catch (err) {
      console.error("Refresh error:", err);
      Alert.alert(
        "Lỗi cập nhật",
        "Không thể đồng bộ dữ liệu. Vui lòng thử lại."
      );
    } finally {
      setRefreshing(false);
    }
  }, [syncModel]);

  const formatCurrency = (value: number) => {
    return value.toLocaleString("vi-VN") + " đ";
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#121212" }}>
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#E07A2F"]}
            tintColor="#E07A2F"
            progressBackgroundColor="#1A1A1A"
          />
        }
        contentContainerStyle={{
          paddingBottom: 100,
          flexGrow: 1,
          minHeight: "101%",
        }}
        showsVerticalScrollIndicator={false}
        bounces={true}
        alwaysBounceVertical={true}
        overScrollMode="always"
        scrollEventThrottle={16}
      >
        {/* Header - Now INSIDE ScrollView */}
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

          {/* Center: Title + Refresh Button */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
              Dashboard
            </Text>
            <Pressable
              onPress={onRefresh}
              disabled={refreshing}
              style={{
                backgroundColor: "#E07A2F20",
                padding: 6,
                borderRadius: 8,
              }}
            >
              <Text style={{ fontSize: 16 }}>{refreshing ? "⏳" : "🔄"}</Text>
            </Pressable>
          </View>

          <Pressable onPress={onOpenPendingList}>
            <Text style={{ color: "#F59E0B", fontSize: 16 }}>👥</Text>
          </Pressable>
        </View>

        {/* Content with padding */}
        <View style={{ padding: 16 }}>
          {/* Model Banner - Tap to Refresh */}
          <Pressable
            onPress={onRefresh}
            style={{
              backgroundColor: model === "STANDARD" ? "#6B8E2320" : "#E07A2F20",
              borderRadius: 8,
              padding: 10,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: model === "STANDARD" ? "#6B8E23" : "#E07A2F",
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              Mode: {model} {model === "STANDARD" ? "📦" : "📋"}
            </Text>
            <Text style={{ color: "#94A3B8", fontSize: 11 }}>
              🔄 Nhấn để đồng bộ
            </Text>
          </Pressable>

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
              <Text
                style={{ color: "#E07A2F", fontSize: 24, fontWeight: "700" }}
              >
                {ingredientCount}
              </Text>
              <Text style={{ color: "#64748B", fontSize: 12 }}>
                Nguyên liệu
              </Text>
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
              <Text
                style={{ color: "#F59E0B", fontSize: 24, fontWeight: "700" }}
              >
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
              3 Snaps - Thao tác nhanh {isStandard ? "(Kho Kép)" : "(Kho Đơn)"}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {/* 📸 IMPORT SNAP */}
              <Pressable
                onPress={() => onOpenInventory("import")}
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
                onPress={() => onOpenInventory("sales")}
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
                  Kết Ca
                </Text>
              </Pressable>

              {/* 📦 STOCK SNAP - Model-based behavior */}
              <Pressable
                onPress={() => {
                  if (isStandard) {
                    // STANDARD: Show area selector modal
                    setCurrentSnapMode("stock");
                    setShowAreaModal(true);
                  } else {
                    // SIMPLE: Go direct to stock check
                    onOpenInventory("stock");
                  }
                }}
                style={{
                  flex: 1,
                  backgroundColor: "#E07A2F",
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 28, marginBottom: 4 }}>📦</Text>
                <Text
                  style={{ color: "white", fontWeight: "700", fontSize: 12 }}
                >
                  Kiểm Kho
                </Text>
              </Pressable>
            </View>

            {/* 🔄 TRANSFER BUTTON - STANDARD MODE ONLY */}
            {isStandard && onOpenTransfer && (
              <Pressable
                onPress={onOpenTransfer}
                style={{
                  marginTop: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#2A2A2A",
                  borderRadius: 10,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: "#3A3A3A",
                }}
              >
                <Text style={{ fontSize: 20, marginRight: 8 }}>🔄</Text>
                <Text
                  style={{ color: "#94A3B8", fontWeight: "600", fontSize: 13 }}
                >
                  Cấp Hàng Khẩn (Chuyển Kho)
                </Text>
              </Pressable>
            )}
          </View>

          {/* Area Selector Modal for STANDARD mode */}
          <AreaSelectorModal
            visible={showAreaModal}
            onClose={() => setShowAreaModal(false)}
            onSelect={(area, mode) => {
              onOpenInventory(currentSnapMode, area, mode);
            }}
          />

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
          {/* End Content wrapper */}
        </View>
      </ScrollView>
    </View>
  );
}
