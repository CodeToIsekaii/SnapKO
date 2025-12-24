/**
 * Dashboard Screen
 * Shows quick overview and navigation to 3-Snap actions
 */

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  background: "#121212",
  surface: "#1A1A1A",
  primary: "#E07A2F",
  success: "#6B8E23",
  warning: "#FFC857",
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
  border: "#2A2A2A",
};

// 3-Snap Workflow quick actions per .antigravityrules Section D
const SNAP_ACTIONS = [
  {
    id: "import",
    title: "Nhập hàng",
    subtitle: "Chụp hóa đơn nhập",
    icon: "arrow-down-circle",
    color: COLORS.success,
    route: "/camera/import",
  },
  {
    id: "sales",
    title: "Ghi bán",
    subtitle: "Chụp báo cáo POS",
    icon: "arrow-up-circle",
    color: COLORS.primary,
    route: "/camera/sales",
  },
  {
    id: "stock",
    title: "Kiểm kho",
    subtitle: "Chụp phiếu kiểm",
    icon: "clipboard",
    color: COLORS.warning,
    route: "/camera/stock",
  },
];

export default function DashboardScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Xin chào!</Text>
        <Text style={styles.date}>
          {new Date().toLocaleDateString("vi-VN", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </Text>
      </View>

      {/* 3-Snap Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
        <View style={styles.snapGrid}>
          {SNAP_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={styles.snapCard}
              onPress={() => router.push(action.route as any)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.snapIcon,
                  { backgroundColor: action.color + "20" },
                ]}
              >
                <Ionicons
                  name={action.icon as any}
                  size={32}
                  color={action.color}
                />
              </View>
              <Text style={styles.snapTitle}>{action.title}</Text>
              <Text style={styles.snapSubtitle}>{action.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Quick Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hôm nay</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Phiếu nhập</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Cảnh báo</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>✓</Text>
            <Text style={styles.statLabel}>Đã đồng bộ</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  date: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  snapGrid: {
    flexDirection: "row",
    gap: 12,
  },
  snapCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  snapIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  snapTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  snapSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});
