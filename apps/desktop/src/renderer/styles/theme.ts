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

  // Backgrounds
  background: "#0F172A", // Dark Navy
  surface: "#1E293B", // Card background
  surfaceHover: "#2D3A4F",

  // Text
  textPrimary: "#F5F3EF", // Cream White
  textSecondary: "#94A3B8", // Muted
  textMuted: "#64748B",

  // Borders
  border: "#334155",
  borderFocus: "#E07A2F",
} as const;

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
    borderRadius: 16,
    padding: 40,
    width: 360,
    textAlign: "center",
  },
  logo: {
    marginBottom: 32,
  },
  logoText: {
    fontSize: 32,
    fontWeight: 700,
    color: COLORS.primary,
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
    gap: 12,
  },
  input: {
    padding: "12px 16px",
    backgroundColor: COLORS.background,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    color: "white",
    fontSize: 14,
    outline: "none",
  },
  button: {
    padding: "14px 24px",
    backgroundColor: COLORS.primary,
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
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
  },
  modeToggle: {
    display: "flex",
    gap: 8,
    marginBottom: 24,
  },
  modeButton: {
    flex: 1,
    padding: "10px 16px",
    backgroundColor: "transparent",
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  modeButtonActive: {
    backgroundColor: COLORS.primary,
    color: "white",
    borderColor: COLORS.primary,
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
