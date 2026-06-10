import React, { useState, useEffect, useCallback } from "react";
import { COLORS } from "../styles/theme";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type ReportTab = "runway" | "top-sellers" | "shrinkage" | "expiring-lots";

interface RunwayItem {
  ingredientId: string;
  name: string;
  currentQty: number;
  unit: string;
  avgDailyUsage: number;
  runwayDays: number;
  alertLevel: "critical" | "warning" | "ok";
}

interface TopSellerItem {
  name: string;
  totalQty: number;
  totalRevenue: number;
}

interface ShrinkageBreakdownItem {
  ingredientId: string;
  name: string;
  lossQty: number;
  lossVnd: number;
  flagged: boolean;
}

interface ShrinkageData {
  totalLossVnd: number;
  totalLossQty: number;
  period: { days: number; startDate: string; endDate: string };
  breakdown: ShrinkageBreakdownItem[];
}

interface ExpiringLotItem {
  lotId: string;
  ingredientId: string;
  ingredientName: string;
  unit: string | null;
  expiryDate: string;
  daysRemaining: number;
  currentIngredientQty: number;
  avgDailyUsage7d: number;
  projectedSellOutDate: string | null;
  willSellOutBeforeExpiry: boolean;
  shouldAlert: boolean;
}

const alertColor = (level: string) => {
  if (level === "critical") return "#DC2626";
  if (level === "warning") return "#FBBF24";
  return "#10B981";
};

const formatVnd = (v: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(v);

const formatDateTime = (isoString: string) => {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return date.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
};

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("runway");
  const [days, setDays] = useState(7);

  const [runway, setRunway] = useState<RunwayItem[]>([]);
  const [topSellers, setTopSellers] = useState<TopSellerItem[]>([]);
  const [shrinkage, setShrinkage] = useState<ShrinkageData | null>(null);
  const [expiringLots, setExpiringLots] = useState<ExpiringLotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (t: ReportTab, d: number) => {
    setLoading(true);
    setError(null);
    try {
      if (t === "runway") {
        const data = await (window as any).electronAPI?.reportsGet(
          `/reports/runway?days=${d}`
        );
        setRunway(Array.isArray(data?.data) ? data.data : []);
      } else if (t === "top-sellers") {
        const data = await (window as any).electronAPI?.reportsGet(
          `/reports/top-sellers?days=${d}`
        );
        setTopSellers(Array.isArray(data?.data) ? data.data : []);
      } else if (t === "shrinkage") {
        const data = await (window as any).electronAPI?.reportsGet(
          `/reports/shrinkage?days=${d}`
        );
        setShrinkage(data?.data ?? null);
      } else {
        const data = await (window as any).electronAPI?.reportsGet(
          `/reports/expiring-lots?days=2&forecastWindow=7`
        );
        setExpiringLots(Array.isArray(data?.data) ? data.data : []);
      }
    } catch (e: any) {
      setError(e?.message ?? "Không thể tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(tab, days);
  }, [tab, days, fetchData]);

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: active ? 700 : 400,
    fontSize: 14,
    background: active ? COLORS.primary : COLORS.surface,
    color: active ? "#fff" : COLORS.textPrimary,
    transition: "background 150ms",
  });

  const daysBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    borderRadius: 6,
    border: `1px solid ${active ? COLORS.primary : COLORS.border}`,
    cursor: "pointer",
    fontSize: 13,
    background: active ? "#FEF3E8" : COLORS.surface,
    color: active ? COLORS.primary : COLORS.textSecondary,
  });

  return (
    <div style={{ padding: 24, background: COLORS.background, minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
          Báo cáo
        </h2>
        {tab !== "expiring-lots" ? (
          <div style={{ display: "flex", gap: 6 }}>
            {[7, 14, 30].map((d) => (
              <button key={d} style={daysBtnStyle(days === d)} onClick={() => setDays(d)}>
                {d} ngày
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            Ngưỡng cảnh báo: 2 ngày | Forecast: 7 ngày
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button style={tabBtnStyle(tab === "runway")} onClick={() => setTab("runway")}>
          ⚠️ Runway kho
        </button>
        <button style={tabBtnStyle(tab === "top-sellers")} onClick={() => setTab("top-sellers")}>
          📈 Bán chạy
        </button>
        <button style={tabBtnStyle(tab === "shrinkage")} onClick={() => setTab("shrinkage")}>
          📉 Hao hụt
        </button>
        <button style={tabBtnStyle(tab === "expiring-lots")} onClick={() => setTab("expiring-lots")}>
          ⏳ Hạn sử dụng
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: "center", color: COLORS.textMuted, padding: 40 }}>
          Đang tải...
        </div>
      )}

      {error && !loading && (
        <div style={{ color: COLORS.error, padding: 16, background: "#FFF5F5", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {!loading && !error && tab === "runway" && (
        <div>
          <p style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 12 }}>
            Dự đoán số ngày còn bán được dựa trên mức tiêu thụ trung bình.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.surface }}>
                {["Nguyên liệu", "Tồn kho", "Tiêu thụ/ngày", "Còn bán được"].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, borderBottom: `1px solid ${COLORS.border}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runway.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 32, textAlign: "center", color: COLORS.textMuted }}>
                    Không có dữ liệu
                  </td>
                </tr>
              ) : (
                runway.map((item) => (
                  <tr key={item.ingredientId} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: COLORS.textPrimary }}>
                      {item.name}
                    </td>
                    <td style={{ padding: "10px 12px", color: COLORS.textSecondary }}>
                      {item.currentQty.toFixed(2)} {item.unit}
                    </td>
                    <td style={{ padding: "10px 12px", color: COLORS.textSecondary }}>
                      {item.avgDailyUsage.toFixed(2)} {item.unit}/ngày
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          background: alertColor(item.alertLevel) + "22",
                          color: alertColor(item.alertLevel),
                          borderRadius: 6,
                          padding: "2px 10px",
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {item.runwayDays} ngày
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && tab === "top-sellers" && (
        <div>
          <p style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 12 }}>
            Top 20 món bán chạy nhất theo doanh thu.
          </p>
          {topSellers.length === 0 ? (
            <div style={{ textAlign: "center", color: COLORS.textMuted, padding: 40 }}>
              Không có dữ liệu
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={topSellers} layout="vertical" margin={{ left: 20, right: 40 }}>
                <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number | undefined) => formatVnd(value ?? 0)}
                  labelStyle={{ fontWeight: 700 }}
                />
                <Bar dataKey="totalRevenue" radius={[0, 4, 4, 0]}>
                  {topSellers.map((_, i) => (
                    <Cell key={i} fill={COLORS.primary} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {!loading && !error && tab === "shrinkage" && (
        <div>
          {shrinkage ? (
            <>
              <div style={{ background: COLORS.surface, borderRadius: 10, padding: 20, marginBottom: 20, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 4 }}>
                  Tổng hao hụt ({shrinkage.period.days} ngày)
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.error }}>
                  {formatVnd(shrinkage.totalLossVnd)}
                </div>
                <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>
                  {formatDateTime(shrinkage.period.startDate)} → {formatDateTime(shrinkage.period.endDate)}
                </div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: COLORS.surface }}>
                    {["Nguyên liệu", "Số lượng hao", "Thành tiền", ""].map((h) => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, borderBottom: `1px solid ${COLORS.border}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shrinkage.breakdown.map((item) => (
                    <tr key={item.ingredientId} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: COLORS.textPrimary }}>
                        {item.name}
                      </td>
                      <td style={{ padding: "10px 12px", color: COLORS.textSecondary }}>
                        {item.lossQty.toFixed(2)}
                      </td>
                      <td style={{ padding: "10px 12px", color: COLORS.error, fontWeight: 600 }}>
                        {formatVnd(item.lossVnd)}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {item.flagged && (
                          <span style={{ background: "#FFF5F5", color: COLORS.error, borderRadius: 6, padding: "2px 8px", fontSize: 12 }}>
                            ⚠ Nghi vấn
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div style={{ textAlign: "center", color: COLORS.textMuted, padding: 40 }}>
              Không có dữ liệu hao hụt
            </div>
          )}
        </div>
      )}

      {!loading && !error && tab === "expiring-lots" && (
        <div>
          <p style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 12 }}>
            Chỉ cảnh báo khi còn ≤ 2 ngày và dự báo không bán kịp trước hạn.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.surface }}>
                {[
                  "Nguyên liệu",
                  "Ngày hết hạn",
                  "Còn lại",
                  "Tồn hiện tại",
                  "TB tiêu thụ/ngày",
                  "Dự báo bán hết",
                  "Trạng thái",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      fontSize: 13,
                      fontWeight: 600,
                      color: COLORS.textSecondary,
                      borderBottom: `1px solid ${COLORS.border}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expiringLots.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: "center", color: COLORS.textMuted }}>
                    Không có lô sắp hết hạn
                  </td>
                </tr>
              ) : (
                expiringLots.map((item) => (
                  <tr key={item.lotId} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: "10px 12px", color: COLORS.textPrimary, fontWeight: 600 }}>
                      {item.ingredientName}
                    </td>
                    <td style={{ padding: "10px 12px", color: COLORS.textSecondary }}>
                      {formatDateTime(item.expiryDate)}
                    </td>
                    <td style={{ padding: "10px 12px", color: item.daysRemaining <= 2 ? COLORS.error : COLORS.textSecondary }}>
                      {item.daysRemaining} ngày
                    </td>
                    <td style={{ padding: "10px 12px", color: COLORS.textSecondary }}>
                      {item.currentIngredientQty.toFixed(2)} {item.unit ?? ""}
                    </td>
                    <td style={{ padding: "10px 12px", color: COLORS.textSecondary }}>
                      {item.avgDailyUsage7d.toFixed(2)} {item.unit ?? ""}/ngày
                    </td>
                    <td style={{ padding: "10px 12px", color: COLORS.textSecondary }}>
                      {item.projectedSellOutDate ? formatDateTime(item.projectedSellOutDate) : "Không xác định"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          borderRadius: 6,
                          padding: "2px 10px",
                          fontWeight: 700,
                          fontSize: 12,
                          background: item.shouldAlert ? "#FEE2E2" : "#DCFCE7",
                          color: item.shouldAlert ? "#B91C1C" : "#166534",
                        }}
                      >
                        {item.shouldAlert
                          ? "Cần cảnh báo"
                          : item.willSellOutBeforeExpiry
                            ? "Bán hết trước hạn"
                            : "Ổn định"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
