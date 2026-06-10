/**
 * ModelSelectionPage - Force owner to choose operational model
 * This page blocks navigation until owner selects Model A or B
 * Per .script and .UXUIrules: Light mode, Burnt Orange CTA
 */

import React, { useState } from "react";
import { COLORS } from "../styles/theme";

interface ModelSelectionPageProps {
  onSave: (model: "SIMPLE" | "STANDARD" | "CHAIN") => void;
  businessName?: string;
}

export default function ModelSelectionPage({
  onSave,
  businessName = "Quán của bạn",
}: ModelSelectionPageProps) {
  const [selectedModel, setSelectedModel] = useState<
    "SIMPLE" | "STANDARD" | "CHAIN" | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedModel) return;

    setIsSaving(true);
    try {
      await onSave(selectedModel);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logoBox}>
          <span style={styles.logoText}>📸</span>
        </div>
        <h1 style={styles.title}>Chào mừng đến với SnapKO!</h1>
        <p style={styles.subtitle}>
          Quán <strong style={{ color: COLORS.primary }}>{businessName}</strong>{" "}
          vận hành như thế nào?
        </p>
        <p style={styles.subtext}>
          Việc này giúp AI cấu hình quy trình kiểm kho chính xác cho nhân viên
          của bạn.
        </p>
      </div>

      {/* Model Cards */}
      <div style={styles.cardsContainer}>
        {/* Model A Card - KHO ĐƠN */}
        <div
          style={{
            ...styles.card,
            ...(selectedModel === "SIMPLE" ? styles.cardSelected : {}),
            borderColor:
              selectedModel === "SIMPLE" ? COLORS.primary : COLORS.border,
          }}
          onClick={() => setSelectedModel("SIMPLE")}
        >
          <div style={styles.cardIcon}>🏠</div>
          <h2 style={styles.cardTitle}>KHO ĐƠN</h2>
          <h3 style={styles.cardSubtitle}>Model A</h3>

          <div style={styles.targetAudience}>
            <span>🎯 Dành cho:</span> Cafe nhỏ, Take-away, Kiosk
          </div>

          <p style={styles.cardDescription}>
            "Tôi nhập hàng về và dùng luôn tại quầy. Không có kho riêng biệt."
          </p>

          <ul style={styles.featureList}>
            <li>✓ Chỉ có 1 kho chung</li>
            <li>✓ Không cần quản lý chuyển kho</li>
            <li>✓ Kiểm kho đơn giản, nhanh gọn</li>
          </ul>

          <div style={styles.consequenceBox}>
            <span style={{ color: COLORS.positive }}>📱 Hệ quả:</span>
            <p>App Nhân viên sẽ ẩn nút chọn kho</p>
          </div>

          <button
            style={{
              ...styles.selectButton,
              ...(selectedModel === "SIMPLE"
                ? styles.selectButtonActive
                : styles.selectButtonOutline),
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedModel("SIMPLE");
            }}
          >
            {selectedModel === "SIMPLE" ? "✓ Đã chọn" : "Chọn Mô Hình Này"}
          </button>
        </div>

        {/* Model B Card - KHO KÉP */}
        <div
          style={{
            ...styles.card,
            ...(selectedModel === "STANDARD" ? styles.cardSelected : {}),
            borderColor:
              selectedModel === "STANDARD" ? COLORS.primary : COLORS.border,
          }}
          onClick={() => setSelectedModel("STANDARD")}
        >
          <div style={styles.cardIcon}>🏭→🍸</div>
          <h2 style={styles.cardTitle}>KHO KÉP</h2>
          <h3 style={styles.cardSubtitle}>Model B</h3>

          <div style={styles.targetAudience}>
            <span>🎯 Dành cho:</span> Nhà hàng, Quán nhậu, Chuỗi F&B
          </div>

          <p style={styles.cardDescription}>
            "Tôi có Kho Tổng để trữ hàng và Quầy Bar để bán. Cần quy trình
            chuyển kho."
          </p>

          <ul style={styles.featureList}>
            <li>✓ Kho Tổng (Warehouse) + Quầy Bar</li>
            <li>✓ Quản lý chuyển kho nội bộ</li>
            <li>✓ Kiểm kho từng khu vực riêng</li>
          </ul>

          <div style={styles.consequenceBox}>
            <span style={{ color: COLORS.primary }}>📱 Hệ quả:</span>
            <p>App Nhân viên hiện nút chọn "Kho Tổng / Bar"</p>
          </div>

          <button
            style={{
              ...styles.selectButton,
              ...(selectedModel === "STANDARD"
                ? styles.selectButtonActive
                : styles.selectButtonPrimary),
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedModel("STANDARD");
            }}
          >
            {selectedModel === "STANDARD" ? "✓ Đã chọn" : "Chọn Mô Hình Này"}
          </button>

          {/* Recommended badge */}
          <div style={styles.recommendBadge}>
            ⭐ Đề xuất cho F&B chuyên nghiệp
          </div>
        </div>

        {/* Model C Card - CHAIN */}
        <div
          style={{
            ...styles.card,
            ...(selectedModel === "CHAIN" ? styles.cardSelected : {}),
            borderColor:
              selectedModel === "CHAIN" ? COLORS.primary : COLORS.border,
          }}
          onClick={() => setSelectedModel("CHAIN")}
        >
          <div style={styles.cardIcon}>🏬</div>
          <h2 style={styles.cardTitle}>NHIỀU KHU VỰC</h2>
          <h3 style={styles.cardSubtitle}>Model C</h3>

          <div style={styles.targetAudience}>
            <span>🎯 Dành cho:</span> Chuỗi, nhiều bar/kho con
          </div>

          <p style={styles.cardDescription}>
            "Tôi cần nhiều khu vực kho tùy chỉnh và quản lý theo từng điểm."
          </p>

          <ul style={styles.featureList}>
            <li>✓ Nhiều khu vực kho tùy chỉnh</li>
            <li>✓ Quản lý ẩn/hiện khu vực</li>
            <li>✓ Phù hợp vận hành nhiều điểm</li>
          </ul>

          <div style={styles.consequenceBox}>
            <span style={{ color: COLORS.primary }}>📱 Hệ quả:</span>
            <p>App Nhân viên dùng danh sách khu vực theo cấu hình</p>
          </div>

          <button
            style={{
              ...styles.selectButton,
              ...(selectedModel === "CHAIN"
                ? styles.selectButtonActive
                : styles.selectButtonPrimary),
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedModel("CHAIN");
            }}
          >
            {selectedModel === "CHAIN" ? "✓ Đã chọn" : "Chọn Mô Hình Này"}
          </button>
        </div>
      </div>

      {/* Continue Button */}
      <button
        style={{
          ...styles.continueButton,
          backgroundColor: selectedModel ? COLORS.primary : COLORS.border,
          cursor: selectedModel ? "pointer" : "not-allowed",
          opacity: selectedModel ? 1 : 0.6,
        }}
        onClick={handleSave}
        disabled={!selectedModel || isSaving}
      >
        {isSaving ? "⏳ Đang lưu..." : "Tiếp tục vào Dashboard →"}
      </button>

      {/* Footer note */}
      <p style={styles.footerNote}>
        ℹ️ Bạn có thể thay đổi mô hình sau trong phần Cài đặt
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: COLORS.background,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  header: {
    textAlign: "center",
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
    margin: "0 auto 20px",
    boxShadow: `0 6px 15px ${COLORS.primary}55`,
  },
  logoText: {
    fontSize: 36,
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    color: COLORS.textPrimary,
    marginBottom: 12,
    margin: 0,
  },
  subtitle: {
    fontSize: 18,
    color: COLORS.textSecondary,
    marginTop: 12,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: COLORS.textMuted,
    maxWidth: 500,
    margin: "0 auto",
  },
  cardsContainer: {
    display: "flex",
    gap: 32,
    marginBottom: 40,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 32,
    width: 340,
    cursor: "pointer",
    transition: "all 0.2s ease",
    borderWidth: 3,
    borderStyle: "solid",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
    position: "relative",
  },
  cardSelected: {
    transform: "scale(1.02)",
    boxShadow: `0 8px 32px ${COLORS.primary}33`,
  },
  cardIcon: {
    fontSize: 48,
    marginBottom: 16,
    textAlign: "center",
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.textPrimary,
    textAlign: "center",
    marginBottom: 4,
    margin: 0,
  },
  cardSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: 20,
    fontWeight: 500,
  },
  targetAudience: {
    fontSize: 13,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.background,
    padding: "8px 12px",
    borderRadius: 8,
    marginBottom: 16,
    textAlign: "center",
  },
  cardDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontStyle: "italic",
    marginBottom: 16,
    lineHeight: 1.5,
    textAlign: "center",
    padding: "0 8px",
  },
  featureList: {
    listStyle: "none",
    padding: 0,
    margin: "0 0 16px 0",
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 2,
  },
  consequenceBox: {
    fontSize: 13,
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    textAlign: "center",
  },
  selectButton: {
    width: "100%",
    padding: "14px 24px",
    fontSize: 15,
    fontWeight: 600,
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  selectButtonOutline: {
    backgroundColor: "transparent",
    border: `2px solid ${COLORS.border}`,
    color: COLORS.textSecondary,
  },
  selectButtonPrimary: {
    backgroundColor: COLORS.primary,
    color: "#FFFFFF",
    boxShadow: `0 4px 12px ${COLORS.primary}44`,
  },
  selectButtonActive: {
    backgroundColor: COLORS.positive,
    color: "#FFFFFF",
  },
  recommendBadge: {
    position: "absolute",
    top: -12,
    right: 20,
    backgroundColor: COLORS.warning,
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 12px",
    borderRadius: 20,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
  },
  continueButton: {
    padding: "18px 56px",
    fontSize: 18,
    fontWeight: 600,
    color: "#FFFFFF",
    border: "none",
    borderRadius: 14,
    transition: "all 0.2s ease",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
  },
  footerNote: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 24,
  },
};
