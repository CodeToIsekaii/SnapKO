"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { User } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import {
  apiFetch,
  getStoredRefreshToken,
  loginMobile,
  logoutBackend,
} from "@/lib/backendClient";

type SubscriptionStatus = "TRIAL" | "ACTIVE" | "WARNING" | "EXPIRED" | null;

type PendingProfile = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  status: string;
  role: string;
};

type BackendProfile = {
  id: string;
  role: string;
  businessId: string | null;
  business?: {
    id: string;
    tier: string;
    effectiveTier?: string;
    subscriptionStatus?: SubscriptionStatus;
    daysRemaining?: number;
    subscriptionExpiresAt: string | null;
  } | null;
};

type BackendPendingProfile = {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
  status: string;
  role: string;
};

type BusinessInfo = {
  tier: string;
  effective_tier: string;
  subscription_status: SubscriptionStatus;
  days_remaining: number;
  subscription_expires_at: string | null;
};

function friendlyError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.startsWith("apiFetch")) {
      return "Không tải được dữ liệu. Vui lòng thử lại sau.";
    }
    return error.message;
  }
  return "Đã có lỗi xảy ra. Vui lòng thử lại.";
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState<PendingProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);

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

      if (!getStoredRefreshToken() && data.session.access_token) {
        try {
          await loginMobile(data.session.access_token);
        } catch (e) {
          console.error("Dashboard: login-mobile exchange failed:", e);
          router.push("/auth/login");
          return;
        }
      }

      try {
        const profile = await apiFetch<BackendProfile>("/profiles/me");

        if (profile?.role === "ADMIN") {
          router.push("/admin");
          return;
        }

        if (profile?.business && mounted) {
          setBusinessInfo({
            tier: profile.business.tier,
            effective_tier:
              profile.business.effectiveTier ?? profile.business.tier ?? "FREE",
            subscription_status: profile.business.subscriptionStatus ?? null,
            days_remaining: Math.max(0, profile.business.daysRemaining ?? 0),
            subscription_expires_at:
              profile.business.subscriptionExpiresAt ?? null,
          });
        }
      } catch (e) {
        console.error("Dashboard: backend profile fetch failed:", e);
        router.push("/auth/login");
        return;
      }

      setIsLoading(false);
      refreshPending().catch((e) => setError(friendlyError(e)));
    };

    checkSession();

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
      },
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, router]);

  async function refreshPending() {
    try {
      const data = await apiFetch<BackendPendingProfile[]>("/profiles/pending");
      setPending(
        (data ?? []).map((p) => ({
          id: p.id,
          full_name: p.fullName,
          phone_number: p.phoneNumber,
          status: p.status,
          role: p.role,
        })),
      );
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  const handleLogout = async () => {
    setBusy(true);
    try {
      await logoutBackend();
    } catch (e) {
      console.warn("Dashboard: backend logout failed:", e);
    }
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    setBusy(false);
  };

  const approve = async (id: string, isApproved: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/profiles/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: isApproved ? "ACTIVE" : "REJECTED",
        }),
      });
      await refreshPending();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const formatDateVN = (dateString: string | null) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const subscriptionStatus = businessInfo?.subscription_status ?? null;
  const effectiveTier = businessInfo?.effective_tier ?? "FREE";
  const daysRemaining = Math.max(0, businessInfo?.days_remaining ?? 0);
  const isTrial = subscriptionStatus === "TRIAL";
  const isPaidActive =
    subscriptionStatus === "ACTIVE" || subscriptionStatus === "WARNING";
  const isExpired = subscriptionStatus === "EXPIRED";
  const statusLabel = isTrial ? "TRIAL" : isPaidActive ? effectiveTier : "FREE";
  const statusValue = isExpired ? "Đã hết hạn" : `${daysRemaining} ngày`;
  const statusHelp = isExpired
    ? businessInfo?.subscription_expires_at
      ? `Hết hạn ngày ${formatDateVN(businessInfo.subscription_expires_at)}`
      : "Gói dùng thử hoặc gói trả phí đã hết hạn."
    : isTrial
      ? "Giai đoạn dùng thử còn hiệu lực."
      : isPaidActive
        ? `Gói ${effectiveTier} đang hoạt động.`
        : "Đang dùng gói miễn phí.";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F7]">
        <div className="h-16 border-b border-[#E0DCD5] bg-white" />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <div className="mb-8 space-y-3">
            <div className="h-9 w-72 animate-pulse rounded-lg bg-[#E0DCD5]" />
            <div className="h-5 w-96 animate-pulse rounded bg-[#E0DCD5]" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="h-36 animate-pulse rounded-lg border border-[#E0DCD5] bg-white" />
            <div className="h-36 animate-pulse rounded-lg border border-[#E0DCD5] bg-white" />
            <div className="h-36 animate-pulse rounded-lg border border-[#E0DCD5] bg-white" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F4EF]">
      {subscriptionStatus === "WARNING" && (
        <div className="border-b border-orange-100 bg-orange-50 px-4 py-2">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 text-sm text-orange-700">
            <span>
              Gói cước còn {daysRemaining} ngày
              {businessInfo?.subscription_expires_at
                ? `, hết hạn ngày ${formatDateVN(
                    businessInfo.subscription_expires_at,
                  )}`
                : ""}
              .
            </span>
            <Link href="/pricing" className="font-semibold hover:underline">
              Gia hạn
            </Link>
          </div>
        </div>
      )}

      {isExpired && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 text-sm text-red-700">
            <span>{statusHelp}</span>
            <Link href="/pricing" className="font-semibold hover:underline">
              Chọn gói
            </Link>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-[#E0DCD5] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="SnapKO Logo"
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
            <div>
              <div className="font-bold text-[#1E1E1E]">SnapKO</div>
              <div className="text-xs font-medium text-[#6F6B63]">
                Dashboard
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-[#E0DCD5] bg-[#FAF9F7] px-3 py-1.5 text-xs font-semibold text-[#1E1E1E] md:flex">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Hệ thống ổn định
            </div>
            <button
              onClick={handleLogout}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#6F6B63] transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-[#1E1E1E]">
            Xin chào,{" "}
            {user?.user_metadata?.full_name ||
              user?.email?.split("@")[0] ||
              "Chủ quán"}
          </h1>
          <p className="mt-2 text-[#6F6B63]">
            Quản lý yêu cầu tham gia, gói cước và tải ứng dụng SnapKO.
          </p>
        </motion.div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-lg border border-[#E0DCD5] bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-[#E07A2F]">
                <Users className="h-5 w-5" />
              </div>
              {pending.length > 0 && (
                <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold text-orange-700">
                  CẦN DUYỆT
                </span>
              )}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6F6B63]">
              Nhân viên chờ duyệt
            </p>
            <p className="mt-1 text-3xl font-bold text-[#1E1E1E]">
              {pending.length}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-lg border border-[#E0DCD5] bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex items-start justify-between">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  isExpired
                    ? "bg-red-50 text-red-600"
                    : isPaidActive
                      ? "bg-green-50 text-green-600"
                      : "bg-blue-50 text-blue-600"
                }`}
              >
                <ShieldCheck className="h-5 w-5" />
              </div>
              <span className="rounded-full bg-[#FAF9F7] px-2 py-1 text-[10px] font-bold uppercase text-[#6F6B63]">
                {statusLabel}
              </span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6F6B63]">
              Thời hạn sử dụng
            </p>
            <p className="mt-1 text-3xl font-bold text-[#1E1E1E]">
              {statusValue}
            </p>
            <p className="mt-2 text-sm text-[#6F6B63]">{statusHelp}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-lg border border-[#E0DCD5] bg-[#1E1E1E] p-5 text-white shadow-sm"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-[#E07A2F]">
              <Monitor className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Báo cáo chi tiết
            </p>
            <p className="mt-1 text-xl font-bold">Tải Desktop để xem</p>
            <p className="mt-2 text-sm text-white/70">
              Báo cáo tồn kho, giá vốn và phân tích vận hành nằm trong ứng dụng
              Desktop.
            </p>
          </motion.div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="overflow-hidden rounded-lg border border-[#E0DCD5] bg-white shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-[#E0DCD5] bg-[#FAF9F7]/60 p-5">
                <div>
                  <h2 className="text-lg font-bold text-[#1E1E1E]">
                    Yêu cầu tham gia
                  </h2>
                  <p className="text-sm text-[#6F6B63]">
                    Duyệt nhân viên để họ truy cập app mobile.
                  </p>
                </div>
                <button
                  onClick={refreshPending}
                  disabled={busy}
                  className="rounded-lg p-2 text-[#6F6B63] transition-colors hover:bg-white hover:text-[#1E1E1E] disabled:opacity-50"
                  title="Làm mới"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>

              {error && (
                <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="divide-y divide-[#E0DCD5]/70">
                {pending.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FAF9F7]">
                      <CheckCircle2 className="h-7 w-7 text-[#6B8E23]" />
                    </div>
                    <p className="font-semibold text-[#1E1E1E]">
                      Không có yêu cầu chờ duyệt
                    </p>
                    <p className="mt-1 text-sm text-[#6F6B63]">
                      Khi nhân viên nhập mã mời, yêu cầu sẽ xuất hiện tại đây.
                    </p>
                  </div>
                ) : (
                  pending.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col gap-4 p-5 transition-colors hover:bg-[#FAF9F7]/50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1E1E1E] text-base font-bold text-white">
                          {p.full_name
                            ? p.full_name.charAt(0).toUpperCase()
                            : "?"}
                        </div>
                        <div>
                          <div className="font-bold text-[#1E1E1E]">
                            {p.full_name ?? "Chưa đặt tên"}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-[#6F6B63]">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                            {p.phone_number ?? "Không có SĐT"} - {p.role}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approve(p.id, true)}
                          disabled={busy}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1E1E1E] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 sm:flex-none"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Duyệt
                        </button>
                        <button
                          onClick={() => approve(p.id, false)}
                          disabled={busy}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#E0DCD5] bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 disabled:opacity-50 sm:flex-none"
                        >
                          <XCircle className="h-4 w-4" />
                          Từ chối
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>

          <aside className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#6F6B63]">
              Truy cập nhanh
            </h3>

            <Link
              href="/pricing"
              className="group block rounded-lg border border-[#E0DCD5] bg-white p-4 transition-colors hover:border-[#E07A2F]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-[#1E1E1E] transition-colors group-hover:text-[#E07A2F]">
                    Quản lý gói cước
                  </h4>
                  <p className="mt-0.5 text-xs text-[#6F6B63]">
                    {isPaidActive
                      ? `Đang dùng gói ${effectiveTier}`
                      : "Chọn Free, Pro hoặc Chain"}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-[#C8C2B8]" />
              </div>
            </Link>

            <Link
              href="/download"
              className="group block rounded-lg border border-[#E0DCD5] bg-white p-4 transition-colors hover:border-[#E07A2F]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-50 text-[#E07A2F]">
                  <Download className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-[#1E1E1E] transition-colors group-hover:text-[#E07A2F]">
                    Tải Desktop
                  </h4>
                  <p className="mt-0.5 text-xs text-[#6F6B63]">
                    Xem báo cáo chi tiết trên máy tính.
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-[#C8C2B8]" />
              </div>
            </Link>

            <div className="rounded-lg border border-[#E0DCD5] bg-[#FAF9F7] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1E1E1E]">
                <Clock className="h-4 w-4 text-[#6F6B63]" />
                Gợi ý vận hành
              </div>
              <p className="text-sm leading-6 text-[#6F6B63]">
                Dùng web để duyệt nhân viên và quản lý gói. Các báo cáo vận
                hành đầy đủ nên xem trong app Desktop để có đủ không gian dữ
                liệu.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
