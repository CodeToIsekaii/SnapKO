import React from "react";
import { COLORS } from "../styles/theme";

interface GuideSection {
  title: string;
  content: React.ReactNode;
}

interface GuideModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  sections: GuideSection[];
}

export default function GuideModal({
  title,
  isOpen,
  onClose,
  sections,
}: GuideModalProps) {
  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>💡 {title}</h2>
          <button onClick={onClose} style={styles.closeButton}>
            ✕
          </button>
        </div>

        <div style={styles.content}>
          {sections.map((section, idx) => (
            <div key={idx} style={styles.section}>
              <h3 style={styles.sectionTitle}>
                {idx + 1}. {section.title}
              </h3>
              <div style={styles.sectionContent}>{section.content}</div>
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.understoodButton}>
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999, // Ensure it sits on top of everything
  },
  modal: {
    backgroundColor: "white",
    borderRadius: 12,
    width: "650px",
    maxWidth: "90vw",
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    boxShadow:
      "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    overflow: "hidden",
  },
  header: {
    padding: "20px 24px",
    borderBottom: "1px solid #E5E7EB",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: "#111827",
  },
  closeButton: {
    background: "none",
    border: "none",
    fontSize: 20,
    color: "#6B7280",
    cursor: "pointer",
    padding: 4,
  },
  content: {
    padding: "24px",
    overflowY: "auto",
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    margin: "0 0 8px 0",
    fontSize: 16,
    fontWeight: 600,
    color: COLORS.primary, // #6B8E23
  },
  sectionContent: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "#4B5563",
  },
  footer: {
    padding: "16px 24px",
    borderTop: "1px solid #E5E7EB",
    display: "flex",
    justifyContent: "flex-end",
    backgroundColor: "#F9FAFB",
  },
  understoodButton: {
    backgroundColor: COLORS.primary,
    color: "white",
    border: "none",
    padding: "10px 20px",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
  },
};
