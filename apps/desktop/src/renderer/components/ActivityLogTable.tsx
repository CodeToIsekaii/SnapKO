import React, { useState } from "react";
import { COLORS, SHADOWS } from "../styles/theme";
import { ScrollText, ChevronDown, ChevronUp } from "lucide-react";
import { ActivityLog, ActivityLogItem } from "../types";

interface ActivityLogTableProps {
  logs: ActivityLog[];
}

export const ActivityLogTable: React.FC<ActivityLogTableProps> = ({ logs }) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div
      style={{ ...styles.container, minHeight: 100, boxShadow: SHADOWS.card }}
    >
      <h3
        style={{
          ...styles.title,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <ScrollText size={18} color={COLORS.primary} />
        Nhật ký hoạt động
      </h3>
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Thời gian</th>
              <th style={styles.th}>Nhân viên</th>
              <th style={styles.th}>Thao tác</th>
              <th style={styles.th}>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} style={styles.empty}>
                  Chưa có hoạt động nào gần đây
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isExpandable = log.items && log.items.length > 0;
                const isExpanded = expandedRows.has(log.id);

                return (
                  <React.Fragment key={log.id}>
                    <tr
                      style={{
                        ...styles.tr,
                        cursor: isExpandable ? "pointer" : "default",
                      }}
                      onClick={() => isExpandable && toggleRow(log.id)}
                    >
                      <td style={styles.td}>
                        {new Date(log.created_at).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        <span style={styles.date}>
                          {new Date(log.created_at).toLocaleDateString(
                            "vi-VN",
                            {
                              day: "2-digit",
                              month: "2-digit",
                            },
                          )}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.badge}>{log.staff_name}</div>
                      </td>
                      <td style={styles.td}>
                        <span style={getActionStyle(log.action)}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ ...styles.td, color: COLORS.textSecondary }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span style={{ flex: 1 }}>{log.details}</span>
                          {isExpandable && (
                            <span style={styles.expandIcon}>
                              {isExpanded ? (
                                <ChevronUp size={16} />
                              ) : (
                                <ChevronDown size={16} />
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Expanded row with items */}
                    {isExpanded && log.items && (
                      <tr style={styles.expandedRow}>
                        <td colSpan={4} style={styles.expandedTd}>
                          <div style={styles.itemsGrid}>
                            {log.items.map(
                              (item: ActivityLogItem, idx: number) => (
                                <div key={idx} style={styles.itemCard}>
                                  <span style={styles.itemName}>
                                    {item.ingredient_name ||
                                      item.name ||
                                      item.rawName ||
                                      item.original_name ||
                                      "—"}
                                  </span>
                                  <span style={styles.itemQty}>
                                    {item.quantity ?? "—"} {item.unit || ""}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Helper for action colors
const getActionStyle = (action: string): React.CSSProperties => {
  let color: string = COLORS.textPrimary;
  let bg: string = "#F3F4F6";

  const lower = action.toLowerCase();
  if (
    lower.includes("nhập") ||
    lower.includes("stock") ||
    lower.includes("import")
  ) {
    color = "#059669"; // Green
    bg = "#D1FAE5";
  } else if (lower.includes("xuất") || lower.includes("hủy")) {
    color = "#DC2626"; // Red
    bg = "#FEE2E2";
  } else if (lower.includes("kiểm") || lower.includes("audit")) {
    color = "#D97706"; // Amber
    bg = "#FEF3C7";
  } else if (
    lower.includes("kết ca") ||
    lower.includes("shift") ||
    lower.includes("sales")
  ) {
    color = "#2563EB"; // Blue
    bg = "#DBEAFE";
  }

  return {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    color,
    backgroundColor: bg,
  };
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    overflow: "hidden",
    marginTop: 24,
  },
  title: {
    padding: "16px 20px",
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: COLORS.textPrimary,
    borderBottom: `1px solid ${COLORS.border}`,
    backgroundColor: "#FAFAFA",
  },
  tableWrapper: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    padding: "12px 20px",
    textAlign: "left",
    color: COLORS.textSecondary,
    fontWeight: 500,
    fontSize: 13,
    borderBottom: `1px solid ${COLORS.border}`,
    backgroundColor: "#FAFAFA",
  },
  tr: {
    borderBottom: `1px solid ${COLORS.border}`,
  },
  td: {
    padding: "12px 20px",
    color: COLORS.textPrimary,
  },
  date: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginLeft: 4,
  },
  badge: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    fontSize: 12,
    fontWeight: 500,
    color: COLORS.textPrimary,
  },
  empty: {
    padding: 30,
    textAlign: "center",
    color: COLORS.textSecondary,
    fontStyle: "italic",
  },
  expandIcon: {
    color: COLORS.textSecondary,
    display: "flex",
    alignItems: "center",
  },
  expandedRow: {
    backgroundColor: "#F9FAFB",
  },
  expandedTd: {
    padding: "12px 40px 16px 40px",
  },
  itemsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 8,
  },
  itemCard: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 12px",
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    border: `1px solid ${COLORS.border}`,
  },
  itemName: {
    fontWeight: 500,
    color: COLORS.textPrimary,
    fontSize: 13,
  },
  itemQty: {
    color: COLORS.primary,
    fontWeight: 600,
    fontSize: 13,
  },
};
