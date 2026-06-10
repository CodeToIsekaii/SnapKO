import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { api } from "../services/api";

interface TransferItem {
  ingredientId: string;
  quantity: number;
}

interface Transfer {
  id: string;
  status: string;
  notes: string | null;
  createdAt: string;
  fromArea: { id: string; name: string };
  toArea: { id: string; name: string };
  itemsJson: TransferItem[];
  createdBy: { id: string; fullName: string | null } | null;
}

interface PendingTransfersScreenProps {
  onBack: () => void;
}

export default function PendingTransfersScreen({
  onBack,
}: PendingTransfersScreenProps) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await api.get<Transfer[]>(
        "/inventory/transfers?status=PENDING"
      );
      setTransfers(Array.isArray(res) ? res : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleAccept = async (id: string) => {
    setProcessingId(id);
    try {
      await api.post(`/inventory/transfers/${id}/accept`);
      setTransfers((prev) => prev.filter((t) => t.id !== id));
    } catch {
      Alert.alert("Lỗi", "Không thể nhận hàng. Thử lại sau.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = (id: string) => {
    Alert.prompt(
      "Từ chối transfer",
      "Nhập lý do từ chối (tuỳ chọn):",
      async (reason) => {
        setProcessingId(id);
        try {
          await api.post(`/inventory/transfers/${id}/reject`, {
            reason: reason || undefined,
          });
          setTransfers((prev) => prev.filter((t) => t.id !== id));
        } catch {
          Alert.alert("Lỗi", "Không thể từ chối transfer. Thử lại sau.");
        } finally {
          setProcessingId(null);
        }
      },
      "plain-text",
      "",
      "default"
    );
  };

  const renderItem = ({ item }: { item: Transfer }) => {
    const isProcessing = processingId === item.id;
    const itemCount = Array.isArray(item.itemsJson) ? item.itemsJson.length : 0;
    const date = new Date(item.createdAt).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <View style={styles.card}>
        <View style={styles.route}>
          <Text style={styles.area}>{item.fromArea?.name ?? "?"}</Text>
          <Text style={styles.arrow}> → </Text>
          <Text style={styles.area}>{item.toArea?.name ?? "?"}</Text>
        </View>

        <Text style={styles.meta}>
          {itemCount} mặt hàng · {date}
          {item.createdBy?.fullName ? ` · ${item.createdBy.fullName}` : ""}
        </Text>

        {item.notes ? (
          <Text style={styles.notes}>"{item.notes}"</Text>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnAccept]}
            onPress={() => handleAccept(item.id)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnText}>✓ Nhận hàng</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnReject]}
            onPress={() => handleReject(item.id)}
            disabled={isProcessing}
          >
            <Text style={[styles.btnText, { color: "#E63946" }]}>✕ Từ chối</Text>
          </TouchableOpacity>
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
        <Text style={styles.title}>Transfer đang chờ</Text>
        {transfers.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{transfers.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color="#E07A2F"
          style={{ marginTop: 40 }}
        />
      ) : (
        <FlatList
          data={transfers}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#E07A2F"
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Không có transfer nào đang chờ</Text>
          }
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  back: { marginRight: 4 },
  backText: { color: "#E07A2F", fontSize: 14 },
  title: { fontSize: 18, fontWeight: "700", color: "#F5F3EF", flex: 1 },
  countBadge: {
    backgroundColor: "#E63946",
    borderRadius: 12,
    minWidth: 24,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: "center",
  },
  countText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  route: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  area: { fontSize: 15, fontWeight: "600", color: "#F5F3EF" },
  arrow: { fontSize: 15, color: "#E07A2F" },
  meta: { fontSize: 12, color: "#B8B3A8", marginBottom: 6 },
  notes: { fontSize: 13, color: "#B8B3A8", fontStyle: "italic", marginBottom: 8 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnAccept: { backgroundColor: "#E07A2F" },
  btnReject: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#E63946",
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  empty: {
    color: "#B8B3A8",
    textAlign: "center",
    marginTop: 60,
    fontSize: 14,
  },
});
