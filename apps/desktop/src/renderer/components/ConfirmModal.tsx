import React from "react";
import { COLORS } from "../styles/theme";

interface ConfirmModalProps {
  isOpen: boolean;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  message,
  detail,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.iconWrap}>
          <span style={{ fontSize: 28 }}>{danger ? "🗑️" : "❓"}</span>
        </div>
        <p style={styles.message}>{message}</p>
        {detail && <p style={styles.detail}>{detail}</p>}
        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            style={danger ? styles.dangerBtn : styles.confirmBtn}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    backdropFilter: "blur(2px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  modal: {
    background: "#fff",
    borderRadius: 16,
    padding: "32px 28px 24px",
    width: 360,
    maxWidth: "90vw",
    boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 0,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: "50%",
    background: "#FFF3E0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    fontWeight: 600,
    color: "#1F2937",
    textAlign: "center",
    margin: 0,
    marginBottom: 8,
    lineHeight: 1.4,
  },
  detail: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    margin: 0,
    marginBottom: 4,
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    gap: 10,
    marginTop: 24,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    padding: "10px 0",
    borderRadius: 8,
    border: "1.5px solid #E5E7EB",
    background: "#fff",
    color: "#374151",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  confirmBtn: {
    flex: 1,
    padding: "10px 0",
    borderRadius: 8,
    border: "none",
    background: COLORS.primary,
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  dangerBtn: {
    flex: 1,
    padding: "10px 0",
    borderRadius: 8,
    border: "none",
    background: "#EF4444",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
};
