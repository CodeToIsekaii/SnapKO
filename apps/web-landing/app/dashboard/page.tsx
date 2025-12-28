"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { User } from "@supabase/supabase-js";

/**
 * Owner Dashboard - Staff Approval Page
 * Requires login, redirects to /auth/login if not authenticated
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
      setIsLoading(false);
      // Load pending in background, don't block
      refreshPending().catch(console.error);
    };

    checkSession();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (event === "SIGNED_OUT" || !session) {
          router.push("/auth/login");
        } else {
          setUser(session.user);
          setIsLoading(false); // Ensure loading is set to false
          refreshPending().catch(console.error);
        }
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, router]);

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

  async function approve(profileId: string, isApproved: boolean) {
    setError(null);
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anonKey) throw new Error("Missing Supabase config");

      const res = await fetch(`${url}/functions/v1/invite-approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ profileId, approve: isApproved }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      await refreshPending();
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
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  // Calculate trial days remaining (14 days from account creation)
  const getTrialDaysLeft = () => {
    if (!user?.created_at) return 14;
    const createdAt = new Date(user.created_at);
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, 14 - diffDays);
  };

  const trialDaysLeft = getTrialDaysLeft();
  const isTrialExpired = trialDaysLeft === 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center">
        <div className="text-[#6F6B63]">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      {/* Header */}
      <header className="bg-white border-b border-[#E0DCD5]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-[#E07A2F] font-bold text-xl">
            SnapKO
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#6F6B63]">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-[#6F6B63] hover:text-red-600"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Trial Banner */}
      {isTrialExpired ? (
        <div className="bg-red-500 text-white">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium">
              ⚠️ Bản dùng thử đã hết hạn. Nâng cấp để tiếp tục sử dụng.
            </span>
            <Link
              href="/pricing"
              className="px-4 py-1.5 bg-white text-red-500 text-sm font-semibold rounded-lg hover:bg-red-50"
            >
              Nâng cấp ngay
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-[#6B8E23] text-white">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium">
              🎉 Bản dùng thử miễn phí: còn{" "}
              <strong>{trialDaysLeft} ngày</strong>
            </span>
            <Link
              href="/pricing"
              className="px-4 py-1.5 bg-white/20 text-white text-sm font-medium rounded-lg hover:bg-white/30"
            >
              Xem gói Pro
            </Link>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1E1E1E]">Owner Dashboard</h1>
          <p className="text-[#6F6B63]">Duyệt nhân viên đăng ký</p>
        </div>

        {(error || authError) && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl mb-6">
            {authError && (
              <p className="font-medium">Lỗi đăng nhập: {authError}</p>
            )}
            {error && <p>{error}</p>}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#E0DCD5] p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-[#1E1E1E]">
              Nhân viên chờ duyệt ({pending.length})
            </h2>
            <button
              disabled={busy}
              onClick={refreshPending}
              className="px-4 py-2 text-sm font-medium text-[#6F6B63] border border-[#E0DCD5] rounded-xl hover:bg-[#FAF9F7] disabled:opacity-50"
            >
              Làm mới
            </button>
          </div>

          {pending.length === 0 ? (
            <p className="text-[#6F6B63] text-center py-8">
              Không có nhân viên nào đang chờ duyệt.
            </p>
          ) : (
            <div className="space-y-4">
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-4 border border-[#E0DCD5] rounded-xl"
                >
                  <div>
                    <div className="font-semibold text-[#1E1E1E]">
                      {p.full_name ?? "(Không có tên)"}
                    </div>
                    <div className="text-sm text-[#6F6B63]">
                      {p.phone_number ?? "(Không có SĐT)"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => approve(p.id, true)}
                      className="px-4 py-2 text-sm font-semibold text-white bg-[#6B8E23] hover:bg-[#5a7a1e] rounded-xl disabled:opacity-50"
                    >
                      Duyệt
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => approve(p.id, false)}
                      className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl disabled:opacity-50"
                    >
                      Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="mt-8 grid md:grid-cols-2 gap-4">
          <Link
            href="/reports"
            className="p-4 bg-white border border-[#E0DCD5] rounded-xl hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold text-[#1E1E1E]">📊 Báo cáo</h3>
            <p className="text-sm text-[#6F6B63]">Xem báo cáo tồn kho</p>
          </Link>
          <Link
            href="/pricing"
            className="p-4 bg-white border border-[#E0DCD5] rounded-xl hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold text-[#1E1E1E]">💳 Gói cước</h3>
            <p className="text-sm text-[#6F6B63]">Nâng cấp lên Pro</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
