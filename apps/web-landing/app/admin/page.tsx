"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../../lib/supabaseClient";
// Recharts disabled temporarily due to React 19 compatibility issues (useInsertionEffect error)
// import {
//   BarChart,
//   Bar,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   Tooltip,
//   Legend,
//   ResponsiveContainer,
// } from "recharts";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    activePro: 0,
    activePremium: 0,
    totalUsers: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseBrowserClient();

  // Anti-Spam: Prevent double fetching in React 18+ Strict Mode
  const isFetching = useRef(false);

  useEffect(() => {
    if (!isFetching.current) {
      fetchStats();
    }
  }, []);

  const fetchStats = async () => {
    if (isFetching.current) return;
    isFetching.current = true;

    try {
      // 1. Fetch all subscription history
      const { data: history, error: historyError } = await supabase
        .from("subscription_history")
        .select("*")
        .order("created_at", { ascending: true });

      if (historyError) throw historyError;

      // 2. Calculate Revenue & Chart Data
      let totalRevenue = 0;
      const monthlyStats: Record<
        string,
        { name: string; PRO: number; PREMIUM: number }
      > = {};

      history?.forEach((txn) => {
        totalRevenue += txn.amount_paid || 0;

        const date = new Date(txn.created_at);
        const monthKey = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`; // YYYY-MM
        const monthName = `T${date.getMonth() + 1}`;

        if (!monthlyStats[monthKey]) {
          monthlyStats[monthKey] = { name: monthName, PRO: 0, PREMIUM: 0 };
        }

        // Categorize by plan_code
        if (txn.plan_code?.includes("PREMIUM")) {
          monthlyStats[monthKey].PREMIUM += txn.amount_paid || 0;
        } else {
          // Default to PRO for anything else
          monthlyStats[monthKey].PRO += txn.amount_paid || 0;
        }
      });

      // Convert to array for Recharts
      const chartDataArray = Object.values(monthlyStats);
      setChartData(chartDataArray);

      // 3. Calculate Active Users (Pro vs Premium)
      // Strategy: Get all businesses with active subscription, then check their LATEST transaction
      const { data: businesses } = await supabase
        .from("businesses")
        .select("id, subscription_expires_at")
        .gt("subscription_expires_at", new Date().toISOString());

      let activePro = 0;
      let activePremium = 0;

      if (businesses && businesses.length > 0) {
        // For each active business, find their latest plan
        // This is a bit N+1 but acceptable for small admin dashboard.
        // Better: Fetch latest history for these IDs in one query if possible, but history is many-to-one.
        // Optimization: Fetch all history for these businesses and map in JS.

        const businessIds = businesses.map((b) => b.id);
        const { data: latestPlans } = await supabase
          .from("subscription_history")
          .select("business_id, plan_code, created_at")
          .in("business_id", businessIds)
          .order("created_at", { ascending: false }); // We need top 1 per business

        // Map businessId -> latest plan code
        const businessPlanMap = new Map();
        latestPlans?.forEach((p) => {
          if (!businessPlanMap.has(p.business_id)) {
            businessPlanMap.set(p.business_id, p.plan_code);
          }
        });

        businesses.forEach((b) => {
          const code = businessPlanMap.get(b.id) || "";
          if (code.includes("PREMIUM")) {
            activePremium++;
          } else {
            activePro++;
          }
        });
      }

      // 4. Total Businesses
      const { count: totalCount } = await supabase
        .from("businesses")
        .select("*", { count: "exact", head: true });

      setStats({
        totalRevenue,
        activePro,
        activePremium,
        totalUsers: totalCount || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
      </div>
    );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">Overview</h2>
        <Link
          href="/admin/plans"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
        >
          Manage Plans →
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        {/* Revenue */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Total Revenue
          </h3>
          <p className="mt-2 text-2xl font-extrabold text-orange-600">
            {formatCurrency(stats.totalRevenue)}
          </p>
          <p className="mt-1 text-xs text-slate-400">All time earnings</p>
        </div>

        {/* PRO Users */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Active PRO
          </h3>
          <p className="mt-2 text-2xl font-extrabold text-green-600">
            {stats.activePro}
          </p>
          <p className="mt-1 text-xs text-slate-400">Standard Plan</p>
        </div>

        {/* PREMIUM Users */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-orange-100 bg-orange-50/50">
          <h3 className="text-xs font-bold text-orange-600 uppercase tracking-wider">
            Active PREMIUM
          </h3>
          <p className="mt-2 text-2xl font-extrabold text-orange-700">
            {stats.activePremium}
          </p>
          <p className="mt-1 text-xs text-orange-400">Model C / Chain</p>
        </div>

        {/* Total Users */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Total Businesses
          </h3>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {stats.totalUsers}
          </p>
          <p className="mt-1 text-xs text-slate-400">Registered entities</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-900 mb-6">
          Revenue Analytics
        </h3>
        <div className="h-80 w-full flex items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-lg">
          {/* Recharts disabled due to React 19 compatibility issues */}
          Chart temporarily disabled (React 19 Compatibility)
          {/* {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={chartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" />
                        <YAxis 
                            tickFormatter={(value) => new Intl.NumberFormat('vi-VN', { notation: "compact", compactDisplay: "short" }).format(value)}
                        />
                        <Tooltip 
                            formatter={(value: number) => formatCurrency(value)}
                            cursor={{ fill: 'transparent' }}
                        />
                        <Legend />
                        <Bar dataKey="PRO" stackId="a" fill="#22c55e" name="PRO Revenue" radius={[0, 0, 4, 4]} />
                        <Bar dataKey="PREMIUM" stackId="a" fill="#f97316" name="PREMIUM Revenue" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <div className="h-full flex items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-lg">
                    No revenue data yet
                </div>
            )} */}
        </div>
      </div>
    </div>
  );
}
