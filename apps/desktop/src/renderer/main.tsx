import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom/client";

// Types
interface Ingredient {
  id: string;
  name: string;
  base_unit: string;
  warehouse_qty: number;
  bar_qty: number;
  unit_cost: number;
}

interface PendingLog {
  id: string;
  type: string;
  created_at: string;
}

interface SyncStatus {
  pending: number;
  lastSync: string | null;
  syncing: boolean;
}

// Main App
function App() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [pendingLogs, setPendingLogs] = useState<PendingLog[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    pending: 0,
    lastSync: null,
    syncing: false,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"inventory" | "logs" | "print">(
    "inventory"
  );

  // Load data from IPC
  const loadData = useCallback(async () => {
    try {
      const [ing, logs] = await Promise.all([
        (window as any).electronAPI?.getIngredients?.() ?? [],
        (window as any).electronAPI?.getPendingLogs?.() ?? [],
      ]);
      setIngredients(ing);
      setPendingLogs(logs);
      setSyncStatus((s) => ({ ...s, pending: logs.length }));
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [loadData]);

  // Sync pending logs
  const handleSync = async () => {
    setSyncStatus((s) => ({ ...s, syncing: true }));
    try {
      // Call sync API
      const result = await (window as any).electronAPI?.syncLogs?.();
      if (result?.success) {
        setSyncStatus({
          pending: 0,
          lastSync: new Date().toISOString(),
          syncing: false,
        });
        loadData();
      }
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setSyncStatus((s) => ({ ...s, syncing: false }));
    }
  };

  // Print inventory
  const handlePrint = async () => {
    try {
      await (window as any).electronAPI?.printInventory?.(ingredients);
    } catch (err) {
      console.error("Print error:", err);
    }
  };

  // Calculate totals
  const totalValue = ingredients.reduce(
    (sum, ing) => sum + (ing.warehouse_qty + ing.bar_qty) * ing.unit_cost,
    0
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>SnapKO Desktop</h1>
          <p style={styles.subtitle}>Quản lý kho Offline-First</p>
        </div>
        <div style={styles.syncStatus}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: syncStatus.pending > 0 ? "#F59E0B" : "#22C55E",
              display: "inline-block",
              marginRight: 8,
            }}
          />
          {syncStatus.pending > 0 ? `${syncStatus.pending} pending` : "Synced"}
          <button
            onClick={handleSync}
            disabled={syncStatus.syncing || syncStatus.pending === 0}
            style={styles.syncButton}
          >
            {syncStatus.syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab("inventory")}
          style={{
            ...styles.tab,
            backgroundColor:
              activeTab === "inventory" ? "#3B82F6" : "transparent",
          }}
        >
          📦 Tồn kho
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          style={{
            ...styles.tab,
            backgroundColor: activeTab === "logs" ? "#3B82F6" : "transparent",
          }}
        >
          📋 Nhật ký
        </button>
        <button
          onClick={() => setActiveTab("print")}
          style={{
            ...styles.tab,
            backgroundColor: activeTab === "print" ? "#3B82F6" : "transparent",
          }}
        >
          🖨️ In phiếu
        </button>
      </div>

      {/* Content */}
      <main style={styles.main}>
        {loading ? (
          <p>Đang tải...</p>
        ) : activeTab === "inventory" ? (
          <>
            {/* Summary */}
            <div style={styles.summary}>
              <div style={styles.summaryCard}>
                <span style={{ color: "#94A3B8" }}>Tổng giá trị</span>
                <span
                  style={{ fontSize: 24, fontWeight: 700, color: "#22C55E" }}
                >
                  {totalValue.toLocaleString("vi-VN")} đ
                </span>
              </div>
              <div style={styles.summaryCard}>
                <span style={{ color: "#94A3B8" }}>Nguyên liệu</span>
                <span style={{ fontSize: 24, fontWeight: 700 }}>
                  {ingredients.length}
                </span>
              </div>
            </div>

            {/* Ingredients Table */}
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Tên</th>
                  <th style={styles.th}>Kho</th>
                  <th style={styles.th}>Quầy</th>
                  <th style={styles.th}>Đơn giá</th>
                  <th style={styles.th}>Giá trị</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing) => (
                  <tr key={ing.id}>
                    <td style={styles.td}>{ing.name}</td>
                    <td style={styles.td}>
                      {ing.warehouse_qty} {ing.base_unit}
                    </td>
                    <td style={styles.td}>
                      {ing.bar_qty} {ing.base_unit}
                    </td>
                    <td style={styles.td}>
                      {ing.unit_cost.toLocaleString("vi-VN")} đ
                    </td>
                    <td style={styles.td}>
                      {(
                        (ing.warehouse_qty + ing.bar_qty) *
                        ing.unit_cost
                      ).toLocaleString("vi-VN")}{" "}
                      đ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : activeTab === "logs" ? (
          <div>
            <h3>Nhật ký chờ sync</h3>
            {pendingLogs.length === 0 ? (
              <p style={{ color: "#64748B" }}>Không có log chờ sync</p>
            ) : (
              pendingLogs.map((log) => (
                <div key={log.id} style={styles.logItem}>
                  <span style={styles.logType}>{log.type}</span>
                  <span style={{ color: "#94A3B8" }}>
                    {new Date(log.created_at).toLocaleString("vi-VN")}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div>
            <h3>In phiếu kiểm kê</h3>
            <p style={{ color: "#94A3B8", marginBottom: 16 }}>
              In danh sách tồn kho hiện tại ra máy in nhiệt/USB.
            </p>
            <button onClick={handlePrint} style={styles.printButton}>
              🖨️ In phiếu ({ingredients.length} nguyên liệu)
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <span>
          SnapKO v1.0 | Last sync:{" "}
          {syncStatus.lastSync
            ? new Date(syncStatus.lastSync).toLocaleString("vi-VN")
            : "Never"}
        </span>
      </footer>
    </div>
  );
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "system-ui, -apple-system, sans-serif",
    backgroundColor: "#0F172A",
    color: "white",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    borderBottom: "1px solid #1E293B",
  },
  title: { margin: 0, fontSize: 20, fontWeight: 700 },
  subtitle: { margin: 0, fontSize: 12, color: "#64748B" },
  syncStatus: { display: "flex", alignItems: "center", gap: 8, fontSize: 14 },
  syncButton: {
    padding: "6px 12px",
    backgroundColor: "#3B82F6",
    color: "white",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    marginLeft: 8,
  },
  tabs: {
    display: "flex",
    gap: 8,
    padding: "12px 24px",
    borderBottom: "1px solid #1E293B",
  },
  tab: {
    padding: "8px 16px",
    border: "none",
    borderRadius: 8,
    color: "white",
    cursor: "pointer",
    fontSize: 14,
  },
  main: { flex: 1, padding: 24, overflow: "auto" },
  summary: { display: "flex", gap: 16, marginBottom: 24 },
  summaryCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 150,
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    padding: "12px 8px",
    borderBottom: "1px solid #334155",
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: 600,
  },
  td: {
    padding: "12px 8px",
    borderBottom: "1px solid #1E293B",
  },
  logItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: "1px solid #1E293B",
  },
  logType: {
    backgroundColor: "#3B82F6",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 12,
  },
  printButton: {
    padding: "12px 24px",
    backgroundColor: "#22C55E",
    color: "white",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 600,
  },
  footer: {
    padding: "12px 24px",
    borderTop: "1px solid #1E293B",
    fontSize: 12,
    color: "#64748B",
  },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
