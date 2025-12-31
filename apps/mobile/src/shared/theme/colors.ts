// src/shared/theme/colors.ts - SnapKO F&B Color Palette
// Per .UXUIrules - Centralized theme colors

export const COLORS = {
  // Primary Actions
  primary: "#E07A2F", // Burnt Orange - Primary CTA
  primaryLight: "#F49D5C",
  primaryDark: "#C86A25",

  // Status Colors
  positive: "#6B8E23", // Olive Green - Good state
  warning: "#FFC857", // Mustard Yellow - Warning
  error: "#E63946", // Tomato Red - Danger
  info: "#E07A2F", // Burnt Orange - Info (F&B theme)

  // Backgrounds
  background: "#121212", // Charcoal - F&B theme
  surface: "#1A1A1A", // Dark Coffee - F&B theme
  surfaceLight: "#2A2A2A",

  // Text
  textPrimary: "#F5F3EF", // Cream White
  textSecondary: "#94A3B8", // Muted
  textMuted: "#64748B",

  // Borders
  border: "#2A2A2A",
  borderLight: "#3A3A3A",

  // Semantic
  success: "#55A630", // Fresh Green - F&B theme
  pending: "#F59E0B",
  inactive: "#6B7280",

  // Light Theme variants (for contrast)
  white: "#FFFFFF",
  black: "#000000",
} as const;

export type ColorName = keyof typeof COLORS;
