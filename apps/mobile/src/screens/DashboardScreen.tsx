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
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatCard } from "../components/StatCard";
import { NotificationModal } from "../components/NotificationModal";
import { LowStockModal } from "../components/LowStockModal";
import { useLowStock } from "../hooks/useLowStock";
import { InventoryService } from "../features/inventory/services/inventory.service";
import {
  checkSalesPrerequisite,
  type SalesGuardScope,
} from "../features/inventory/services/salesPrerequisite.service";
import { useInventoryModel } from "../contexts/InventoryModelContext";
import { useAuth } from "../contexts/AuthContext";
import { getDB } from "../db";
import AreaSelectorModal, {
  StorageArea,
  CheckMode,
} from "../components/AreaSelectorModal";
import { PendingLendsWidget } from "../components/PendingLendsWidget";
import { useSubscription, SubscriptionStatus } from "../hooks/useSubscription";
import { checkAndNotifySubscription } from "../utils/subscriptionNotification";
import {
  getProRebaselineState,
  type ProRebaselineState,
} from "../utils/proRebaseline";
import { COLORS } from "../shared/theme/colors";
import { api } from "../services/api";

interface DailySummary {
  date: string;
  imports: number;
  waste: number;
}

interface RecentLog {
  id: string;
  type: string;
  ingredient_name: string | null;
  quantity: number | null;
  created_at: string;
  ai_parsed_json?: string;
}

interface ExpiringLotAlert {
  lotId: string;
  ingredientName: string;
  daysRemaining: number;
  expiryDate: string;
  shouldAlert: boolean;
}

interface DashboardScreenProps {
  onOpenSettings: () => void;
  onOpenInventory: (
    snapMode?: string,
    areaType?: StorageArea,
    checkMode?: CheckMode,
  ) => void;
  onOpenPendingList: () => void;
  onOpenRecipes?: () => void;
  onOpenIngredients?: () => void;
  onOpenTransfer?: () => void;
  onOpenQuickOut?: () => void; // New: For quick out/disposal
  refreshKey?: number; // Increment to trigger refresh from parent
}

export default function DashboardScreen({
  onOpenSettings,
  onOpenInventory,
  onOpenPendingList,
  onOpenRecipes,
  onOpenIngredients,
  onOpenTransfer,
  onOpenQuickOut,
  refreshKey = 0,
}: DashboardScreenProps) {
  const {
    model: contextModel,
    businessId,
    syncModel,
  } = useInventoryModel();
  const { authState } = useAuth();
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [currentSnapMode, setCurrentSnapMode] = useState<string>("stock");
  const [totalValue, setTotalValue] = useState(0);
  const [ingredientCount, setIngredientCount] = useState(0);
  const [recipeCount, setRecipeCount] = useState(0);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasTodaySales, setHasTodaySales] = useState(false);
  const [todayTransfers, setTodayTransfers] = useState<any[]>([]);
  const [todayActivity, setTodayActivity] = useState<any[]>([]); // Unified activity list
  const [todayQuickOuts, setTodayQuickOuts] = useState<any[]>([]); // WASTE/LOAN/MARKETING

  // New LowStock Hook
  const {
    ingredients: lowStockIngredients,
    supplies: lowStockSupplies,
    totalCount: lowStockCount,
    isLoading: lowStockLoading,
    refetch: refetchLowStock,
  } = useLowStock();
  const [showLowStockModal, setShowLowStockModal] = useState(false);

  // Subscription Hook
  const profile =
    authState.status === "authenticated" ? authState.profile : null;
  const model = profile?.effectiveInventoryModel || contextModel;
  const isStandard = model !== "SIMPLE";

  const subscription = useSubscription(
    profile?.tier,
    profile?.subscriptionExpiresAt,
    profile?.businessCreatedAt,
  );
  const canUseAdvancedReports =
    profile?.entitlements?.canUseAdvancedReports ??
    subscription.canUseAdvancedReports;
  const [proRebaseline, setProRebaseline] = useState<ProRebaselineState>({
    required: false,
    warehouseDone: false,
    barDone: false,
  });

  // Check for subscription notification on mount
  useEffect(() => {
    // Check if is OWNER inside the effect or pass isOwner prop
    const isOwnerRole =
      authState.status === "authenticated" &&
      authState.profile.role === "OWNER";
    if (isOwnerRole && subscription) {
      checkAndNotifySubscription(subscription);
    }
  }, [authState.status, subscription.state]);

  // Initialize isOwner directly from AuthContext to prevent UI flicker
  // Using lazy initializer ensures we check authState at mount time
  const [isOwner, setIsOwner] = useState(() => {
    return (
      authState.status === "authenticated" &&
      authState.profile?.role === "OWNER"
    );
  });
  const [showNotifications, setShowNotifications] = useState(false);

  // Real notifications state
  const [notifications, setNotifications] = useState<
    {
      id: string;
      type: "warning" | "info" | "error";
      message: string;
      time: string;
    }[]
  >([]);
  const [expiringLotAlerts, setExpiringLotAlerts] = useState<ExpiringLotAlert[]>(
    [],
  );

  // Load real notifications from database
  const loadNotifications = useCallback(async () => {
    try {
      const db = await getDB();
      const notifs: {
        id: string;
        type: "warning" | "info" | "error";
        message: string;
        time: string;
      }[] = [];

      // 1. Low stock items (quantity < min_threshold)
      const lowStockItems = await db.getAllAsync<{
        name: string;
        count: number;
      }>(`
        SELECT i.name, COUNT(*) as count
        FROM local_stock_levels sl
        JOIN local_ingredients i ON sl.ingredient_id = i.id
        WHERE sl.quantity < COALESCE(i.min_threshold, 0)
          AND (i.archived = 0 OR i.archived IS NULL)
        GROUP BY i.id
        LIMIT 10
      `);

      if (lowStockItems && lowStockItems.length > 0) {
        notifs.push({
          id: "low_stock",
          type: "warning",
          message: `${lowStockItems.length} nguyên liệu sắp hết hàng`,
          time: "Hiện tại",
        });
      }

      // 2. Pending sync items
      const pendingSync = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM pending_sync_logs WHERE synced = 0",
      );

      if (pendingSync && pendingSync.count > 0) {
        notifs.push({
          id: "pending_sync",
          type: "info",
          message: `${pendingSync.count} bản ghi đang chờ đồng bộ`,
          time: "Hiện tại",
        });
      }

      // 2.5 Expiring lots from backend report (paid plans only)
      if (canUseAdvancedReports) {
        try {
          const expiringRes = await api.get<
            { data?: ExpiringLotAlert[] } | ExpiringLotAlert[]
          >("/reports/expiring-lots?days=2&forecastWindow=7");
          const rows = Array.isArray(expiringRes)
            ? expiringRes
            : Array.isArray(expiringRes?.data)
              ? expiringRes.data
              : [];
          const alerts = rows.filter((row) => row.shouldAlert);
          setExpiringLotAlerts(alerts);

          if (alerts.length > 0) {
            notifs.push({
              id: "expiring_lots",
              type: "warning",
              message: `${alerts.length} lô nguyên liệu sắp hết hạn`,
              time: "Hiện tại",
            });
          }
        } catch {
          setExpiringLotAlerts([]);
        }
      } else {
        setExpiringLotAlerts([]);
      }

      // 3. Variance alerts (check for flagged inventory logs in last 24h)
      // Note: local_inventory_logs has is_flagged column, not variance_pct
      const flaggedLogs = await db.getFirstAsync<{ count: number }>(`
        SELECT COUNT(*) as count 
        FROM local_inventory_logs 
        WHERE is_flagged = 1
          AND created_at > datetime('now', '-1 day')
      `);

      if (flaggedLogs && flaggedLogs.count > 0) {
        notifs.push({
          id: "variance",
          type: "error",
          message: `${flaggedLogs.count} cảnh báo kiểm kho đáng ngờ`,
          time: "Trong 24h qua",
        });
      }

      // If no notifications, show a success message
      if (notifs.length === 0) {
        notifs.push({
          id: "all_good",
          type: "info",
          message: "Mọi thứ ổn định, không có cảnh báo",
          time: "Hiện tại",
        });
      }

      setNotifications(notifs);
    } catch (err) {
      console.error("[Dashboard] Failed to load notifications:", err);
    }
  }, [canUseAdvancedReports]);

  // Debug: Log when Dashboard mounts with current businessId
  useEffect(() => {
    console.log("🏠 [Dashboard] Component mounted, businessId:", businessId);
    // Load notifications on mount
    loadNotifications();
  }, [loadNotifications]);

  // Debug: Log when businessId changes
  useEffect(() => {
    console.log("🏠 [Dashboard] businessId changed to:", businessId);
  }, [businessId]);

  // Load today's sales and transfer logs for guards
  const [pendingReminders, setPendingReminders] = useState<any[]>([]);

  const showSalesGuardAlert = useCallback(() => {
    Alert.alert(
      "⚠️ Cần chụp Bán hàng trước",
      "Cần chụp Bán hàng sau lần kiểm kho gần nhất để tính chênh lệch chính xác.",
      [
        {
          text: "Đi tới Bán hàng",
          onPress: () => onOpenInventory("sales"),
          style: "default",
        },
        {
          text: "Hủy",
          style: "cancel",
        },
      ],
    );
  }, [onOpenInventory]);

  const requireSalesBeforeStock = useCallback(
    async (scope: SalesGuardScope): Promise<boolean> => {
      try {
        const db = await getDB();
        const result = await checkSalesPrerequisite(db, scope);
        if (result.hasSales) return true;
        showSalesGuardAlert();
        return false;
      } catch (err) {
        console.error("[Dashboard] checkSalesPrerequisite error:", err);
        Alert.alert(
          "Lỗi",
          "Không thể kiểm tra điều kiện Bán hàng. Vui lòng thử lại.",
        );
        return false;
      }
    },
    [showSalesGuardAlert],
  );

  const loadTodayData = useCallback(async () => {
    try {
      const db = await getDB();
      const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local timezone

      // Check user role - USE AUTHCONTEXT AS SOURCE OF TRUTH
      // DB local_profiles may have stale data from previous accounts
      let isOwnerRole = false;

      if (
        authState.status === "authenticated" &&
        authState.profile?.role === "OWNER"
      ) {
        isOwnerRole = true;
        console.log("[Dashboard] isOwner from AuthContext: true");
      } else {
        // Fallback to DB only if AuthContext is not ready yet
        const userProfile = await db.getFirstAsync<{ role: string }>(
          "SELECT role FROM local_profiles ORDER BY created_at DESC LIMIT 1",
        );
        isOwnerRole = userProfile?.role === "OWNER";
        console.log(
          "[Dashboard] isOwner from DB fallback:",
          isOwnerRole,
          "(Role:",
          userProfile?.role,
          ")",
        );
      }

      setIsOwner(isOwnerRole);

      setProRebaseline(await getProRebaselineState(db));

      // FIX: Migrate old logs with incorrect type values (one-time fix)
      await db.runAsync(
        `UPDATE pending_sync_logs SET type = 'LENT' WHERE type = 'LOAN'`,
      );
      await db.runAsync(
        `UPDATE pending_sync_logs SET type = 'WASTE' WHERE type = 'MARKETING'`,
      );

      // Check if today has any SALES type logs
      const salesLogs = await db.getAllAsync<any>(
        `SELECT id FROM pending_sync_logs WHERE type = 'SALES' AND date(created_at) = ?`,
        [today],
      );
      setHasTodaySales(salesLogs.length > 0);

      // Load today's transfers for widget
      const transfers = await db.getAllAsync<any>(
        `SELECT psl.*, li.name as ingredient_name 
         FROM pending_sync_logs psl 
         LEFT JOIN local_ingredients li ON psl.ingredient_id = li.id
         WHERE psl.type = 'TRANSFER' AND date(psl.created_at) = ?
         ORDER BY psl.created_at DESC`,
        [today],
      );
      setTodayTransfers(transfers);

      // Load ALL today's activities for unified section (Transfers + QuickOuts)
      // Use datetime range to handle timezone correctly (SQLite stores as UTC)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Determine retention days for filter
      // If setting is 0 (unset), fallback to role: STAFF=10, OWNER=30
      const { getLogRetentionDays } = await import("../db"); // Dynamic import to avoid cycles if any
      let retentionDays = await getLogRetentionDays(db);
      if (!retentionDays || retentionDays <= 0) {
        retentionDays = isOwnerRole ? 30 : 10;
      }

      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() - retentionDays);
      const retentionDateStr = retentionDate.toISOString();

      const allActivities = await db.getAllAsync<any>(
        `SELECT id, type, created_at, ai_parsed_json, ingredient_id, ingredient_name, 'pending' as source
         FROM (
          -- 1. Local Pending Logs (Both synced and unsynced) - Source of truth for local actions
           SELECT psl.id, psl.type, psl.created_at, psl.ai_parsed_json, psl.ingredient_id, 
                  li.name as ingredient_name, 
                  COALESCE(psl.final_confirmed_quantity, psl.ai_parsed_quantity) as quantity
           FROM pending_sync_logs psl 
           LEFT JOIN local_ingredients li ON psl.ingredient_id = li.id
           WHERE psl.type IN ('TRANSFER', 'WASTE', 'LENT', 'RETURN_FROM_LOAN', 'IMPORT', 'STOCK', 'STOCK_CHECK', 'AUDIT', 'SALES')
           
           UNION ALL
           
           -- 2. Server History (Synced from others) - Exclude IDs already in pending_sync_logs
           SELECT log.id, log.type, log.created_at, log.ai_parsed_json, log.ingredient_id, 
                  li.name as ingredient_name,
                  COALESCE(log.final_confirmed_quantity, log.ai_parsed_quantity) as quantity
           FROM local_inventory_logs log
           LEFT JOIN local_ingredients li ON log.ingredient_id = li.id
           WHERE log.type IN ('TRANSFER', 'WASTE', 'LENT', 'IMPORT', 'STOCK', 'STOCK_CHECK', 'AUDIT', 'SALES')
             AND log.created_at >= ?
             AND log.id NOT IN (SELECT id FROM pending_sync_logs)
         )
         ORDER BY created_at DESC
         LIMIT 20`,
        [retentionDateStr],
      );

      // Post-process: Extract ingredient name from ai_parsed_json if ingredient_name is null
      const processedActivities = allActivities.map((activity: any) => {
        if (!activity.ingredient_name && activity.ai_parsed_json) {
          try {
            const parsed =
              typeof activity.ai_parsed_json === "string"
                ? JSON.parse(activity.ai_parsed_json)
                : activity.ai_parsed_json;
            const firstItem = parsed?.items?.[0];
            if (firstItem?.ingredient_name) {
              return {
                ...activity,
                ingredient_name: firstItem.ingredient_name,
              };
            }
          } catch {
            // Malformed JSON - ignore and keep ingredient_name as null
          }
        }
        return activity;
      });

      setTodayActivity(processedActivities);

      // Load today's Quick Outs (WASTE/LENT) for dedicated widget
      // Note: LOAN maps to LENT, MARKETING maps to WASTE in database
      const quickOuts = await db.getAllAsync<any>(
        `SELECT psl.*, li.name as ingredient_name 
         FROM pending_sync_logs psl 
         LEFT JOIN local_ingredients li ON psl.ingredient_id = li.id
         WHERE psl.type IN ('WASTE', 'LENT') 
           AND psl.created_at >= ? AND psl.created_at <= ?
         ORDER BY psl.created_at DESC`,
        [todayStart.toISOString(), todayEnd.toISOString()],
      );
      setTodayQuickOuts(quickOuts);

      // Load pending LOAN reminders (due today or earlier, not done)
      try {
        const reminders = await db.getAllAsync<any>(
          `SELECT * FROM local_reminders 
           WHERE is_done = 0 AND date(remind_at) <= ?
           ORDER BY remind_at ASC`,
          [today],
        );
        setPendingReminders(reminders);
      } catch {
        // Table might not exist yet - that's OK
        setPendingReminders([]);
      }
    } catch (err) {
      console.log("[Dashboard] loadTodayData error:", err);
    }
  }, [authState]);

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
        0,
      );
      setTotalValue(total);
      setIngredientCount(ings.length);

      setIngredientCount(ings.length);

      // Get Recipe Count
      const rCount = await InventoryService.getRecipeCount();
      setRecipeCount(rCount);

      // Load low stock items (via hook)
      await refetchLowStock();

      // Load recent activity logs from pending_sync_logs
      const logsDb = await getDB();
      const recentActivity = await logsDb.getAllAsync<{
        id: string;
        type: string;
        ai_parsed_json: string;
        created_at: string;
        location: string;
      }>(
        `SELECT id, type, ai_parsed_json, created_at, location 
         FROM pending_sync_logs 
         ORDER BY created_at DESC 
         LIMIT 10`,
      );
      console.log(
        "[Dashboard] Local pending_sync_logs count:",
        recentActivity.length,
      );
      setRecentLogs(
        recentActivity.map((log) => ({
          id: log.id,
          type: log.type,
          created_at: log.created_at,
          ai_parsed_json: log.ai_parsed_json,
          ingredient_name: null,
          quantity: null,
        })),
      );

      // Also load today's data for guards
      await loadTodayData();
      await loadNotifications();
    } catch (err) {
      console.log("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, [syncModel, loadTodayData, refetchLowStock, loadNotifications]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Note: useFocusEffect unavailable since Dashboard is not inside NavigationContainer
  // Refresh is triggered via pull-to-refresh or when refreshKey changes

  // Watch refreshKey to reload activities when parent triggers (after Quick Out, Transfer)
  useEffect(() => {
    if (refreshKey > 0) {
      console.log("📋 [Dashboard] refreshKey changed, reloading today data...");
      loadTodayData();
    }
  }, [refreshKey, loadTodayData]);

  // SALES → STOCK GUARD:
  // - STANDARD: only BAR requires sales
  // - SIMPLE/FREE: stock check can save without sales prerequisite
  const handleStockSnapPress = async () => {
    if (isStandard) {
      setCurrentSnapMode("stock");
      setShowAreaModal(true);
      return;
    }

    onOpenInventory("stock");
  };

  // Separate refreshing state for pull-to-refresh (like Facebook)
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    console.log("🔄 Pull-to-refresh triggered...");

    try {
      // 0. PUSH local logs to cloud FIRST (before pulling)
      const { syncPendingLogs } = await import("../sync/syncEngine");
      const { getDB } = await import("../db");
      const db = await getDB();
      console.log("📤 Pushing local logs to cloud...");
      await syncPendingLogs(db);
      console.log("📤 Push complete!");

      // 1. Pull data from Supabase to local DB
      const { pullAllData } = await import("../sync/pullSync");
      const pullResult = await pullAllData();
      console.log("📥 Pull complete:", pullResult);

      // 2. Sync model from server
      await syncModel();

      // 3. Reload all data from local DB
      await InventoryService.init();
      // ... reload data handled by loadData call below?
      // Reuse logic manually to ensure refresh
      const ings = await InventoryService.getAll();
      const total = ings.reduce(
        (sum: number, i) => sum + (i.warehouse_qty + i.bar_qty) * i.unit_cost,
        0,
      );
      setTotalValue(total);
      setIngredientCount(ings.length);
      const rCount = await InventoryService.getRecipeCount();
      setRecipeCount(rCount);
      await refetchLowStock();
      await loadNotifications();

      console.log("✅ Refresh complete!");
    } catch (err) {
      console.error("Refresh error:", err);
      Alert.alert(
        "Lỗi cập nhật",
        "Không thể đồng bộ dữ liệu. Vui lòng thử lại.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [syncModel, refetchLowStock, loadNotifications]);

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
      {/* Subscription Banner */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 0 }}>
        {isOwner && subscription.showExpiredBanner && (
          <Pressable
            style={{
              backgroundColor: COLORS.error,
              padding: 12,
              marginBottom: 16,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
            onPress={onOpenSettings}
          >
            <Text style={{ color: "white", fontWeight: "600", flex: 1 }}>
              ⚠️ Gói đã hết hạn. Chạm để nâng cấp.
            </Text>
            <Ionicons name="chevron-forward" size={20} color="white" />
          </Pressable>
        )}

        {isOwner && subscription.showExpiryWarning && (
          <Pressable
            style={{
              backgroundColor: "#F59E0B",
              padding: 12,
              marginBottom: 16,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
            onPress={onOpenSettings}
          >
            <Text style={{ color: "white", fontWeight: "600", flex: 1 }}>
              💡 Gói PRO còn {subscription.daysRemaining} ngày!
            </Text>
            <Ionicons name="chevron-forward" size={20} color="white" />
          </Pressable>
        )}

        {isOwner && subscription.showTrialBanner && (
          <Pressable
            style={{
              backgroundColor: COLORS.success,
              padding: 12,
              marginBottom: 16,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
            onPress={onOpenSettings}
          >
            <Text style={{ color: "white", fontWeight: "600", flex: 1 }}>
              🎉 Dùng thử: còn {subscription.daysRemaining} ngày
            </Text>
            <Ionicons name="chevron-forward" size={20} color="white" />
          </Pressable>
        )}

        {isStandard && proRebaseline.required && (
          <Pressable
            style={{
              backgroundColor: "#2563EB",
              padding: 12,
              marginBottom: 16,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
            onPress={() => {
              setCurrentSnapMode("stock");
              setShowAreaModal(true);
            }}
          >
            <Text style={{ color: "white", fontWeight: "600", flex: 1 }}>
              {proRebaseline.warehouseDone
                ? "Cần kiểm lại Bar để khôi phục Kho Kép."
                : "Cần kiểm lại Kho tổng và Bar để khôi phục Kho Kép."}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="white" />
          </Pressable>
        )}
      </View>
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
          <Text style={{ color: "#94A3B8", fontSize: 16 }}>
            <Ionicons name="settings-outline" size={20} color="#94A3B8" />
          </Text>
        </Pressable>

        {/* Center: Title + Refresh Button */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
            Dashboard
          </Text>
          {/* Sync Status */}
        </View>

        {/* Right Actions Group */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={onOpenPendingList}>
            <Text style={{ color: "#F59E0B", fontSize: 16 }}>👥</Text>
          </Pressable>

          {/* Notification Bell - Owner Only */}
          {isOwner && (
            <Pressable
              onPress={() => setShowNotifications(true)}
              style={{
                padding: 8,
                backgroundColor: "#1C1C1E",
                borderRadius: 20,
              }}
            >
              <Ionicons name="notifications-outline" size={20} color="white" />
              {notifications.length > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    backgroundColor: "#EF4444",
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 2,
                    borderColor: "#121212",
                  }}
                >
                  <Text
                    style={{ color: "white", fontSize: 9, fontWeight: "bold" }}
                  >
                    {notifications.length}
                  </Text>
                </View>
              )}
            </Pressable>
          )}
        </View>
      </View>

      {/* Content with padding */}
      <View style={{ padding: 16 }}>
        {/* Model Banner - Tap to Refresh */}
        <Pressable
          onPress={onRefresh}
          style={{
            backgroundColor: model !== "SIMPLE" ? "#6B8E2320" : "#E07A2F20",
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
              color: model !== "SIMPLE" ? "#6B8E23" : "#E07A2F",
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            Mode: {model}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="refresh-outline" size={14} color="#94A3B8" />
            <Text style={{ color: "#94A3B8", fontSize: 11, marginLeft: 4 }}>
              Nhấn để đồng bộ
            </Text>
          </View>
        </Pressable>

        {/* 🔔 PENDING LENDS WIDGET (LEND/RETURN FEATURE) */}
        {businessId && (
          <PendingLendsWidget
            businessId={businessId}
            refreshKey={refreshKey}
            onReturnComplete={loadTodayData}
          />
        )}

        {expiringLotAlerts.length > 0 && (
          <View
            style={{
              backgroundColor: "#7F1D1D",
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: "#B91C1C",
            }}
          >
            <Text style={{ color: "#FEE2E2", fontWeight: "700", marginBottom: 4 }}>
              ⏳ {expiringLotAlerts.length} lô sắp hết hạn
            </Text>
            <Text style={{ color: "#FECACA", fontSize: 12 }}>
              {expiringLotAlerts
                .slice(0, 2)
                .map((row) => `${row.ingredientName} (${row.daysRemaining} ngày)`)
                .join(" • ")}
            </Text>
          </View>
        )}

        {/* Main Stats - OWNER ONLY per .script */}
        {isOwner && (
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                color: "#64748B",
                fontSize: 12,
                marginBottom: 8,
                textTransform: "uppercase",
              }}
            >
              Tổng quan hôm nay
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 16 }}
            >
              <StatCard
                title="Giá trị kho"
                value={formatCurrency(totalValue)}
                icon="wallet-outline"
                color="#FF9500"
              />
              <StatCard
                title="Sắp hết hàng"
                value={`${lowStockCount} món`}
                icon="alert-circle-outline"
                color="#EF4444"
                isAlert={lowStockCount > 0}
                onPress={() => setShowLowStockModal(true)}
              />
              <StatCard
                title="Tổng nguyên liệu"
                value={ingredientCount}
                icon="cube-outline"
                color="#3B82F6"
                onPress={onOpenIngredients}
              />
              <StatCard
                title="Công thức"
                value={recipeCount}
                icon="restaurant-outline"
                color="#6B8E23"
                onPress={onOpenRecipes}
              />
            </ScrollView>
          </View>
        )}

        {/* Quick Stats - HIDE FOR OWNER (already in StatCards above) */}
        {!isOwner && (
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
        )}

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
              <Ionicons
                name="notifications"
                size={18}
                color="#F59E0B"
                style={{ marginRight: 6 }}
              />
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
                      [r.id],
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
              <Ionicons
                name="clipboard"
                size={18}
                color="#6B8E23"
                style={{ marginRight: 6 }}
              />
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

        {/* 📤 QUICK OUT WIDGET - WASTE/LOAN/MARKETING */}
        {todayQuickOuts.length > 0 && (
          <View
            style={{
              backgroundColor: "#2A1A1A",
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: "#EF444440",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 16, marginRight: 6 }}>📤</Text>
              <Text
                style={{
                  color: "#EF4444",
                  fontSize: 12,
                  fontWeight: "700",
                  flex: 1,
                }}
              >
                XUẤT KHÁC HÔM NAY
              </Text>
              <Text style={{ color: "#64748B", fontSize: 10 }}>
                {todayQuickOuts.length} mục
              </Text>
            </View>
            {todayQuickOuts.slice(0, 3).map((q, idx) => {
              // Parse reason from ai_parsed_json for accurate icon display
              let reason = q.type; // fallback to type
              let reasonLabel = "";
              try {
                const parsed =
                  typeof q.ai_parsed_json === "string"
                    ? JSON.parse(q.ai_parsed_json)
                    : q.ai_parsed_json;
                if (parsed?.reason) reason = parsed.reason;
                if (parsed?.reason_label) reasonLabel = parsed.reason_label;
              } catch {}

              // Ionicons config based on REASON (not type) per UI/UX guidelines
              const iconMap: Record<
                string,
                {
                  name: keyof typeof Ionicons.glyphMap;
                  color: string;
                  label: string;
                }
              > = {
                DAMAGED: {
                  name: "close-circle",
                  color: "#EF4444",
                  label: "Vỡ/Hỏng",
                },
                LOAN: {
                  name: "hand-left",
                  color: "#F59E0B",
                  label: "Cho mượn",
                },
                MARKETING: {
                  name: "gift",
                  color: "#8B5CF6",
                  label: "Mời khách",
                },
                // Fallbacks for type values
                WASTE: {
                  name: "close-circle",
                  color: "#EF4444",
                  label: "Vỡ/Hỏng",
                },
                LENT: {
                  name: "hand-left",
                  color: "#F59E0B",
                  label: "Cho mượn",
                },
              };
              const iconCfg = iconMap[reason] || {
                name: "help-circle" as keyof typeof Ionicons.glyphMap,
                color: "#94A3B8",
                label: reason,
              };
              const typeLabel = reasonLabel || iconCfg.label;
              const time = new Date(q.created_at).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              });

              // Parse ai_parsed_json to get item names (Quick Out saves items array in JSON)
              let itemsText = "";
              try {
                const parsed =
                  typeof q.ai_parsed_json === "string"
                    ? JSON.parse(q.ai_parsed_json)
                    : q.ai_parsed_json;
                const items = parsed?.items || [];
                itemsText = items
                  .map((i: any) => `${i.ingredient_name}: ${i.quantity}`)
                  .join(", ");
              } catch {
                itemsText = q.ingredient_name || "?";
              }

              return (
                <View
                  key={q.id || idx}
                  style={{
                    flexDirection: "row",
                    paddingVertical: 4,
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: "#3A2A2A",
                  }}
                >
                  <Ionicons
                    name={iconCfg.name}
                    size={14}
                    color={iconCfg.color}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={{ color: "#64748B", fontSize: 11, width: 45 }}>
                    {time}
                  </Text>
                  <Text
                    style={{ color: "#B8B3A8", fontSize: 11, flex: 1 }}
                    numberOfLines={1}
                  >
                    {itemsText} • {typeLabel}
                  </Text>
                </View>
              );
            })}
            {todayQuickOuts.length > 3 && (
              <Text
                style={{
                  color: "#64748B",
                  fontSize: 10,
                  textAlign: "center",
                  marginTop: 4,
                }}
              >
                +{todayQuickOuts.length - 3} mục khác
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
              ⚠️ Không ghi lại vào tờ kiểm kê cuối ngày!
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
            3 Snaps - Thao tác nhanh{" "}
            {model === "CHAIN" ? "(Nhiều khu)" : isStandard ? "(Kho Kép)" : "(Kho Đơn)"}
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
              <Ionicons
                name="camera"
                size={28}
                color="#E07A2F"
                style={{ marginBottom: 4 }}
              />
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
              <Ionicons
                name="receipt"
                size={28}
                color="#6B8E23"
                style={{ marginBottom: 4 }}
              />
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
              <Ionicons
                name="cube"
                size={28}
                color="white"
                style={{ marginBottom: 4 }}
              />
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
                  <Ionicons
                    name="swap-horizontal"
                    size={18}
                    color="#94A3B8"
                    style={{ marginRight: 6 }}
                  />
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
                  <Ionicons
                    name="arrow-up-circle"
                    size={18}
                    color="#EF4444"
                    style={{ marginRight: 6 }}
                  />
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
          hasTodaySales={hasTodaySales}
          barDisabled={proRebaseline.required && !proRebaseline.warehouseDone}
          warehouseSpotDisabled={proRebaseline.required}
          onSelect={async (area, mode) => {
            if (proRebaseline.required) {
              if (area === "BAR" && !proRebaseline.warehouseDone) {
                Alert.alert(
                  "Cần kiểm Kho tổng trước",
                  "Sau khi mua lại PRO, hãy kiểm toàn bộ Kho tổng trước rồi mới kiểm Bar.",
                );
                return;
              }

              if (area === "WAREHOUSE" && mode !== "FULL") {
                Alert.alert(
                  "Cần kiểm toàn bộ Kho tổng",
                  "Lần khôi phục Kho Kép cần kiểm toàn bộ Kho tổng để đặt lại số chuẩn.",
                );
                return;
              }
            }

            // BAR requires SALES after latest BAR stock check
            if (area === "BAR" && !proRebaseline.required) {
              const canProceed = await requireSalesBeforeStock("BAR");
              if (!canProceed) {
                return;
              }
            }

            // Show Freeze Alert for FULL_COUNT mode (Warehouse only)
            if (mode === "FULL") {
              Alert.alert(
                "⚠️ ĐÓNG BĂNG KHO",
                "Hãy chuyển HẾT hàng cần thiết qua Bar NGAY BÂY GIỜ.\n\nSau khi bắt đầu kiểm, bạn KHÔNG ĐƯỢC lấy hàng từ Kho Tổng nữa.\n\n⚠️ LƯU Ý: Món nào KHÔNG ĐẾM sẽ bị set về 0!",
                [
                  {
                    text: "Hủy",
                    style: "cancel",
                  },
                  {
                    text: "Đã hiểu, Tiếp tục",
                    style: "destructive",
                    onPress: () => onOpenInventory(currentSnapMode, area, mode),
                  },
                ],
              );
              return;
            }

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

  // Activity item component
  const renderActivityItem = (activity: any, index: number) => {
    const actDate = new Date(activity.created_at);
    const dateStr = actDate.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    });
    const timeStr = actDate.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Get current user name from authState (local activities are usually from current user)
    const userName =
      authState.status === "authenticated"
        ? authState.profile?.fullName ||
          (authState.profile?.role === "OWNER" ? "Chủ quán" : "Nhân viên")
        : "Nhân viên";

    // Parse reason from ai_parsed_json for accurate icon display (MARKETING vs WASTE)
    let displayType = activity.type;
    let reasonLabel = "";
    let checkType = ""; // For STOCK: FULL, SPOT, BAR
    let location = ""; // For STOCK: WAREHOUSE, BAR
    try {
      const parsed =
        typeof activity.ai_parsed_json === "string"
          ? JSON.parse(activity.ai_parsed_json)
          : activity.ai_parsed_json;
      if (parsed?.reason) displayType = parsed.reason;
      if (parsed?.reason_label) reasonLabel = parsed.reason_label;
      // Extract STOCK-specific fields
      if (parsed?.check_type) checkType = parsed.check_type;
      if (parsed?.location) location = parsed.location;
    } catch {}

    // Activity type config - using Ionicons per UI/UX guidelines (no emojis)
    // Uses both type and reason values for flexibility
    const typeConfig: Record<
      string,
      { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }
    > = {
      TRANSFER: {
        icon: "swap-horizontal",
        color: "#6B8E23",
        label: "Chuyển kho",
      },
      // Reason values from QuickOutScreen
      DAMAGED: { icon: "close-circle", color: "#EF4444", label: "Vỡ/Hỏng" },
      LOAN: { icon: "hand-left", color: "#F59E0B", label: "Cho mượn" },
      MARKETING: { icon: "gift", color: "#8B5CF6", label: "Mời khách" },
      // Type values from database
      WASTE: { icon: "close-circle", color: "#EF4444", label: "Vỡ/Hỏng" },
      LENT: { icon: "hand-left", color: "#F59E0B", label: "Cho mượn" },
      IMPORT: {
        icon: "arrow-down-circle",
        color: "#E07A2F",
        label: "Nhập hàng",
      },
      SALES: {
        icon: "cart",
        color: "#22C55E",
        label: "Kết ca",
      },
      RETURN_FROM_LOAN: {
        icon: "arrow-undo-circle",
        color: "#F59E0B",
        label: "Nhận lại hàng",
      },
      STOCK: { icon: "clipboard", color: "#22C55E", label: "Kiểm kho" },
      STOCK_CHECK: { icon: "clipboard", color: "#3B82F6", label: "Kiểm kho" },
      AUDIT: { icon: "search", color: "#3B82F6", label: "Kiểm kê" },
    };

    // Generate detailed label for STOCK type
    let stockDetailLabel = "";
    if (activity.type === "STOCK" || activity.type === "STOCK_CHECK") {
      if (location === "BAR" || checkType === "BAR") {
        stockDetailLabel = "Kiểm quầy bar";
      } else if (checkType === "FULL" || checkType === "STORAGE") {
        stockDetailLabel = "Kiểm kho toàn phần";
      } else if (checkType === "SPOT") {
        stockDetailLabel = "Kiểm kho 1 phần";
      } else {
        stockDetailLabel = "Kiểm kho";
      }
    }

    const config = typeConfig[displayType] ||
      typeConfig[activity.type] || {
        icon: "document-text" as keyof typeof Ionicons.glyphMap,
        color: "#94A3B8",
        label: activity.type,
      };
    // Override label with reasonLabel or stockDetailLabel if available
    const finalLabel = stockDetailLabel || reasonLabel || config.label;
    // Parse quantity info
    let quantityText = "";
    if (activity.ai_parsed_json) {
      try {
        const parsed =
          typeof activity.ai_parsed_json === "string"
            ? JSON.parse(activity.ai_parsed_json)
            : activity.ai_parsed_json;

        // Special format for SALES: show summary instead of items
        if (activity.type === "SALES") {
          const items = parsed?.items || parsed?.items_sold || [];
          const totalRevenue = parsed?.total_revenue || 0;
          const itemCount = items.reduce(
            (sum: number, i: any) => sum + (i.quantity || i.quantity_sold || 1),
            0,
          );

          if (totalRevenue > 0) {
            quantityText = `${itemCount} món, ${formatCurrency(totalRevenue)}`;
          } else if (items.length > 0) {
            quantityText = `${itemCount} món`;
          }
        } else if (
          activity.type === "STOCK" ||
          activity.type === "STOCK_CHECK"
        ) {
          // Special format for STOCK: show counts by type (nguyên liệu vs vật dụng)
          const items = parsed?.items || [];
          if (items.length > 0) {
            // Count ingredients (type !== 'SUPPLY') vs supplies (type === 'SUPPLY')
            let ingredientCount = 0;
            let supplyCount = 0;
            for (const i of items) {
              if (i.type === "SUPPLY" || i.ingredient_type === "SUPPLY") {
                supplyCount++;
              } else {
                ingredientCount++;
              }
            }
            const parts: string[] = [];
            if (ingredientCount > 0)
              parts.push(`${ingredientCount} nguyên liệu`);
            if (supplyCount > 0) parts.push(`${supplyCount} vật dụng`);
            quantityText = parts.join(", ") || `${items.length} mục`;
          }
        } else {
          // Normal format for other types
          const items = parsed?.items || [];
          if (items.length > 0) {
            quantityText = items
              .map((i: any) => {
                // Try multiple fields for ingredient name
                const name =
                  i.ingredient_name ||
                  i.name ||
                  i.rawName ||
                  i.original_name ||
                  "";
                const qty = i.quantity ?? i.stock_qty ?? "";
                const unit = i.unit || "";
                if (!name && !qty) return null;
                return `${name || "—"}: ${qty}${unit ? " " + unit : ""}`;
              })
              .filter(Boolean)
              .join(", ");
          }
        }
      } catch {}
    }
    if (!quantityText && activity.ingredient_name) {
      quantityText = `${activity.ingredient_name}: ${activity.quantity || 1}`;
    }

    return (
      <View
        key={activity.id || index}
        style={{
          backgroundColor: "#1A1A1A",
          borderRadius: 8,
          padding: 12,
          marginBottom: 8,
          marginHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Ionicons
          name={config.icon}
          size={20}
          color={config.color}
          style={{ marginRight: 10 }}
        />
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 2,
            }}
          >
            <Text
              style={{ color: config.color, fontSize: 12, fontWeight: "600" }}
            >
              {finalLabel}
            </Text>
            <Text style={{ color: "#64748B", fontSize: 10, marginLeft: 8 }}>
              {dateStr} {timeStr}
            </Text>
          </View>
          {quantityText ? (
            <Text style={{ color: "#B8B3A8", fontSize: 11 }} numberOfLines={1}>
              {quantityText}
            </Text>
          ) : null}
          <Text style={{ color: "#64748B", fontSize: 10, marginTop: 2 }}>
            <Ionicons name="person" size={10} color="#64748B" /> {userName}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <>
      <View style={{ flex: 1, backgroundColor: "#121212" }}>
        <FlatList
          data={todayActivity}
          renderItem={({ item, index }) => renderActivityItem(item, index)}
          keyExtractor={(item, index) => item.id || `activity_${index}`}
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

      {/* Notification Modal */}
      <NotificationModal
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={notifications}
      />

      {/* Low Stock Detailed Modal */}
      <LowStockModal
        visible={showLowStockModal}
        onClose={() => setShowLowStockModal(false)}
        data={{ ingredients: lowStockIngredients, supplies: lowStockSupplies }}
        isLoading={lowStockLoading}
      />
    </>
  );
}
