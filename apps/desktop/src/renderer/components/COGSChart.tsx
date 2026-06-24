/**
 * COGSChart - Inventory Value Bar Chart
 * Using Recharts with SnapKO F&B theme colors
 */

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
} from "recharts";
import { COLORS, SHADOWS } from "../styles/theme";
import {
  DollarSign,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from "lucide-react";
import {
  buildLossLegendItems,
  hasLossBreakdownData,
} from "../../shared/lossBreakdown";

interface BarChartData {
  name: string;
  fullDate?: string;
  warehouse: number;
  bar: number;
}

interface PieChartData {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number; // Index signature for Recharts compatibility
}

/**
 * Format VND currency
 */
function formatVND(value: number): string {
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(1)}B`;
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}K`;
  }
  return value.toString();
}

/**
 * Bar Chart: Inventory Value by Month (Warehouse vs Bar)
 */
export function InventoryValueChart({
  data,
  showBarSeries,
}: {
  data: BarChartData[];
  showBarSeries: boolean;
}) {
  const barSize = showBarSeries ? 28 : 42;
  const minPointSize = showBarSeries ? 10 : 12;

  return (
    <div
      style={{
        height: 300,
        width: "100%",
        backgroundColor: COLORS.surface,
        padding: 16,
        borderRadius: 12,
        border: `1px solid ${COLORS.border}`,
        boxShadow: SHADOWS.card,
      }}
    >
      <h3
        style={{
          color: COLORS.textPrimary,
          fontWeight: 600,
          marginBottom: 16,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <BarChart3 size={18} color={COLORS.primary} />
        Giá trị tồn kho theo ngày (VNĐ)
      </h3>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart
          data={data}
          barCategoryGap="30%"
          barGap={8}
          margin={{ top: 8, right: 18, bottom: 10, left: 10 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={COLORS.border}
          />
          <XAxis
            dataKey="name"
            stroke={COLORS.textSecondary}
            fontSize={12}
            tickLine={false}
            axisLine={false}
            interval={0}
            minTickGap={16}
          />
          <YAxis
            stroke={COLORS.textSecondary}
            fontSize={11}
            tickFormatter={formatVND}
            tickLine={false}
            axisLine={false}
            tick={{ fill: COLORS.textSecondary }}
            width={52}
            domain={[0, (max: number) => Math.ceil(max * 1.08)]}
          />
          <Tooltip
            cursor={{ fill: "rgba(15, 23, 42, 0.06)" }}
            offset={18}
            contentStyle={{
              backgroundColor: "#FAF9F7", // Light Mode
              borderColor: "#475569",
              borderRadius: 8,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.14)",
              padding: "8px 10px",
            }}
            labelStyle={{
              color: COLORS.textPrimary,
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 4,
            }}
            itemStyle={{
              color: COLORS.textPrimary,
              fontSize: 12,
              padding: "1px 0",
            }}
            labelFormatter={(_label, payload) =>
              payload?.[0]?.payload?.fullDate || _label
            }
            formatter={(value) =>
              new Intl.NumberFormat("vi-VN").format(Number(value)) + " đ"
            }
          />
          {showBarSeries && (
            <Legend
              wrapperStyle={{ color: COLORS.textSecondary, fontSize: 12 }}
            />
          )}
          <Bar
            dataKey="warehouse"
            name="Kho"
            fill={COLORS.primary}
            radius={[4, 4, 0, 0]}
            barSize={barSize}
            minPointSize={minPointSize}
          />
          {showBarSeries && (
            <Bar
              dataKey="bar"
              name="Quầy Bar"
              fill={COLORS.positive}
              radius={[4, 4, 0, 0]}
              barSize={barSize}
              minPointSize={minPointSize}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Pie Chart: Loss Breakdown (Waste/Spoilage)
 */
export function LossBreakdownChart({ data }: { data: PieChartData[] }) {
  const hasData = hasLossBreakdownData(data);
  const legendItems = buildLossLegendItems(data);

  return (
    <div
      style={{
        height: 280,
        width: "100%",
        backgroundColor: COLORS.surface,
        padding: 16,
        borderRadius: 12,
        border: `1px solid ${COLORS.border}`,
        boxShadow: SHADOWS.card,
      }}
    >
      <h3
        style={{
          color: COLORS.textPrimary,
          fontWeight: 600,
          marginBottom: 16,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <TrendingDown size={18} color={COLORS.error} />
        Phân tích hao hụt
      </h3>
      {!hasData ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "calc(100% - 50px)",
            color: COLORS.textSecondary,
            fontSize: 14,
          }}
        >
          Chưa có dữ liệu hao hụt
        </div>
      ) : (
        <div style={{ height: "calc(100% - 34px)" }}>
          <div style={{ height: 178 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={2}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FAF9F7",
                    borderColor: COLORS.border,
                    borderRadius: 8,
                  }}
                  formatter={(value) =>
                    new Intl.NumberFormat("vi-VN").format(Number(value)) + " đ"
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "6px 12px",
              padding: "2px 4px 0",
              maxHeight: 38,
              overflow: "hidden",
            }}
          >
            {legendItems.map((item) => (
              <div
                key={item.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  minWidth: 0,
                  color: COLORS.textSecondary,
                  fontSize: 12,
                  lineHeight: "16px",
                }}
                title={`${item.name}: ${new Intl.NumberFormat("vi-VN").format(
                  item.value,
                )} đ`}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    flex: "0 0 10px",
                    backgroundColor: item.color,
                  }}
                />
                <span
                  style={{
                    maxWidth: 88,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.name} {item.percent}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Summary Card Component
 */
interface SummaryCardProps {
  title: string;
  value: string;
  subtitle?: string;
  color?: string;
  icon: React.ReactNode;
}

export function SummaryCard({
  title,
  value,
  subtitle,
  color = COLORS.primary,
  icon,
}: SummaryCardProps) {
  return (
    <div
      style={{
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        padding: 20,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `4px solid ${color}`,
        minWidth: 200,
        boxShadow: SHADOWS.card,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <p
            style={{
              color: COLORS.textSecondary,
              fontSize: 12,
              marginBottom: 4,
            }}
          >
            {title}
          </p>
          <p
            style={{
              color: COLORS.textPrimary,
              fontSize: 24,
              fontWeight: 700,
              margin: 0,
            }}
          >
            {value}
          </p>
          {subtitle && (
            <p
              style={{
                color: COLORS.textSecondary,
                fontSize: 11,
                marginTop: 4,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: `${color}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

/**
 * Main COGS Dashboard Component
 */
export function COGSDashboard({
  barData,
  pieData,
  summary,
  showBarSeries,
}: {
  barData: BarChartData[];
  pieData: PieChartData[];
  showBarSeries: boolean;
  summary: {
    totalValue: number;
    itemCount: number;
    lowStockCount: number;
    monthlyChange: number | null;
    monthlyChangeSubtitle?: string;
  };
}) {
  const hasMonthlyChange = summary.monthlyChange !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary Cards Row */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <SummaryCard
          icon={<DollarSign size={20} color={COLORS.primary} />}
          title="Tổng giá trị tồn kho"
          value={
            new Intl.NumberFormat("vi-VN").format(summary.totalValue) + " đ"
          }
          color={COLORS.primary}
        />
        <SummaryCard
          icon={<Package size={20} color={COLORS.positive} />}
          title="Số mặt hàng"
          value={summary.itemCount.toString()}
          subtitle="nguyên liệu"
          color={COLORS.positive}
        />
        <SummaryCard
          icon={
            <AlertTriangle
              size={20}
              color={
                summary.lowStockCount > 0 ? COLORS.warning : COLORS.positive
              }
            />
          }
          title="Sắp hết hàng"
          value={summary.lowStockCount.toString()}
          subtitle="cần nhập thêm"
          color={summary.lowStockCount > 0 ? COLORS.warning : COLORS.positive}
        />
        <SummaryCard
          icon={
            !hasMonthlyChange ? (
              <span style={{ color: COLORS.textMuted, fontSize: 20 }}>--</span>
            ) : summary.monthlyChange! >= 0 ? (
              <TrendingUp size={20} color={COLORS.positive} />
            ) : (
              <TrendingDown size={20} color={COLORS.error} />
            )
          }
          title="Biến động tháng"
          value={
            hasMonthlyChange
              ? (summary.monthlyChange! >= 0 ? "+" : "") +
                summary.monthlyChange!.toFixed(1) +
                "%"
              : "--"
          }
          subtitle={summary.monthlyChangeSubtitle ?? (hasMonthlyChange ? undefined : "chưa đủ dữ liệu")}
          color={
            !hasMonthlyChange
              ? COLORS.textMuted
              : summary.monthlyChange! >= 0
                ? COLORS.positive
                : COLORS.error
          }
        />
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <InventoryValueChart data={barData} showBarSeries={showBarSeries} />
        <LossBreakdownChart data={pieData} />
      </div>
    </div>
  );
}

export default COGSDashboard;
