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
  FlatList,
  RefreshControl,
  Pressable,
  Alert,
  Platform,
  ToastAndroid,
} from "react-native";
import { InventoryService } from "../features/inventory/services/inventory.service";
import { useInventoryModel } from "../contexts/InventoryModelContext";
import { supabase } from "../lib/supabase";
import { getDB } from "../db";
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
  onOpenTransfer?: () => void;
  onOpenQuickOut?: () => void; // New: For quick out/disposal
}

export default function DashboardScreen({
  onOpenSettings,
  onOpenInventory,
  onOpenPendingList,
  onOpenRecipes,
  onOpenIngredients,
  onOpenTransfer,
  onOpenQuickOut,
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
  const [hasTodaySales, setHasTodaySales] = useState(false);
  const [todayTransfers, setTodayTransfers] = useState<any[]>([]);
  const [isOwner, setIsOwner] = useState(false); // Role-based UI control

  // Debug: Log when Dashboard mounts with current businessId
  useEffect(() => {
    console.log("🏠 [Dashboard] Component mounted, businessId:", businessId);
  }, []);

  // Debug: Log when businessId changes
  useEffect(() => {
    console.log("🏠 [Dashboard] businessId changed to:", businessId);
  }, [businessId]);

  // Load today's sales and transfer logs for guards
  const [pendingReminders, setPendingReminders] = useState<any[]>([]);

  const loadTodayData = useCallback(async () => {
    try {
      const db = await getDB();
      const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local timezone

      // Check user role
      const userProfile = await db.getFirstAsync<{ role: string }>(
        "SELECT role FROM local_profiles LIMIT 1"
      );
      setIsOwner(userProfile?.role === "OWNER");

      // Check if today has any SALES type logs
      const salesLogs = await db.getAllAsync<any>(
        `SELECT id FROM pending_sync_logs WHERE type = 'SALES' AND date(created_at) = ?`,
        [today]
      );
      setHasTodaySales(salesLogs.length > 0);

      // Load today's transfers for widget
      const transfers = await db.getAllAsync<any>(
        `SELECT psl.*, li.name as ingredient_name 
         FROM pending_sync_logs psl 
         LEFT JOIN local_ingredients li ON psl.ingredient_id = li.id
         WHERE psl.type = 'TRANSFER' AND date(psl.created_at) = ?
         ORDER BY psl.created_at DESC`,
        [today]
      );
      setTodayTransfers(transfers);

      // Load pending LOAN reminders (due today or earlier, not done)
      try {
        const reminders = await db.getAllAsync<any>(
          `SELECT * FROM local_reminders 
           WHERE is_done = 0 AND date(remind_at) <= ?
           ORDER BY remind_at ASC`,
          [today]
        );
        setPendingReminders(reminders);
      } catch {
        // Table might not exist yet - that's OK
        setPendingReminders([]);
      }
    } catch (err) {
      console.log("[Dashboard] loadTodayData error:", err);
    }
  }, []);

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

      setIngredientCount(ings.length);

      // Get Recipe Count
      const rCount = await InventoryService.getRecipeCount();
      setRecipeCount(rCount);

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

      // Also load today's data for guards
      await loadTodayData();
    } catch (err) {
      console.log("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, [syncModel, loadTodayData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // SALES → STOCK GUARD: Check if user has done Sales Snap today before Stock Snap
  const handleStockSnapPress = () => {
    if (!hasTodaySales) {
      // Show blocking alert
      Alert.alert(
        "⚠️ Chưa Có Doanh Thu Hôm Nay",
        "Bạn chưa nhập Doanh thu (Kết ca) hôm nay. Nếu kiểm kho ngay bây giờ, số liệu chênh lệch sẽ KHÔNG CHÍNH XÁC (vì chưa trừ hàng bán).\n\nBạn muốn làm gì?",
        [
          {
            text: "📉 Nhập Doanh Thu Trước",
            onPress: () => onOpenInventory("sales"),
            style: "default",
          },
          {
            text: "⚠️ Bỏ Qua (Chấp nhận sai số)",
            onPress: () => {
              if (isStandard) {
                setCurrentSnapMode("stock");
                setShowAreaModal(true);
              } else {
                onOpenInventory("stock");
              }
            },
            style: "destructive",
          },
          {
            text: "Hủy",
            style: "cancel",
          },
        ]
      );
    } else {
      // Has sales data, proceed normally
      if (isStandard) {
        setCurrentSnapMode("stock");
        setShowAreaModal(true);
      } else {
        onOpenInventory("stock");
      }
    }
  };

  // NOTE: Realtime subscription for model sync is now handled at Context level (InventoryModelContext)
  // This prevents race condition where Dashboard mounts before businessId is available

  // Separate refreshing state for pull-to-refresh (like Facebook)
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    console.log("🔄 Pull-to-refresh triggered...");

    try {
      // 1. Pull data from Supabase to local DB
      const { pullAllData } = await import("../sync/pullSync");
      const pullResult = await pullAllData();
      console.log("📥 Pull complete:", pullResult);

      // 2. Sync model from server
      await syncModel();

      // 3. Reload all data from local DB
      await InventoryService.init();
      const ings = await InventoryService.getAll();
      const total = ings.reduce(
        (sum: number, i) => sum + (i.warehouse_qty + i.bar_qty) * i.unit_cost,
        0
      );
      setTotalValue(total);
      setIngredientCount(ings.length);

      // Update recipe count
      const rCount = await InventoryService.getRecipeCount();
      setRecipeCount(rCount);

      console.log("✅ Refresh complete!");
      console.log("✅ Refresh complete!");
      // Success alert removed to prevent blocking UI/RefreshControl
      // Alert.alert("Cập nhật thành công", "Dữ liệu đã được đồng bộ mới nhất.");
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

  // Render individual log item
  const renderLogItem = ({ item: log }: { item: RecentLog }) => (
    <View
      style={{
        backgroundColor: "#1A1A1A",
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        marginHorizontal: 16,
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
  );

  // Dashboard header content (rendered via ListHeaderComponent)
  const DashboardHeader = () => (
    <>
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

        {/* Main Stats - OWNER ONLY per .script */}
        {isOwner && (
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
        )}

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

        {/* 🔔 LOAN REMINDER WIDGET */}
        {pendingReminders.length > 0 && (
          <View
            style={{
              backgroundColor: "#2A1A0A",
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: "#F59E0B40",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 16, marginRight: 6 }}>🔔</Text>
              <Text
                style={{
                  color: "#F59E0B",
                  fontSize: 12,
                  fontWeight: "700",
                  flex: 1,
                }}
              >
                NHẮC NHỞ HÔM NAY
              </Text>
            </View>
            {pendingReminders.map((r) => (
              <View
                key={r.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: "#3A3A3A",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: "#F5F3EF",
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {r.title}
                  </Text>
                  <Text
                    style={{ color: "#94A3B8", fontSize: 11, marginTop: 2 }}
                  >
                    {r.message}
                  </Text>
                </View>
                <Pressable
                  onPress={async () => {
                    const db = await getDB();
                    await db.runAsync(
                      "UPDATE local_reminders SET is_done = 1 WHERE id = ?",
                      [r.id]
                    );
                    loadTodayData();
                  }}
                  style={{
                    backgroundColor: "#6B8E23",
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{ color: "white", fontSize: 11, fontWeight: "600" }}
                  >
                    ✓ Xong
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* 📋 QUICK TRANSFER HISTORY WIDGET - Per .script Section 2.3.B */}
        {isStandard && todayTransfers.length > 0 && (
          <View
            style={{
              backgroundColor: "#1A2A1A",
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: "#6B8E2340",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 16, marginRight: 6 }}>📋</Text>
              <Text
                style={{
                  color: "#6B8E23",
                  fontSize: 12,
                  fontWeight: "700",
                  flex: 1,
                }}
              >
                NHẬT KÝ CHUYỂN HÀNG HÔM NAY
              </Text>
              <Text style={{ color: "#64748B", fontSize: 10 }}>
                {todayTransfers.length} lệnh
              </Text>
            </View>
            {todayTransfers.slice(0, 3).map((t, idx) => {
              const parsed =
                typeof t.ai_parsed_json === "string"
                  ? JSON.parse(t.ai_parsed_json)
                  : t.ai_parsed_json;
              const items = parsed?.items || [];
              const time = new Date(t.created_at).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <View
                  key={t.id || idx}
                  style={{
                    flexDirection: "row",
                    paddingVertical: 4,
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: "#2A2A2A",
                  }}
                >
                  <Text style={{ color: "#64748B", fontSize: 11, width: 50 }}>
                    {time}
                  </Text>
                  <Text style={{ color: "#B8B3A8", fontSize: 11, flex: 1 }}>
                    {items
                      .map((i: any) => `${i.ingredient_name}: ${i.quantity}`)
                      .join(", ") || "?"}
                  </Text>
                </View>
              );
            })}
            {todayTransfers.length > 3 && (
              <Text
                style={{
                  color: "#64748B",
                  fontSize: 10,
                  textAlign: "center",
                  marginTop: 4,
                }}
              >
                +{todayTransfers.length - 3} lệnh khác
              </Text>
            )}
            <Text
              style={{
                color: "#F59E0B",
                fontSize: 10,
                marginTop: 8,
                textAlign: "center",
              }}
            >
              ⚠️ Không ghi lại vào giấy kiểm kê!
            </Text>
          </View>
        )}

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

            {/* 📦 STOCK SNAP - With Sales Guard */}
            <Pressable
              onPress={handleStockSnapPress}
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

          {/* 🔄 TRANSFER & QUICK OUT BUTTONS ROW */}
          {(isStandard || onOpenQuickOut) && (
            <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
              {/* 🔄 TRANSFER BUTTON - STANDARD MODE ONLY */}
              {isStandard && onOpenTransfer && (
                <Pressable
                  onPress={onOpenTransfer}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#2A2A2A",
                    borderRadius: 10,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: "#3A3A3A",
                    flex: 1,
                  }}
                >
                  <Text style={{ fontSize: 18, marginRight: 6 }}>🔄</Text>
                  <Text
                    style={{
                      color: "#94A3B8",
                      fontWeight: "600",
                      fontSize: 12,
                    }}
                  >
                    Cấp Hàng Khẩn
                  </Text>
                </Pressable>
              )}

              {/* 📤 QUICK OUT BUTTON - Both modes */}
              {onOpenQuickOut && (
                <Pressable
                  onPress={onOpenQuickOut}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#2A2A2A",
                    borderRadius: 10,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: "#EF444440",
                    flex: 1,
                  }}
                >
                  <Text style={{ fontSize: 18, marginRight: 6 }}>📤</Text>
                  <Text
                    style={{
                      color: "#EF4444",
                      fontWeight: "600",
                      fontSize: 12,
                    }}
                  >
                    Xuất Khác
                  </Text>
                </Pressable>
              )}
            </View>
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

        {/* Recent Activity Header */}
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
      </View>
    </>
  );

  // Empty state component
  const EmptyLogs = () => (
    <View
      style={{
        backgroundColor: "#1A1A1A",
        borderRadius: 12,
        padding: 24,
        alignItems: "center",
        marginHorizontal: 16,
      }}
    >
      <Text style={{ color: "#64748B" }}>Chưa có hoạt động nào</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#121212" }}>
      <FlatList
        data={recentLogs.slice(0, 5)}
        renderItem={renderLogItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={DashboardHeader}
        ListEmptyComponent={EmptyLogs}
        ListFooterComponent={() => <View style={{ height: 150 }} />}
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
          flexGrow: 1,
          paddingBottom: 100,
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
