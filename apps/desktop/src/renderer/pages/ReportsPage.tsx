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
import {
  buildComparisonRows,
  getMetricTone,
  isMissingMonthlyComparisonEndpointError,
  type ComparisonMetric,
} from "../../shared/monthlyComparison";

type ReportTab =
  | "monthly-comparison"
  | "runway"
  | "top-sellers"
  | "shrinkage"
  | "expiring-lots";

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

interface MonthlyComparisonData {
  period: {
    current: { startDate: string; endDate: string; label: string };
    previous: { startDate: string; endDate: string; label: string };
  };
  metrics: {
    revenue: ComparisonMetric;
    soldQty: ComparisonMetric;
    shrinkageVnd: ComparisonMetric;
    inventoryValue: ComparisonMetric;
  };
  topSellers: {
    current: TopSellerItem[];
    previous: TopSellerItem[];
  };
  shrinkage: {
    current: ShrinkageBreakdownItem[];
    previous: ShrinkageBreakdownItem[];
  };
  inventorySnapshots: {
    current: string | null;
    previous: string | null;
  };
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

type ReportBranch = {
  id: string;
  name: string;
  code: string | null;
  type: "CENTRAL_WAREHOUSE" | "OUTLET";
};

interface ReportsPageProps {
  role?: string;
  branches?: ReportBranch[];
}

export default function ReportsPage({ role, branches = [] }: ReportsPageProps) {
  const [tab, setTab] = useState<ReportTab>("monthly-comparison");
  const [days, setDays] = useState(7);
  const managerBranch = role === "BRANCH_MANAGER" ? branches[0]?.id ?? "" : "";
  const [branchId, setBranchId] = useState(managerBranch);

  const [runway, setRunway] = useState<RunwayItem[]>([]);
  const [topSellers, setTopSellers] = useState<TopSellerItem[]>([]);
  const [shrinkage, setShrinkage] = useState<ShrinkageData | null>(null);
  const [expiringLots, setExpiringLots] = useState<ExpiringLotItem[]>([]);
  const [monthlyComparison, setMonthlyComparison] =
    useState<MonthlyComparisonData | null>(null);
  const [monthlyComparisonEndpointMissing, setMonthlyComparisonEndpointMissing] =
    useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (t: ReportTab, d: number) => {
    setLoading(true);
    setError(null);
    setMonthlyComparisonEndpointMissing(false);
    const branchQuery = branchId
      ? `&branchId=${encodeURIComponent(branchId)}`
      : "";
    try {
      if (t === "monthly-comparison") {
        const data = await (window as any).electronAPI?.reportsGet(
          `/reports/monthly-comparison${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""}`
        );
        setMonthlyComparison(data?.data ?? null);
      } else if (t === "runway") {
        const data = await (window as any).electronAPI?.reportsGet(
          `/reports/runway?days=${d}${branchQuery}`
        );
        setRunway(Array.isArray(data?.data) ? data.data : []);
      } else if (t === "top-sellers") {
        const data = await (window as any).electronAPI?.reportsGet(
          `/reports/top-sellers?days=${d}${branchQuery}`
        );
        setTopSellers(Array.isArray(data?.data) ? data.data : []);
      } else if (t === "shrinkage") {
        const data = await (window as any).electronAPI?.reportsGet(
          `/reports/shrinkage?days=${d}${branchQuery}`
        );
        setShrinkage(data?.data ?? null);
      } else {
        const data = await (window as any).electronAPI?.reportsGet(
          `/reports/expiring-lots?days=2&forecastWindow=7${branchQuery}`
        );
        setExpiringLots(Array.isArray(data?.data) ? data.data : []);
      }
    } catch (e: any) {
      if (t === "monthly-comparison" && isMissingMonthlyComparisonEndpointError(e)) {
        setMonthlyComparison(null);
        setMonthlyComparisonEndpointMissing(true);
        return;
      }
      setError(e?.message ?? "Không thể tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

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

  const formatNumber = (value: number) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value);

  const toneColor = (tone: "good" | "bad" | "neutral") => {
    if (tone === "good") return COLORS.positive;
    if (tone === "bad") return COLORS.error;
    return COLORS.textMuted;
  };

  const formatDelta = (metric: ComparisonMetric) => {
    if (metric.changePct == null) return "Chưa đủ dữ liệu";
    if (metric.changePct === 0) return "Không đổi";
    return `${metric.changePct > 0 ? "+" : ""}${metric.changePct.toFixed(1)}%`;
  };

  const renderMetricCard = (
    title: string,
    metric: ComparisonMetric,
    formatter: (value: number) => string,
  ) => {
    const tone = getMetricTone(metric);
    return (
      <div
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderLeft: `4px solid ${toneColor(tone)}`,
          borderRadius: 10,
          padding: 16,
          minWidth: 210,
          flex: 1,
        }}
      >
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>
          {title}
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.textPrimary }}>
          {metric.current == null ? "--" : formatter(metric.current)}
        </div>
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 6 }}>
          Trước: {metric.previous == null ? "--" : formatter(metric.previous)}
        </div>
        <div style={{ fontSize: 13, color: toneColor(tone), fontWeight: 700, marginTop: 8 }}>
          {formatDelta(metric)}
        </div>
      </div>
    );
  };

  const topSellerRows = monthlyComparison
    ? buildComparisonRows(
        monthlyComparison.topSellers.current,
        monthlyComparison.topSellers.previous,
        "totalRevenue",
      )
    : [];
  const shrinkageRows = monthlyComparison
    ? buildComparisonRows(
        monthlyComparison.shrinkage.current,
        monthlyComparison.shrinkage.previous,
        "lossVnd",
      )
    : [];

  return (
    <div style={{ padding: 24, background: COLORS.background, minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
          Báo cáo
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {role === "OWNER" && branches.length > 0 ? (
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surface,
              color: COLORS.textPrimary,
            }}
          >
            <option value="">Toàn chuỗi</option>
            {branches
              .filter((branch) => branch.type === "OUTLET")
              .map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
          </select>
        ) : null}
        {tab === "monthly-comparison" ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            Tháng này so với cùng kỳ tháng trước
          </div>
        ) : tab !== "expiring-lots" ? (
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
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button style={tabBtnStyle(tab === "monthly-comparison")} onClick={() => setTab("monthly-comparison")}>
          📊 So sánh tháng
        </button>
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

      {!loading && !error && tab === "monthly-comparison" && (
        <div>
          {monthlyComparisonEndpointMissing ? (
            <div
              style={{
                background: "#FFFBEB",
                border: "1px solid #FDE68A",
                borderRadius: 10,
                padding: 18,
                color: COLORS.textPrimary,
                maxWidth: 720,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Backend đang chạy chưa có API so sánh tháng
              </div>
              <div style={{ color: COLORS.textSecondary, lineHeight: 1.5 }}>
                Code backend đã có route mới, nhưng process trên localhost:3000
                vẫn đang trả 404. Restart BE-SnapKO rồi bấm lại tab này để tải
                báo cáo tháng.
              </div>
            </div>
          ) : monthlyComparison ? (
            <>
              <p style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 12 }}>
                {monthlyComparison.period.current.label} so với {monthlyComparison.period.previous.label}
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                {renderMetricCard("Doanh thu", monthlyComparison.metrics.revenue, formatVnd)}
                {renderMetricCard("Số lượng bán", monthlyComparison.metrics.soldQty, (v) => formatNumber(v))}
                {renderMetricCard("Hao hụt", monthlyComparison.metrics.shrinkageVnd, formatVnd)}
                {renderMetricCard("Giá trị tồn kho", monthlyComparison.metrics.inventoryValue, formatVnd)}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
                <div style={{ background: COLORS.surface, borderRadius: 10, padding: 16, border: `1px solid ${COLORS.border}` }}>
                  <h3 style={{ margin: "0 0 12px", color: COLORS.textPrimary, fontSize: 16 }}>
                    Top bán chạy kỳ này
                  </h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Món", "Kỳ này", "Kỳ trước", "Đổi"].map((h) => (
                          <th key={h} style={{ padding: "8px 6px", textAlign: "left", color: COLORS.textSecondary, fontSize: 12, borderBottom: `1px solid ${COLORS.border}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topSellerRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: 24, textAlign: "center", color: COLORS.textMuted }}>
                            Không có dữ liệu bán hàng
                          </td>
                        </tr>
                      ) : (
                        topSellerRows.slice(0, 10).map((row) => (
                          <tr key={row.name}>
                            <td style={{ padding: "8px 6px", color: COLORS.textPrimary, fontWeight: 600 }}>{row.name}</td>
                            <td style={{ padding: "8px 6px", color: COLORS.textSecondary }}>{formatVnd(row.currentValue)}</td>
                            <td style={{ padding: "8px 6px", color: COLORS.textSecondary }}>{row.previousValue == null ? "--" : formatVnd(row.previousValue)}</td>
                            <td style={{ padding: "8px 6px", color: row.changePct == null ? COLORS.textMuted : row.changePct >= 0 ? COLORS.positive : COLORS.error, fontWeight: 700 }}>
                              {row.changePct == null ? "--" : `${row.changePct > 0 ? "+" : ""}${row.changePct.toFixed(1)}%`}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ background: COLORS.surface, borderRadius: 10, padding: 16, border: `1px solid ${COLORS.border}` }}>
                  <h3 style={{ margin: "0 0 12px", color: COLORS.textPrimary, fontSize: 16 }}>
                    Hao hụt kỳ này
                  </h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Nguyên liệu", "Kỳ này", "Kỳ trước", "Đổi"].map((h) => (
                          <th key={h} style={{ padding: "8px 6px", textAlign: "left", color: COLORS.textSecondary, fontSize: 12, borderBottom: `1px solid ${COLORS.border}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shrinkageRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: 24, textAlign: "center", color: COLORS.textMuted }}>
                            Không có dữ liệu hao hụt
                          </td>
                        </tr>
                      ) : (
                        shrinkageRows.slice(0, 10).map((row) => (
                          <tr key={row.name}>
                            <td style={{ padding: "8px 6px", color: COLORS.textPrimary, fontWeight: 600 }}>{row.name}</td>
                            <td style={{ padding: "8px 6px", color: COLORS.error, fontWeight: 600 }}>{formatVnd(row.currentValue)}</td>
                            <td style={{ padding: "8px 6px", color: COLORS.textSecondary }}>{row.previousValue == null ? "--" : formatVnd(row.previousValue)}</td>
                            <td style={{ padding: "8px 6px", color: row.changePct == null ? COLORS.textMuted : row.changePct <= 0 ? COLORS.positive : COLORS.error, fontWeight: 700 }}>
                              {row.changePct == null ? "--" : `${row.changePct > 0 ? "+" : ""}${row.changePct.toFixed(1)}%`}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {(monthlyComparison.inventorySnapshots.current == null ||
                monthlyComparison.inventorySnapshots.previous == null) && (
                <div style={{ marginTop: 12, color: COLORS.textMuted, fontSize: 12 }}>
                  Giá trị tồn kho cần có snapshot kiểm kho trong cả hai kỳ để so sánh đầy đủ.
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", color: COLORS.textMuted, padding: 40 }}>
              Không có dữ liệu so sánh tháng
            </div>
          )}
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
