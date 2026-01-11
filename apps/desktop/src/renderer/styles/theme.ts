// src/styles/theme.ts - Centralized Theme & Styles
// SnapKO F&B Color Palette (per .UXUIrules)

export const COLORS = {
  // Primary Actions
  primary: "#E07A2F", // Burnt Orange - Primary CTA
  primaryHover: "#C86A25",

  // Status Colors
  positive: "#6B8E23", // Olive Green - Good state
  warning: "#FFC857", // Mustard Yellow - Warning
  error: "#E63946", // Tomato Red - Danger

  // Backgrounds - LIGHT MODE per .UXUIrules
  background: "#FAF9F7", // Giấy trắng ngà - Dễ đọc cho Owner
  surface: "#FFFFFF", // Card trắng tinh
  surfaceHover: "#F5F5F5",

  // Text - LIGHT MODE
  textPrimary: "#1A1A1A", // Đen than - Dễ đọc
  textSecondary: "#666666", // Xám
  textMuted: "#999999",

  // Borders - LIGHT MODE
  border: "#E5E5E5",
  borderFocus: "#E07A2F",
} as const;

// Shadow tokens for depth
export const SHADOWS = {
  card: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
  hover:
    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  focus: `0 0 0 3px rgba(224, 122, 47, 0.3)`, // Primary ring
};

// Login Screen Styles
export const loginStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: COLORS.background,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: "48px 40px",
    width: 400,
    textAlign: "center",
    boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
  },
  logo: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: 40,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    boxShadow: `0 6px 15px ${COLORS.primary}55`,
  },
  logoInner: {
    color: "white",
    fontSize: 32,
    fontWeight: "bold",
  },
  logoText: {
    fontSize: 28,
    fontWeight: 700,
    color: COLORS.textPrimary,
  },
  tagline: {
    display: "block",
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  label: {
    display: "block",
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 8,
    marginLeft: 4,
    fontWeight: 500,
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    backgroundColor: COLORS.surface,
    border: `2px solid ${COLORS.border}`,
    borderRadius: 12,
    color: COLORS.textPrimary,
    fontSize: 15,
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    padding: "16px 24px",
    backgroundColor: COLORS.primary,
    color: "white",
    border: "none",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
    boxShadow: `0 4px 10px ${COLORS.primary}33`,
    boxSizing: "border-box",
  },
  error: {
    color: COLORS.error,
    fontSize: 14,
    margin: 0,
  },
  footer: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 24,
    margin: 0,
    lineHeight: 1.5,
  },
};

// Dashboard Styles
export const dashboardStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: COLORS.background,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    backgroundColor: COLORS.surface,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  tabs: {
    display: "flex",
    gap: 8,
    padding: "12px 24px",
    backgroundColor: COLORS.background,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  tabButton: {
    padding: "8px 16px",
    backgroundColor: "transparent",
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
  },
  tabButtonActive: {
    backgroundColor: COLORS.primary,
    color: "white",
    borderColor: COLORS.primary,
  },
  main: {
    flex: 1,
    padding: 24,
    overflow: "auto",
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 16,
  },
  tableHeader: {
    backgroundColor: COLORS.surface,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    textAlign: "left",
    padding: "12px 16px",
  },
  tableCell: {
    padding: "12px 16px",
    borderBottom: `1px solid ${COLORS.border}`,
    color: COLORS.textPrimary,
  },
};
