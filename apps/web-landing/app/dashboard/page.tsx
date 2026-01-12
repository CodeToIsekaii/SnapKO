"use client";

import Image from "next/image";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { User } from "@supabase/supabase-js";
import {
  LogOut,
  User as UserIcon,
  Users,
  CheckCircle2,
  XCircle,
  BarChart3,
  CreditCard,
  ShieldCheck,
  Zap,
  LayoutDashboard,
  Clock,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";

/**
 * Owner Dashboard - Staff Approval Page
 * UI/UX Pro Max Edition
 */

type PendingProfile = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  status: string;
  role: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState<PendingProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [businessInfo, setBusinessInfo] = useState<{
    tier: string;
    subscription_expires_at: string | null;
  } | null>(null);

  // Check for OAuth error in URL params
  const oauthError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const authError = oauthError
    ? `${oauthError}${errorDescription ? `: ${errorDescription}` : ""}`
    : null;

  // Check session and redirect if not logged in
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!data.session) {
        router.push("/auth/login");
        return;
      }
      setUser(data.session.user);

      // Fetch Profile AND Business Info
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, business_id")
        .eq("id", data.session.user.id)
        .single();

      if (profile?.role === "ADMIN") {
        router.push("/admin");
        return;
      }

      // Fetch Business Subscription Status
      if (profile?.business_id) {
        const { data: business } = await supabase
          .from("businesses")
          .select("id, tier, subscription_expires_at")
          .eq("id", profile.business_id)
          .single();

        if (mounted && business) {
          setBusinessInfo(business);
        }
      }

      setIsLoading(false);
      // Load pending in background, don't block
      refreshPending().catch(console.error);
    };

    checkSession();

    // Auth Listener
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (event === "SIGNED_OUT") {
          router.push("/");
        } else if (!session) {
          router.push("/auth/login");
        } else {
          setUser(session.user);
        }
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, router]);

  // Helper to fetch pending staff
  async function refreshPending() {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone_number, status, role")
        .eq("role", "STAFF")
        .eq("status", "PENDING")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPending((data ?? []) as PendingProfile[]);
    } catch (e: unknown) {
      let message = "Unknown error";
      if (e instanceof Error) {
        message = e.message;
      } else if (typeof e === "object" && e !== null) {
        message = JSON.stringify(e);
      } else {
        message = String(e);
      }
      setError(message);
    }
  }

  // Handle Logout
  const handleLogout = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error.message);
    }
    setBusy(false);
  };

  // Handle Approve/Reject
  const approve = async (id: string, isApproved: boolean) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: isApproved ? "ACTIVE" : "REJECTED" })
        .eq("id", id);

      if (error) throw error;
      await refreshPending(); // Refresh the list after approval/rejection
    } catch (e: unknown) {
      let message = "Unknown error";
      if (e instanceof Error) {
        message = e.message;
      } else if (typeof e === "object" && e !== null) {
        message = JSON.stringify(e);
      } else {
        message = String(e);
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  // Calculate logic (Trial, Pro, etc.)
  const getTrialDaysLeft = () => {
    if (!user?.created_at) return 14;
    const createdAt = new Date(user.created_at);
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, 14 - diffDays);
  };

  const getSubscriptionDaysLeft = () => {
    if (!businessInfo?.subscription_expires_at) return 0;
    const expiresAt = new Date(businessInfo.subscription_expires_at);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  const trialDaysLeft = getTrialDaysLeft();
  const isTrialExpired = trialDaysLeft === 0;
  const subscriptionDaysLeft = getSubscriptionDaysLeft();

  const GRACE_PERIOD_DAYS = -2;
  const hasValidSubscription =
    subscriptionDaysLeft >= GRACE_PERIOD_DAYS &&
    !!businessInfo?.subscription_expires_at;
  const isTierPaid = businessInfo?.tier && businessInfo.tier !== "FREE";
  const isPaidPlan = isTierPaid || hasValidSubscription;
  const isExpiringSoon =
    isPaidPlan &&
    subscriptionDaysLeft <= 7 &&
    subscriptionDaysLeft >= GRACE_PERIOD_DAYS;
  const isPaidExpired =
    (isTierPaid || businessInfo?.subscription_expires_at) &&
    subscriptionDaysLeft < GRACE_PERIOD_DAYS;
  const shouldShowTrialBanner = !isPaidPlan && !isPaidExpired;

  // Formatter for Vietnam Time
  const formatDateVN = (dateString: string | null) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F7]">
        {/* Header Skeleton */}
        <div className="bg-white border-b border-[#E0DCD5] h-[64px]" />
        <main className="max-w-5xl mx-auto px-4 py-8">
          {/* Title Skeleton */}
          <div className="mb-8 space-y-3">
            <div className="h-10 w-64 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
          </div>
          {/* Content Skeleton */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="col-span-2 space-y-6">
              <div className="h-64 bg-white rounded-2xl border border-[#E0DCD5] animate-pulse" />
            </div>
            <div className="space-y-6">
              <div className="h-32 bg-white rounded-2xl border border-[#E0DCD5] animate-pulse" />
              <div className="h-32 bg-white rounded-2xl border border-[#E0DCD5] animate-pulse" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      {/* --- NOTIFICATIONS / BANNERS --- */}
      {isExpiringSoon && (
        <div className="bg-orange-50 border-b border-orange-100 px-4 py-2">
          <div className="max-w-5xl mx-auto flex items-center justify-between text-orange-700 text-sm">
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              {subscriptionDaysLeft >= 0
                ? `Gói cước sắp hết hạn vào ngày ${formatDateVN(
                    businessInfo?.subscription_expires_at!
                  )}.`
                : `Gói cước đã hết hạn. Bạn có 2 ngày ân hạn.`}
            </span>
            <Link
              href="/pricing"
              className="underline font-semibold hover:text-orange-800"
            >
              Gia hạn ngay →
            </Link>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-xl border-b border-[#E0DCD5] shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <Image
              src="/logo.png"
              alt="SnapKO Logo"
              width={80}
              height={80}
              className="w-10 h-10 object-contain"
            />
            <span className="text-[#1E1E1E] font-bold text-lg tracking-tight group-hover:text-[#E07A2F] transition-colors">
              SnapKO{" "}
              <span className="text-[#6F6B63] font-medium text-sm ml-1">
                Dashboard
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#FAF9F7] rounded-full border border-[#E0DCD5]">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-semibold text-[#1E1E1E]">
                Hệ thống ổn định
              </span>
            </div>
            <div className="h-6 w-px bg-[#E0DCD5]" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-medium text-[#6F6B63] hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <h1 className="text-3xl font-bold text-[#1E1E1E] mb-2">
            Xin chào,{" "}
            {user?.user_metadata?.full_name ||
              user?.email?.split("@")[0] ||
              "Chủ quán"}{" "}
            👋
          </h1>
          <p className="text-[#6F6B63] text-lg">
            Chào mừng trở lại. Đây là tổng quan hoạt động của quán hôm nay.
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {/* Stat 1: Pending Staff */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-5 rounded-2xl border border-[#E0DCD5] shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-[#E07A2F]">
                <Users className="w-5 h-5" />
              </div>
              {pending.length > 0 && (
                <span className="px-2 py-1 bg-orange-100 text-orange-700 text-[10px] font-bold rounded-full">
                  ACTION
                </span>
              )}
            </div>
            <p className="text-[13px] font-medium text-[#6F6B63] uppercase tracking-wide">
              Nhân viên chờ duyệt
            </p>
            <h3 className="text-3xl font-bold text-[#1E1E1E] mt-1">
              {pending.length}
            </h3>
          </motion.div>

          {/* Stat 2: Trial/Plan Status */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white p-5 rounded-2xl border border-[#E0DCD5] shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start mb-4">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isPaidPlan
                    ? "bg-green-50 text-green-600"
                    : "bg-blue-50 text-blue-600"
                }`}
              >
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="px-2 py-1 bg-[#FAF9F7] text-[#6F6B63] text-[10px] font-bold rounded-full uppercase">
                {isPaidPlan ? "PRO PLAN" : "TRIAL"}
              </span>
            </div>
            <p className="text-[13px] font-medium text-[#6F6B63] uppercase tracking-wide">
              Thời hạn sử dụng
            </p>
            <h3 className="text-3xl font-bold text-[#1E1E1E] mt-1">
              {isPaidPlan
                ? `${subscriptionDaysLeft} ngày`
                : `${trialDaysLeft} ngày`}
            </h3>
          </motion.div>

          {/* Stat 3: Report (Static Example) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white p-5 rounded-2xl border border-[#E0DCD5] shadow-sm hover:shadow-md transition-all opacity-70"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                <BarChart3 className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[13px] font-medium text-[#6F6B63] uppercase tracking-wide">
              Báo cáo tồn kho
            </p>
            <h3 className="text-xl font-bold text-[#1E1E1E] mt-1">
              Xem desktop để chi tiết hơn
            </h3>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Column: Staff List */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl border border-[#E0DCD5] shadow-sm overflow-hidden"
            >
              <div className="p-6 border-b border-[#E0DCD5] flex justify-between items-center bg-[#FAF9F7]/50">
                <div>
                  <h2 className="text-lg font-bold text-[#1E1E1E]">
                    Yêu cầu tham gia
                  </h2>
                  <p className="text-sm text-[#6F6B63]">
                    Duyệt nhân viên để họ có thể truy cập app mobile
                  </p>
                </div>
                <button
                  onClick={refreshPending}
                  disabled={busy}
                  className="p-2 hover:bg-white hover:shadow-sm rounded-lg text-[#6F6B63] transition-all"
                  title="Làm mới"
                >
                  <Clock className="w-4 h-4" />
                </button>
              </div>

              {error && (
                <div className="p-4 m-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div className="divide-y divide-[#E0DCD5]/50">
                {pending.length === 0 ? (
                  <div className="p-12 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-[#FAF9F7] rounded-full flex items-center justify-center mb-4">
                      <CheckCircle2 className="w-8 h-8 text-[#E0DCD5]" />
                    </div>
                    <p className="text-[#1E1E1E] font-medium">
                      Tất cả đã được giải quyết
                    </p>
                    <p className="text-sm text-[#6F6B63] mt-1">
                      Hiện không có yêu cầu nào đang chờ duyệt.
                    </p>
                  </div>
                ) : (
                  pending.map((p) => (
                    <div
                      key={p.id}
                      className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#FAF9F7]/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                          {p.full_name
                            ? p.full_name.charAt(0).toUpperCase()
                            : "?"}
                        </div>
                        <div>
                          <div className="font-bold text-[#1E1E1E]">
                            {p.full_name ?? "Chưa đặt tên"}
                          </div>
                          <div className="text-sm text-[#6F6B63] flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                            {p.phone_number ?? "Không có SĐT"} • {p.role}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approve(p.id, true)}
                          disabled={busy}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#1E1E1E] text-white text-sm font-semibold rounded-xl hover:bg-black transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="sm:hidden lg:inline">Duyệt</span>
                        </button>
                        <button
                          onClick={() => approve(p.id, false)}
                          disabled={busy}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-[#E0DCD5] text-red-600 text-sm font-semibold rounded-xl hover:bg-red-50 hover:border-red-200 transition-all active:scale-95 disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          <span className="sm:hidden lg:inline">Từ chối</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>

          {/* Sidebar Column: Quick Actions */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h3 className="text-sm font-bold text-[#6F6B63] uppercase tracking-wider mb-4">
                Truy cập nhanh
              </h3>
              <div className="space-y-4">
                <Link
                  href="/reports"
                  className="group block p-4 bg-white border border-[#E0DCD5] rounded-2xl hover:border-[#E07A2F] hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                      <BarChart3 className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-[#1E1E1E] group-hover:text-[#E07A2F] transition-colors">
                        Báo cáo tồn kho
                      </h4>
                      <p className="text-xs text-[#6F6B63] mt-0.5">
                        Xem biểu đồ & số liệu chi tiết
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[#E0DCD5] group-hover:text-[#E07A2F] transition-colors" />
                  </div>
                </Link>

                <Link
                  href="/pricing"
                  className="group block p-4 bg-white border border-[#E0DCD5] rounded-2xl hover:border-[#E07A2F] hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-[#1E1E1E] group-hover:text-[#E07A2F] transition-colors">
                        Quản lý gói cước
                      </h4>
                      <p className="text-xs text-[#6F6B63] mt-0.5">
                        {isPaidPlan ? "Đang dùng gói Pro" : "Nâng cấp ngay"}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[#E0DCD5] group-hover:text-[#E07A2F] transition-colors" />
                  </div>
                </Link>

                {/* Promo Card mobile friendly */}
                <div className="p-5 bg-gradient-to-br from-[#1E1E1E] to-[#3f3f3f] rounded-2xl text-white shadow-lg relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                  <h4 className="font-bold text-lg relative z-10">
                    Tải App Desktop?
                  </h4>
                  <p className="text-white/80 text-sm mt-1 mb-4 relative z-10">
                    Trải nghiệm tốt nhất trên điện thoại của bạn.
                  </p>
                  <Link
                    href="/download"
                    className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2 rounded-xl text-sm font-semibold transition-all relative z-10"
                  >
                    <Zap className="w-4 h-4 text-[#E07A2F]" /> Tải ngay
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
