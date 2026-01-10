import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Notification {
  id: string;
  type: "warning" | "info" | "success" | "error";
  message: string;
  time: string;
}

interface NotificationModalProps {
  visible: boolean;
  onClose: () => void;
  notifications: Notification[];
}

export const NotificationModal = ({
  visible,
  onClose,
  notifications,
}: NotificationModalProps) => {
  // Use fixed padding instead of useSafeAreaInsets to avoid SafeAreaProvider requirement
  const bottomPadding = 34; // Safe value for notched devices

  const getIcon = (type: string) => {
    switch (type) {
      case "warning":
        return { name: "alert-circle" as const, color: "#F59E0B" }; // Amber for warning
      case "error":
        return { name: "close-circle" as const, color: "#EF4444" }; // Red for error
      case "success":
        return { name: "checkmark-circle" as const, color: "#84CC16" };
      default:
        return { name: "information-circle" as const, color: "#3B82F6" };
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.container, { paddingBottom: bottomPadding }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Thông báo</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
          </View>

          {/* List */}
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Không có thông báo mới</Text>
            }
            renderItem={({ item }) => {
              const iconData = getIcon(item.type);
              return (
                <View style={styles.item}>
                  <Ionicons
                    name={iconData.name}
                    size={24}
                    color={iconData.color}
                    style={{ marginRight: 12 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.message}>{item.message}</Text>
                    <Text style={styles.time}>{item.time}</Text>
                  </View>
                </View>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  container: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "60%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#27272A",
  },
  title: { fontSize: 18, fontWeight: "bold", color: "white" },
  closeBtn: { padding: 4 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#27272A",
  },
  message: { color: "white", fontSize: 14, marginBottom: 4 },
  time: { color: "#A1A1AA", fontSize: 12 },
  emptyText: { color: "#A1A1AA", textAlign: "center", marginTop: 20 },
});
