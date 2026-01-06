import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  trend?: number; // % thay đổi (ví dụ: 12.5 hoặc -2.3)
  isAlert?: boolean; // Viền đỏ cảnh báo
  onPress?: () => void; // Optional tap action
}

export const StatCard = ({
  title,
  value,
  icon,
  color,
  trend,
  isAlert,
  onPress,
}: StatCardProps) => {
  const content = (
    <View
      style={[
        styles.card,
        { borderLeftColor: color, borderLeftWidth: 4 },
        isAlert && styles.alertBorder,
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        {trend !== undefined && (
          <View
            style={[
              styles.trendBadge,
              { backgroundColor: trend >= 0 ? "#84CC1620" : "#EF444420" },
            ]}
          >
            <Ionicons
              name={trend >= 0 ? "arrow-up" : "arrow-down"}
              size={12}
              color={trend >= 0 ? "#84CC16" : "#EF4444"}
            />
            <Text
              style={[
                styles.trendText,
                { color: trend >= 0 ? "#84CC16" : "#EF4444" },
              ]}
            >
              {Math.abs(trend)}%
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.value}>{value}</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    padding: 12,
    width: 150, // Fixed width for horizontal scroll
    marginRight: 12,
    justifyContent: "space-between",
  },
  alertBorder: {
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  iconBox: {
    padding: 6,
    borderRadius: 8,
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  trendText: {
    fontSize: 10,
    fontWeight: "bold",
    marginLeft: 2,
  },
  value: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
    marginBottom: 4,
  },
  title: {
    fontSize: 12,
    color: "#A1A1AA",
  },
});
