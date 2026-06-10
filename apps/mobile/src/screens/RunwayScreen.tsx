import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { api } from "../services/api";

interface RunwayItem {
  ingredientId: string;
  name: string;
  unit: string | null;
  currentQty: number;
  avgDailyUsage: number;
  runwayDays: number | null;
  alertLevel: "critical" | "warning" | "ok";
}

const ALERT_COLOR: Record<RunwayItem["alertLevel"], string> = {
  critical: "#DC2626",
  warning: "#FBBF24",
  ok: "#10B981",
};

const ALERT_LABEL: Record<RunwayItem["alertLevel"], string> = {
  critical: "Sắp hết",
  warning: "Cảnh báo",
  ok: "Ổn định",
};

interface RunwayScreenProps {
  onBack: () => void;
}

export default function RunwayScreen({ onBack }: RunwayScreenProps) {
  const [items, setItems] = useState<RunwayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState(7);

  const loadData = useCallback(async () => {
    try {
      const res = await api.get<RunwayItem[]>(
        `/reports/runway?days=${days}`
      );
      setItems(Array.isArray(res) ? res : []);
    } catch {
      // ignore — will show empty list
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const renderItem = ({ item }: { item: RunwayItem }) => {
    const color = ALERT_COLOR[item.alertLevel];
    const label = ALERT_LABEL[item.alertLevel];
    return (
      <View style={[styles.row, { borderLeftColor: color }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            Hiện: {item.currentQty.toFixed(1)} {item.unit ?? ""} · Dùng{" "}
            {item.avgDailyUsage.toFixed(2)}/ngày
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.days, { color }]}>
            {item.runwayDays !== null ? `${item.runwayDays} ngày` : "—"}
          </Text>
          <View style={[styles.badge, { backgroundColor: color + "33" }]}>
            <Text style={[styles.badgeText, { color }]}>{label}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.title}>⚠ Cảnh báo kho</Text>
        <View style={styles.daysPicker}>
          {[7, 14, 30].map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.dayBtn, days === d && styles.dayBtnActive]}
              onPress={() => setDays(d)}
            >
              <Text style={[styles.dayBtnText, days === d && { color: "#fff" }]}>
                {d}n
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#E07A2F" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.ingredientId}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#E07A2F"
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Không có dữ liệu bán hàng để tính runway</Text>
          }
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#2A2A2A" },
  back: { marginBottom: 8 },
  backText: { color: "#E07A2F", fontSize: 14 },
  title: { fontSize: 20, fontWeight: "700", color: "#F5F3EF", marginBottom: 12 },
  daysPicker: { flexDirection: "row", gap: 8 },
  dayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  dayBtnActive: { backgroundColor: "#E07A2F", borderColor: "#E07A2F" },
  dayBtnText: { color: "#B8B3A8", fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E1E1E",
    borderLeftWidth: 4,
  },
  name: { fontSize: 15, fontWeight: "600", color: "#F5F3EF" },
  meta: { fontSize: 12, color: "#B8B3A8", marginTop: 2 },
  days: { fontSize: 16, fontWeight: "700" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 4 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  empty: { color: "#B8B3A8", textAlign: "center", marginTop: 60, fontSize: 14 },
});
