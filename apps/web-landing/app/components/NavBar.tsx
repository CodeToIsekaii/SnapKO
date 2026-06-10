"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { User } from "@supabase/supabase-js";
import { Crown, User as UserIcon } from "lucide-react";
import { apiFetch, getStoredRefreshToken } from "@/lib/backendClient";

/**
 * Navigation Bar with Auth State
 * Shows login link when logged out, profile icon when logged in
 * Checks subscription status from profiles table
 */

interface SubscriptionStatus {
  isPro: boolean;
  expiresAt: Date | null;
  scansUsed: number;
  scansQuota: number;
}

export default function NavBar() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionStatus>({
    isPro: false,
    expiresAt: null,
    scansUsed: 0,
    scansQuota: 0,
  });
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted && data.session?.user) {
          setUser(data.session.user);
          setIsLoading(false); // Don't block loading

          // Fetch subscription status in background via BE-SnapKO /businesses/me
          if (getStoredRefreshToken()) {
            try {
              const business = await apiFetch<{
                tier?: string;
                subscriptionExpiresAt?: string | null;
                scansUsedThisMonth?: number;
                monthlyScansQuota?: number;
              }>("/businesses/me");

              const expiresAt = business?.subscriptionExpiresAt
                ? new Date(business.subscriptionExpiresAt)
                : null;
              const isPro =
                (business?.tier === "PRO" || business?.tier === "CHAIN") &&
                expiresAt != null &&
                expiresAt > new Date();
              if (mounted) {
                setSubscription({
                  isPro: Boolean(isPro),
                  expiresAt,
                  scansUsed: business?.scansUsedThisMonth ?? 0,
                  scansQuota: business?.monthlyScansQuota ?? 0,
                });
              }
            } catch (e) {
              console.error("Subscription query failed:", e);
            }
          }
        } else if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("NavBar session error:", error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    // Set loading false after 2 seconds max to prevent stuck state
    const timeout = setTimeout(() => {
      if (mounted && isLoading) {
        setIsLoading(false);
      }
    }, 2000);

    checkSession();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_, session) => {
        if (mounted) {
          setUser(session?.user ?? null);
          setIsLoading(false);

          // Re-fetch subscription on auth change via BE-SnapKO /businesses/me
          if (session?.user && getStoredRefreshToken()) {
            try {
              const business = await apiFetch<{
                tier?: string;
                subscriptionExpiresAt?: string | null;
                scansUsedThisMonth?: number;
                monthlyScansQuota?: number;
              }>("/businesses/me");

              const expiresAt = business?.subscriptionExpiresAt
                ? new Date(business.subscriptionExpiresAt)
                : null;
              const isPro =
                (business?.tier === "PRO" || business?.tier === "CHAIN") &&
                expiresAt != null &&
                expiresAt > new Date();
              if (mounted) {
                setSubscription({
                  isPro: Boolean(isPro),
                  expiresAt,
                  scansUsed: business?.scansUsedThisMonth ?? 0,
                  scansQuota: business?.monthlyScansQuota ?? 0,
                });
              }
            } catch (e) {
              console.log("Subscription query failed in auth change:", e);
            }
          } else {
            setSubscription({ isPro: false, expiresAt: null, scansUsed: 0, scansQuota: 0 });
          }
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // Calculate trial days left (only if not PRO)
  const getTrialDaysLeft = () => {
    if (!user?.created_at) return 14;
    const createdAt = new Date(user.created_at);
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, 14 - diffDays);
  };

  // Calculate PRO days left
  const getProDaysLeft = () => {
    if (!subscription.expiresAt) return 0;
    const now = new Date();
    const diffMs = subscription.expiresAt.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  const trialDaysLeft = getTrialDaysLeft();
  const proDaysLeft = getProDaysLeft();

  return (
    <nav className="fixed top-4 left-4 right-4 z-50 rounded-2xl border border-white/20 bg-white/70 backdrop-blur-md shadow-sm transition-all duration-300">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo & Links */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="SnapKO Logo"
              className="w-9 h-9 object-contain"
            />
            <span className="text-[#1E1E1E] font-bold text-lg">SnapKO</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-[#6F6B63]">
            <Link href="/" className="hover:text-[#1E1E1E]">
              Trang chủ
            </Link>
            <Link href="/#guide" className="hover:text-[#1E1E1E]">
              Hướng dẫn
            </Link>
            <Link href="/#features" className="hover:text-[#1E1E1E]">
              Tính năng
            </Link>
            <Link href="/pricing" className="hover:text-[#1E1E1E]">
              Bảng giá
            </Link>
          </div>
        </div>

        {/* Auth Section */}
        <div className="flex items-center gap-3">
          {isLoading ? (
            <div className="w-8 h-8 bg-[#E0DCD5] rounded-full animate-pulse" />
          ) : user ? (
            <>
              {/* Scan quota badge */}
              {subscription.scansQuota > 0 && (
                <span
                  className="hidden md:inline-flex items-center px-2.5 py-1 bg-[#F5F3EF] text-[#6F6B63] text-xs font-medium rounded-full"
                  title="Số lượt scan đã dùng trong tháng"
                >
                  📷 {subscription.scansUsed}/{subscription.scansQuota}
                </span>
              )}

              {/* Pro Badge or Trial Badge */}
              {subscription.isPro ? (
                <Link
                  href="/dashboard"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#E07A2F] to-[#C2410C] text-white text-xs font-semibold rounded-full"
                >
                  <Crown className="w-3.5 h-3.5" />
                  PRO {proDaysLeft > 0 && `(${proDaysLeft}d)`}
                </Link>
              ) : (
                <Link
                  href="/pricing"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#6B8E23]/10 text-[#6B8E23] text-xs font-medium rounded-full"
                >
                  Trial: {trialDaysLeft} ngày
                </Link>
              )}

              {/* Profile Icon */}
              <Link
                href="/dashboard"
                className="w-9 h-9 bg-[#E07A2F] rounded-full flex items-center justify-center text-white hover:bg-[#C2410C] transition-colors"
                title={user.email || "Dashboard"}
              >
                <UserIcon className="w-5 h-5" />
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="text-sm font-medium text-[#6F6B63] hover:text-[#1E1E1E] hidden sm:block"
              >
                Đăng nhập
              </Link>
              <Link
                href="/download"
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-[#E07A2F] hover:bg-[#C2410C] rounded-xl transition-colors"
              >
                Tải App
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
