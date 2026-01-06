import React from "react";
import { COLORS } from "../styles/theme";

interface ActivityLog {
  id: string;
  created_at: string;
  staff_name: string;
  action: string;
  details: string;
}

interface ActivityLogTableProps {
  logs: ActivityLog[];
}

export const ActivityLogTable: React.FC<ActivityLogTableProps> = ({ logs }) => {
  console.log("ActivityLogTable rendering. Logs:", logs);
  return (
    <div
      style={{ ...styles.container, border: "2px solid red", minHeight: 100 }}
    >
      <h3 style={styles.title}>📜 Nhật ký hoạt động</h3>
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
              logs.map((log) => (
                <tr key={log.id} style={styles.tr}>
                  <td style={styles.td}>
                    {new Date(log.created_at).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    <span style={styles.date}>
                      {new Date(log.created_at).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.badge}>{log.staff_name}</div>
                  </td>
                  <td style={styles.td}>
                    <span style={getActionStyle(log.action)}>{log.action}</span>
                  </td>
                  <td style={{ ...styles.td, color: COLORS.textSecondary }}>
                    {log.details}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Helper for action colors
const getActionStyle = (action: string): React.CSSProperties => {
  let color = COLORS.textPrimary;
  let bg = "#F3F4F6";

  const lower = action.toLowerCase();
  if (lower.includes("nhập") || lower.includes("stock")) {
    color = "#059669"; // Green
    bg = "#D1FAE5";
  } else if (lower.includes("xuất") || lower.includes("hủy")) {
    color = "#DC2626"; // Red
    bg = "#FEE2E2";
  } else if (lower.includes("kiểm") || lower.includes("audit")) {
    color = "#D97706"; // Amber
    bg = "#FEF3C7";
  } else if (lower.includes("kết ca") || lower.includes("shift")) {
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
};
