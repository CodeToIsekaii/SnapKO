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
  info: "#3B82F6", // Blue - Info

  // Backgrounds
  background: "#0F172A", // Dark Navy
  surface: "#1E293B", // Card background
  surfaceLight: "#2D3A4F",

  // Text
  textPrimary: "#F5F3EF", // Cream White
  textSecondary: "#94A3B8", // Muted
  textMuted: "#64748B",

  // Borders
  border: "#334155",
  borderLight: "#475569",

  // Semantic
  success: "#22C55E",
  pending: "#F59E0B",
  inactive: "#6B7280",

  // Light Theme variants (for contrast)
  white: "#FFFFFF",
  black: "#000000",
} as const;

export type ColorName = keyof typeof COLORS;
