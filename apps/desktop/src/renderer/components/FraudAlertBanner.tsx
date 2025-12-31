/**
 * FraudAlertBanner - Prominent Alert for Suspicious Activity
 * Per .antigravityrules: Anti-Fraud Owner Notification
 */

interface FraudAlert {
  id: string;
  staff_name: string;
  reason: string;
  variance: number;
  created_at: string;
}

interface FraudAlertBannerProps {
  alerts: FraudAlert[];
  onViewDetails?: () => void;
}

export function FraudAlertBanner({
  alerts,
  onViewDetails,
}: FraudAlertBannerProps) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div
      style={{
        backgroundColor: "#FEE2E2", // Light red background
        borderLeft: "4px solid var(--color-error, #E63946)",
        padding: "16px",
        marginBottom: "24px",
        borderRadius: "0 8px 8px 0",
        boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div
          style={{
            backgroundColor: "#E63946",
            borderRadius: "50%",
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "18px" }}>⚠️</span>
        </div>

        <div style={{ flex: 1 }}>
          <h3
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "#E63946",
              marginBottom: "8px",
            }}
          >
            Phát hiện rủi ro gian lận ({alerts.length})
          </h3>

          <ul
            style={{
              listStyle: "disc",
              paddingLeft: "20px",
              fontSize: "13px",
              color: "#991B1B",
            }}
          >
            {alerts.slice(0, 3).map((alert) => (
              <li key={alert.id} style={{ marginBottom: "4px" }}>
                <strong>{alert.staff_name}</strong>: {alert.reason} (Lệch{" "}
                <span style={{ fontWeight: 600 }}>
                  {alert.variance.toFixed(1)}%
                </span>
                )
              </li>
            ))}
            {alerts.length > 3 && (
              <li style={{ fontStyle: "italic" }}>
                ...và {alerts.length - 3} cảnh báo khác
              </li>
            )}
          </ul>

          {onViewDetails && (
            <button
              onClick={onViewDetails}
              style={{
                marginTop: "12px",
                padding: "8px 16px",
                backgroundColor: "#E63946",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Xem chi tiết & Xử lý ➜
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
