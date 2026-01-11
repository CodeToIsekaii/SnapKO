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

interface BarChartData {
  name: string;
  warehouse: number;
  bar: number;
}

interface PieChartData {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number; // Index signature for Recharts compatibility
}

interface COGSChartProps {
  barData: BarChartData[];
  pieData?: PieChartData[];
}

/**
 * Format VND currency
 */
function formatVND(value: number): string {
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
export function InventoryValueChart({ data }: { data: BarChartData[] }) {
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
        <BarChart3 size={18} color={COLORS.primary} />
        Giá trị tồn kho theo tháng (VNĐ)
      </h3>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data}>
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
          />
          <YAxis
            stroke={COLORS.textSecondary}
            fontSize={11}
            tickFormatter={formatVND}
            tickLine={false}
            axisLine={false}
            tick={{ fill: COLORS.textSecondary }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FAF9F7", // Light Mode
              borderColor: "#475569",
              borderRadius: 8,
            }}
            labelStyle={{ color: COLORS.textPrimary }}
            itemStyle={{ color: COLORS.textPrimary }}
            formatter={(value) =>
              new Intl.NumberFormat("vi-VN").format(Number(value)) + " đ"
            }
          />
          <Bar
            dataKey="warehouse"
            name="Kho"
            fill={COLORS.primary}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="bar"
            name="Quầy Bar"
            fill={COLORS.positive}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Pie Chart: Loss Breakdown (Waste/Spoilage)
 */
export function LossBreakdownChart({ data }: { data: PieChartData[] }) {
  // Check if data is mock/empty (all values are round numbers ending in 00000)
  const isMockData = data.every((d) => d.value % 100000 === 0);
  const totalValue = data.reduce((sum, d) => sum + d.value, 0);

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
      {totalValue === 0 || isMockData ? (
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
        <ResponsiveContainer width="100%" height="85%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent }) =>
                `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={{ stroke: COLORS.textSecondary, strokeWidth: 1 }}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#FAF9F7", // Light Mode
                borderColor: COLORS.border,
                borderRadius: 8,
              }}
              formatter={(value) =>
                new Intl.NumberFormat("vi-VN").format(Number(value)) + " đ"
              }
            />
            <Legend
              wrapperStyle={{ color: COLORS.textSecondary, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
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
}: {
  barData: BarChartData[];
  pieData: PieChartData[];
  summary: {
    totalValue: number;
    itemCount: number;
    lowStockCount: number;
    monthlyChange: number;
  };
}) {
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
            summary.monthlyChange >= 0 ? (
              <TrendingUp size={20} color={COLORS.positive} />
            ) : (
              <TrendingDown size={20} color={COLORS.error} />
            )
          }
          title="Biến động tháng"
          value={
            (summary.monthlyChange >= 0 ? "+" : "") +
            summary.monthlyChange.toFixed(1) +
            "%"
          }
          color={summary.monthlyChange >= 0 ? COLORS.positive : COLORS.error}
        />
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <InventoryValueChart data={barData} />
        <LossBreakdownChart data={pieData} />
      </div>
    </div>
  );
}

export default COGSDashboard;
