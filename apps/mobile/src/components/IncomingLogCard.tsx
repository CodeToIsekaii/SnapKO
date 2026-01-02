import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { IncomingItem } from "../hooks/useTodayIncoming";

interface Props {
  items: IncomingItem[];
}

export function IncomingLogCard({ items }: Props) {
  if (!items || items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.title}>
          CHÚ Ý: ĐÃ NHẬP TRÊN APP (KHÔNG GHI GIẤY)
        </Text>
      </View>

      <View style={styles.content}>
        {items.map((item, index) => (
          <View key={index} style={styles.row}>
            <Text style={styles.index}>{index + 1}.</Text>
            <View style={{ flex: 1 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.qty}>
                  {item.qty} {item.unit}
                </Text>
              </View>
              <Text style={styles.time}>
                {new Date(item.created_at).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                • {item.source === "IMPORT" ? "Nhập mới" : "Chuyển kho"}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.footer}>
        (Tổng: {items.length} phiếu nhập/chuyển hôm nay)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFBEB", // Yellow-50
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFC857", // Yellow-400
    padding: 12,
    marginBottom: 16,
    marginHorizontal: 16, // Assuming screen padding matches
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
    paddingBottom: 8,
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B45309", // Yellow-700
    textTransform: "uppercase",
  },
  content: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  index: {
    fontSize: 12,
    color: "#92400E",
    marginRight: 6,
    width: 20,
  },
  name: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1F2937",
  },
  qty: {
    fontSize: 13,
    fontWeight: "700",
    color: "#059669", // Emerald-600
  },
  time: {
    fontSize: 11,
    color: "#6B7280",
  },
  footer: {
    marginTop: 10,
    fontSize: 11,
    color: "#92400E",
    textAlign: "center",
    fontStyle: "italic",
  },
});
