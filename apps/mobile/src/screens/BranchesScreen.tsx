import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import {
  buildMigrationOutlets,
  MigrationOutlet,
  moveAreaToNextOutlet,
} from "./branchMigration";

type Branch = {
  id: string;
  name: string;
  code?: string | null;
  migrationKey?: string | null;
  type: "CENTRAL_WAREHOUSE" | "OUTLET";
  isActive: boolean;
  storageAreas?: Array<{ id: string; name: string }>;
};

export default function BranchesScreen() {
  const { authState, refreshProfile } = useAuth();
  const profile =
    authState.status === "authenticated" ? authState.profile : null;
  const isOwner = profile?.role === "OWNER";
  const chainState = profile?.chainState ?? "ACTIVE";
  const outletLimit = profile?.chainOutletLimit ?? 0;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [migrationOutlets, setMigrationOutlets] = useState<MigrationOutlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setBranches((await api.get<Branch[]>("/branches")) ?? []);
    } catch (error: any) {
      Alert.alert("Không tải được chi nhánh", error?.message ?? "Vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (chainState === "MIGRATION_REQUIRED" && migrationOutlets.length === 0) {
      setMigrationOutlets(buildMigrationOutlets(branches));
    }
  }, [branches, chainState, migrationOutlets.length]);

  const areaNames = useMemo(
    () =>
      new Map(
        branches.flatMap((branch) =>
          (branch.storageAreas ?? []).map((area) => [area.id, area.name] as const),
        ),
      ),
    [branches],
  );

  const outlets = useMemo(
    () => branches.filter((branch) => branch.type === "OUTLET" && branch.isActive),
    [branches],
  );

  const run = async (task: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await task();
      await Promise.all([load(), refreshProfile()]);
    } catch (error: any) {
      Alert.alert("Không thể cập nhật", error?.message ?? "Vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  };

  const createOutlet = () => {
    const name = newName.trim();
    if (!name) return;
    void run(async () => {
      await api.post("/branches", { name, type: "OUTLET" });
      setNewName("");
    });
  };

  const confirmMigration = () =>
    run(() => {
      const centralMappings = branches
        .filter(
          (branch) =>
            branch.type === "CENTRAL_WAREHOUSE" && branch.storageAreas?.length,
        )
        .map((branch) => ({
          migrationKey: "default-central",
          name: branch.name,
          code: branch.code || undefined,
          type: branch.type,
          storageAreaIds: branch.storageAreas!.map((area) => area.id),
        }));
      return api.post("/branches/migration", {
        mappings: [
          ...centralMappings,
          ...migrationOutlets.map((outlet) => ({
            ...outlet,
            type: "OUTLET" as const,
          })),
        ],
      });
    });

  const confirmSelection = () => {
    if (selected.length !== outletLimit) {
      Alert.alert("Chưa đủ outlet", `Bro cần chọn đúng ${outletLimit} outlet.`);
      return;
    }
    void run(() => api.post("/branches/selection", { branchIds: selected }));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#E07A2F" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chi nhánh</Text>
      {chainState !== "ACTIVE" && (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>{chainState}</Text>
          <Text style={styles.warningText}>
            Dữ liệu vận hành đang ở chế độ chỉ đọc cho đến khi Owner hoàn tất bước bắt buộc.
          </Text>
          {isOwner && chainState === "MIGRATION_REQUIRED" && (
            <View style={styles.migrationEditor}>
              <Text style={styles.migrationHint}>
                Chạm vào khu vực để chuyển sang outlet kế tiếp.
              </Text>
              {migrationOutlets.map((outlet, index) => (
                <View key={outlet.migrationKey} style={styles.migrationOutlet}>
                  <TextInput
                    value={outlet.name}
                    onChangeText={(name) =>
                      setMigrationOutlets((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name } : item,
                        ),
                      )
                    }
                    placeholder={`Tên outlet ${index + 1}`}
                    style={styles.migrationName}
                  />
                  <View style={styles.areaList}>
                    {outlet.storageAreaIds.length ? (
                      outlet.storageAreaIds.map((areaId) => (
                        <TouchableOpacity
                          key={areaId}
                          style={styles.areaChip}
                          onPress={() =>
                            setMigrationOutlets((current) =>
                              moveAreaToNextOutlet(current, areaId),
                            )
                          }
                        >
                          <Text style={styles.areaChipText}>
                            {areaNames.get(areaId) ?? areaId} →
                          </Text>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <Text style={styles.emptyArea}>Sẽ tạo Kho và Bar mặc định</Text>
                    )}
                  </View>
                </View>
              ))}
              <TouchableOpacity
                disabled={saving || migrationOutlets.some((outlet) => !outlet.name.trim())}
                style={styles.primaryButton}
                onPress={() => void confirmMigration()}
              >
                <Text style={styles.primaryText}>Xác nhận sắp xếp dữ liệu hiện tại</Text>
              </TouchableOpacity>
            </View>
          )}
          {isOwner && chainState === "BRANCH_SELECTION_REQUIRED" && (
            <TouchableOpacity
              disabled={saving}
              style={styles.primaryButton}
              onPress={confirmSelection}
            >
              <Text style={styles.primaryText}>
                Giữ {outletLimit} outlet đã chọn
              </Text>
            </TouchableOpacity>
          )}
          {isOwner && chainState === "HUB_REBASELINE_REQUIRED" && (
            <TouchableOpacity
              disabled={saving}
              style={styles.primaryButton}
              onPress={() =>
                void run(() => api.post("/branches/hub-rebaseline", { confirmed: true }))
              }
            >
              <Text style={styles.primaryText}>Xác nhận đã kiểm toàn bộ kho tổng</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {isOwner && chainState === "ACTIVE" && profile?.effectiveTier === "CHAIN" && (
        <View style={styles.createRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Tên outlet mới"
            style={styles.input}
          />
          <TouchableOpacity disabled={saving} style={styles.addButton} onPress={createOutlet}>
            <Ionicons name="add" color="#fff" size={22} />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={branches}
        keyExtractor={(branch) => branch.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const canSelect =
            isOwner &&
            chainState === "BRANCH_SELECTION_REQUIRED" &&
            item.type === "OUTLET";
          const checked = selected.includes(item.id);
          return (
            <TouchableOpacity
              disabled={!canSelect}
              style={styles.card}
              onPress={() =>
                setSelected((current) =>
                  checked
                    ? current.filter((id) => id !== item.id)
                    : [...current, item.id],
                )
              }
            >
              <Ionicons
                name={item.type === "CENTRAL_WAREHOUSE" ? "cube-outline" : "business-outline"}
                size={22}
                color="#E07A2F"
              />
              <View style={styles.cardBody}>
                <Text style={styles.branchName}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.type === "CENTRAL_WAREHOUSE" ? "Kho tổng miễn phí" : "Outlet tính phí"}
                  {item.storageAreas?.length
                    ? ` · ${item.storageAreas.map((area) => area.name).join(", ")}`
                    : ""}
                </Text>
              </View>
              {canSelect && (
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={22}
                  color={checked ? "#6B8E23" : "#9CA3AF"}
                />
              )}
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          outlets.length > 0 ? (
            <Text style={styles.footer}>
              {outlets.length}/{outletLimit || outlets.length} outlet đang hoạt động
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAF9F7", paddingTop: 56 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", paddingHorizontal: 16, marginBottom: 12 },
  warning: { margin: 16, padding: 14, borderRadius: 12, backgroundColor: "#FFF7ED" },
  warningTitle: { fontWeight: "700", color: "#C2410C" },
  warningText: { marginTop: 6, color: "#6B7280", lineHeight: 20 },
  primaryButton: { marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: "#E07A2F" },
  primaryText: { color: "#fff", textAlign: "center", fontWeight: "700" },
  migrationEditor: { marginTop: 12, gap: 8 },
  migrationHint: { color: "#9A3412", fontSize: 12 },
  migrationOutlet: { padding: 10, borderRadius: 8, backgroundColor: "#fff" },
  migrationName: { borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingVertical: 6, fontWeight: "700" },
  areaList: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  areaChip: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, backgroundColor: "#FFEDD5" },
  areaChipText: { color: "#9A3412", fontSize: 12 },
  emptyArea: { color: "#6B7280", fontSize: 12, fontStyle: "italic" },
  createRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  input: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, padding: 10 },
  addButton: { width: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#6B8E23" },
  list: { padding: 16, gap: 10 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 14, borderRadius: 12 },
  cardBody: { flex: 1, marginLeft: 10 },
  branchName: { fontWeight: "700", color: "#1F2937" },
  meta: { marginTop: 4, fontSize: 12, color: "#6B7280" },
  footer: { marginTop: 12, textAlign: "center", color: "#6B7280" },
});
