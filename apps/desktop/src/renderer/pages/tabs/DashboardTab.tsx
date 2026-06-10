// src/pages/tabs/DashboardTab.tsx - Dashboard/COGS Tab
// SOLID: Presentational component - receives data via props

import React from "react";
import { COGSReport, ActivityLog } from "../../types";
import { COGSDashboard } from "../../components/COGSChart";
import { ActivityLogTable } from "../../components/ActivityLogTable";
import { COLORS } from "../../styles/theme";
import { BarChart3, RefreshCw, Download } from "lucide-react";

interface DashboardTabProps {
  cogsReport: COGSReport | null;
  loading: boolean;
  logs: ActivityLog[];
  onExport: () => Promise<any>;
  onRefresh: () => Promise<void>;
}

export function DashboardTab({
  cogsReport,
  loading,
  logs,
  onExport,
  onRefresh,
}: DashboardTabProps) {
  const handleExport = async () => {
    const result = await onExport();
    if (result?.success) {
      alert("Đã xuất báo cáo COGS thành công!");
    }
  };

  if (loading) {
    return (
      <div style={styles.loading}>
        <p>Đang tải báo cáo...</p>
      </div>
    );
  }

  if (!cogsReport) {
    return (
      <div style={styles.empty}>
        <p>Không có dữ liệu báo cáo</p>
        <button onClick={onRefresh} style={styles.refreshButton}>
          <RefreshCw size={14} style={{ marginRight: 6 }} />
          Tải lại
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header Actions */}
      <div style={styles.header}>
        <h2 style={styles.title}>
          <BarChart3
            size={22}
            color={COLORS.primary}
            style={{ marginRight: 8 }}
          />
          Dashboard COGS
        </h2>
        <div style={styles.actions}>
          <button onClick={onRefresh} style={styles.actionButton}>
            <RefreshCw size={14} style={{ marginRight: 6 }} />
            Làm mới
          </button>
          <button onClick={handleExport} style={styles.exportButton}>
            <Download size={14} style={{ marginRight: 6 }} />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* COGS Dashboard Charts */}
      <COGSDashboard
        barData={(cogsReport.monthly || []).map((m) => ({
          name: (m as any).month ?? (m as any).name ?? "",
          warehouse: m.warehouse,
          bar: m.bar,
        }))}
        pieData={cogsReport.losses || []}
        summary={{
          totalValue: cogsReport.summary?.totalValue || 0,
          itemCount: cogsReport.summary?.itemCount || 0,
          lowStockCount: cogsReport.summary?.lowStockCount || 0,
          monthlyChange: 0,
        }}
      />

      {/* Activity Logs */}
      <ActivityLogTable logs={logs} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    color: COLORS.textPrimary,
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    padding: "10px 16px",
    backgroundColor: "transparent",
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
  },
  exportButton: {
    padding: "10px 16px",
    backgroundColor: COLORS.positive,
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  loading: {
    display: "flex",
    justifyContent: "center",
    padding: 40,
    color: COLORS.textSecondary,
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 40,
    color: COLORS.textSecondary,
  },
  refreshButton: {
    marginTop: 16,
    padding: "10px 20px",
    backgroundColor: COLORS.primary,
    color: "white",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
};
