"use client";

import { useEffect, useState } from "react";
import { apiFetch, getStoredRefreshToken } from "@/lib/backendClient";
import Link from "next/link";

interface Ingredient {
  id: string;
  name: string;
  warehouse_qty: number;
  bar_qty: number;
  unit_cost: number;
}

interface DailySummary {
  date: string;
  imports: number;
  waste: number;
}

interface ShrinkageBreakdown {
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
  breakdown: ShrinkageBreakdown[];
}

export default function ReportsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary[]>([]);
  const [shrinkage, setShrinkage] = useState<ShrinkageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    if (getStoredRefreshToken()) {
      setIsLoggedIn(true);
      loadData();
    } else {
      setLoading(false);
    }
  }

  async function loadData() {
    setLoading(true);

    try {
      // Load ingredients via BE-SnapKO (already filtered by businessId + deletedAt)
      const ing = await apiFetch<
        Array<{
          id: string;
          name: string;
          warehouseQty?: number;
          barQty?: number;
          unitCost?: number;
        }>
      >("/ingredients");

      if (ing) {
        setIngredients(
          ing.map((i) => ({
            id: i.id,
            name: i.name,
            warehouse_qty: Number(i.warehouseQty ?? 0),
            bar_qty: Number(i.barQty ?? 0),
            unit_cost: Number(i.unitCost ?? 0),
          }))
        );
      }

      // Load inventory logs for last 30 days
      const logs = await apiFetch<
        Array<{
          id: string;
          type: string;
          finalConfirmedQuantity?: number;
          unitCostAtTime?: number;
          createdAt: string;
        }>
      >("/inventory/logs?days=30&limit=500");

      if (logs) {
        const dailyMap = new Map<string, { imports: number; waste: number }>();

        logs.forEach((log) => {
          const date = log.createdAt.split("T")[0];
          const existing = dailyMap.get(date) || { imports: 0, waste: 0 };
          const cost =
            (Number(log.finalConfirmedQuantity) || 0) *
            (Number(log.unitCostAtTime) || 0);

          if (log.type === "IMPORT") existing.imports += cost;
          else if (log.type === "WASTE") existing.waste += Math.abs(cost);

          dailyMap.set(date, existing);
        });

        const summary: DailySummary[] = [];
        dailyMap.forEach((value, date) => summary.push({ date, ...value }));
        setDailySummary(summary.sort((a, b) => b.date.localeCompare(a.date)));
      }
      // Load shrinkage breakdown from backend (BE-SnapKO uses COGS + flagged)
      try {
        const shrinkageRes = await apiFetch<ShrinkageData>(
          "/reports/shrinkage?days=30"
        );
        if (shrinkageRes) setShrinkage(shrinkageRes);
      } catch (e) {
        console.error("Shrinkage load failed:", e);
      }
    } catch (err) {
      console.error("Reports load failed:", err);
    } finally {
      setLoading(false);
    }
  }

  // Calculations
  const totalInventoryValue = ingredients.reduce(
    (sum, i) => sum + (i.warehouse_qty + i.bar_qty) * i.unit_cost,
    0
  );
  const totalImports = dailySummary.reduce((sum, d) => sum + d.imports, 0);
  const totalWaste = dailySummary.reduce((sum, d) => sum + d.waste, 0);

  if (!isLoggedIn && !loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">
            Vui lòng đăng nhập để xem báo cáo
          </p>
          <Link href="/dashboard" className="text-blue-400 underline">
            Đi đến Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Báo cáo COGS</h1>
            <p className="text-slate-400 text-sm">30 ngày gần nhất</p>
          </div>
          <Link href="/dashboard" className="text-blue-400 text-sm">
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="p-6 max-w-6xl mx-auto">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-slate-800 rounded-xl p-6">
                <p className="text-slate-400 text-sm">Giá trị tồn kho</p>
                <p className="text-2xl font-bold text-green-400">
                  {totalInventoryValue.toLocaleString("vi-VN")} đ
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  {ingredients.length} nguyên liệu
                </p>
              </div>

              <div className="bg-slate-800 rounded-xl p-6">
                <p className="text-slate-400 text-sm">Tổng nhập (30 ngày)</p>
                <p className="text-2xl font-bold text-blue-400">
                  {totalImports.toLocaleString("vi-VN")} đ
                </p>
              </div>

              <div className="bg-slate-800 rounded-xl p-6">
                <p className="text-slate-400 text-sm">Hao hụt (30 ngày)</p>
                <p className="text-2xl font-bold text-red-400">
                  {totalWaste.toLocaleString("vi-VN")} đ
                </p>
              </div>

              <div className="bg-slate-800 rounded-xl p-6">
                <p className="text-slate-400 text-sm">Chi phí ròng</p>
                <p className="text-2xl font-bold text-amber-400">
                  {(totalImports - totalWaste).toLocaleString("vi-VN")} đ
                </p>
              </div>
            </div>

            {/* Daily Chart */}
            <div className="bg-slate-800 rounded-xl p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Chi phí theo ngày</h2>

              <div className="space-y-3">
                {dailySummary.slice(0, 7).map((day) => {
                  const maxValue = Math.max(
                    ...dailySummary.map((d) => d.imports),
                    1
                  );
                  const importWidth = (day.imports / maxValue) * 100;
                  const wasteWidth = (day.waste / maxValue) * 100;

                  return (
                    <div key={day.date}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-400">
                          {new Date(day.date).toLocaleDateString("vi-VN", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <span className="text-slate-300">
                          {(day.imports - day.waste).toLocaleString("vi-VN")} đ
                        </span>
                      </div>
                      <div className="flex gap-1 h-4">
                        <div
                          className="bg-blue-500 rounded"
                          style={{ width: `${importWidth}%` }}
                        />
                        <div
                          className="bg-red-500 rounded"
                          style={{ width: `${wasteWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-4 mt-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-blue-500 rounded" /> Nhập hàng
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-red-500 rounded" /> Hao hụt
                </span>
              </div>
            </div>

            {/* Shrinkage Breakdown (from backend /reports/shrinkage) */}
            {shrinkage && shrinkage.breakdown.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-6 mb-8">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">Hao hụt chi tiết</h2>
                    <p className="text-slate-400 text-sm">
                      {shrinkage.period.days} ngày · tính theo COGS
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-red-400">
                      {shrinkage.totalLossVnd.toLocaleString("vi-VN")} đ
                    </p>
                    <p className="text-slate-500 text-xs">
                      {shrinkage.totalLossQty.toFixed(2)} đơn vị
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {shrinkage.breakdown.slice(0, 10).map((item) => (
                    <div
                      key={item.ingredientId}
                      className="flex justify-between items-center py-2 border-b border-slate-700"
                    >
                      <div className="flex items-center gap-2">
                        <span>{item.name}</span>
                        {item.flagged && (
                          <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded">
                            ⚠ Nghi vấn
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-red-400 font-semibold">
                          {item.lossVnd.toLocaleString("vi-VN")} đ
                        </span>
                        <span className="text-slate-500 text-xs ml-3">
                          {item.lossQty.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Ingredients by Value */}
            <div className="bg-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">
                Top nguyên liệu (giá trị)
              </h2>

              <div className="space-y-3">
                {ingredients
                  .map((ing) => ({
                    ...ing,
                    value: (ing.warehouse_qty + ing.bar_qty) * ing.unit_cost,
                  }))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 10)
                  .map((ing) => (
                    <div
                      key={ing.id}
                      className="flex justify-between py-2 border-b border-slate-700"
                    >
                      <span>{ing.name}</span>
                      <span className="text-green-400">
                        {ing.value.toLocaleString("vi-VN")} đ
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
