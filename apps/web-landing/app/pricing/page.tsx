"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { User } from "@supabase/supabase-js";
import NavBar from "../components/NavBar";
import { CheckCircle, Crown, Star } from "lucide-react";

/**
 * /pricing - Dynamic Pricing Page
 * Fetches plans from database
 * Shows QR code for payment using PayOS
 */

interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  price: number;
  duration_days: number;
  target_tier: string;
  description: string | null;
}

export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(
    null,
  );

  const [isLoading, setIsLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [payosUrl, setPayosUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for payment status from return URL
  const paymentStatus = searchParams.get("status");
  const paymentCode = searchParams.get("code");
  const cancelParam = searchParams.get("cancel");

  const isPaymentCancelled =
    paymentStatus === "cancelled" ||
    paymentStatus === "CANCELLED" ||
    cancelParam === "true";

  const isPaymentSuccess =
    !isPaymentCancelled &&
    (paymentStatus === "success" ||
      paymentStatus === "PAID" ||
      paymentCode === "00");

  useEffect(() => {
    const init = async () => {
      console.log("PricingPage: Init started");

      // 1. Check Session
      console.log("PricingPage: Checking session...");
      const { data } = await supabase.auth.getSession();
      console.log(
        "PricingPage: Session result:",
        data.session ? "Found" : "Null",
      );

      if (!data.session) {
        // Allow viewing plans without login? Maybe, but for payment we need user.
        // For now, redirect to register if not logged in
        router.push("/auth/register");
        return;
      }
      setUser(data.session.user);

      // 2. Fetch Plans
      console.log("PricingPage: Fetching plans...");
      const { data: plansData, error: plansError } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("price", { ascending: true });

      console.log("PricingPage: Plans fetch result:", {
        plansData,
        error: plansError,
      });

      if (plansData) {
        setPlans(plansData);
        // Default select the first plan (usually Monthly PRO) if exists
        if (plansData.length > 0) setSelectedPlan(plansData[0]);
      }

      setIsLoading(false);
      console.log("PricingPage: Loading set to false");
    };

    init();
  }, [supabase, router]);

  // Create PayOS payment link
  const createPayment = async (plan: SubscriptionPlan) => {
    if (!user) return;
    if (paymentLoading) return;

    setPaymentLoading(true);
    setError(null);
    setPayosUrl(null); // Reset previous URL

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const origin = window.location.origin;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/payment/create-link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            tier: plan.target_tier, // Still support tier logic for backward compatibility
            amount: plan.price,
            planCode: plan.code, // Send plan code for webhook handling
            returnUrl: `${origin}/pricing?status=success`, // Stay on pricing page for success msg
            cancelUrl: `${origin}/pricing?status=cancelled`,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Không thể tạo link thanh toán");
      }

      if (data.checkoutUrl) {
        setPayosUrl(data.checkoutUrl);
        // window.open(data.checkoutUrl, '_blank');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Lỗi tạo thanh toán";
      setError(message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(price);
  };

  // --- Render ---

  if (isPaymentSuccess) {
    return (
      <div className="min-h-screen bg-[#FAF9F7]">
        <NavBar />
        <div className="pt-28 pb-20">
          <div className="max-w-md mx-auto px-4 text-center">
            <div className="mb-8">
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-[#6B8E23] to-[#556B2F] rounded-full flex items-center justify-center animate-pulse">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-[#1E1E1E] mb-4">
              🎉 Thanh toán thành công!
            </h1>
            <p className="text-[#6F6B63] mb-8">
              Gói cước của bạn đã được kích hoạt. Hãy trải nghiệm ngay!
            </p>
            <Link
              href="/dashboard"
              className="block w-full py-4 px-6 rounded-xl bg-[#E07A2F] text-white font-bold text-center hover:bg-[#C2410C] transition-colors"
            >
              Vào Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isPaymentCancelled) {
    return (
      <div className="min-h-screen bg-[#FAF9F7]">
        <NavBar />
        <div className="pt-28 pb-20">
          <div className="max-w-md mx-auto px-4 text-center">
            <h1 className="text-3xl font-bold text-[#1E1E1E] mb-4">
              Thanh toán đã hủy
            </h1>
            <button
              onClick={() => {
                router.replace("/pricing"); // Clear params
              }}
              className="block w-full py-3 px-6 rounded-xl bg-[#E07A2F] text-white font-semibold text-center hover:bg-[#C2410C] transition-colors mb-4"
            >
              Thử lại
            </button>
            <Link
              href="/dashboard"
              className="block w-full py-3 px-6 rounded-xl bg-[#E0DCD5] text-[#6F6B63] font-semibold text-center hover:bg-[#D0CCC5] transition-colors"
            >
              Quay lại Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F7]">
        <NavBar />
        <div className="pt-28 flex items-center justify-center">
          <div className="text-[#6F6B63]">Đang tải...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      <NavBar />
      <div className="pt-28 pb-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold text-[#1E1E1E] mb-2">
              Nâng cấp gói cước
            </h1>
            <p className="text-[#6F6B63]">
              Chọn gói phù hợp với nhu cầu kinh doanh của bạn
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {plans.map((plan) => {
              const isPremium = plan.code.includes("PREMIUM");
              const isYearly = plan.duration_days >= 365;

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col bg-white rounded-2xl border ${
                    isPremium
                      ? "border-orange-500 shadow-lg"
                      : "border-[#E0DCD5]"
                  } p-6 hover:shadow-xl transition-shadow`}
                >
                  {isPremium && (
                    <div className="absolute top-0 right-0 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current" />
                      MODEL C (Chain)
                    </div>
                  )}

                  {isYearly && !isPremium && (
                    <div className="absolute top-0 right-0 bg-[#6B8E23] text-white text-xs font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl">
                      TIẾT KIỆM
                    </div>
                  )}

                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-[#1E1E1E]">
                      {plan.name}
                    </h3>
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-3xl font-bold text-[#E07A2F]">
                        {formatPrice(plan.price)}
                      </span>
                      <span className="text-sm text-[#6F6B63]">
                        /{plan.duration_days} ngày
                      </span>
                    </div>
                    {plan.description && (
                      <p className="text-sm text-[#6F6B63] mt-2 italic">
                        {plan.description}
                      </p>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    <li className="flex items-start gap-2 text-sm text-[#1E1E1E]">
                      <CheckCircle className="w-5 h-5 text-[#6B8E23] shrink-0" />
                      {isPremium
                        ? "Mọi tính năng của gói PRO"
                        : "Tính năng cơ bản SnapKO"}
                    </li>
                    <li className="flex items-start gap-2 text-sm text-[#1E1E1E]">
                      <CheckCircle className="w-5 h-5 text-[#6B8E23] shrink-0" />
                      {isPremium
                        ? "Hỗ trợ chuỗi (Chain Support)"
                        : "Hỗ trợ 1 điểm bán"}
                    </li>
                    {isPremium && (
                      <li className="flex items-start gap-2 text-sm text-[#1E1E1E]">
                        <CheckCircle className="w-5 h-5 text-[#6B8E23] shrink-0" />
                        Kho Model C chuyên sâu
                      </li>
                    )}
                  </ul>

                  {/* Payment Action */}
                  {payosUrl && selectedPlan?.id === plan.id ? (
                    <div className="space-y-2">
                      <a
                        href={payosUrl}
                        className="block w-full py-3 px-4 rounded-xl bg-[#6B8E23] text-white font-bold text-center hover:bg-[#556B2F] transition-colors"
                      >
                        Thanh toán ngay →
                      </a>
                      <button
                        onClick={() => setPayosUrl(null)}
                        className="block w-full text-xs text-[#6F6B63] hover:underline text-center"
                      >
                        Chọn gói khác
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={paymentLoading}
                      onClick={() => {
                        setSelectedPlan(plan);
                        createPayment(plan);
                      }}
                      className={`block w-full py-3 px-4 rounded-xl font-bold text-center transition-colors ${
                        isPremium
                          ? "bg-[#E07A2F] text-white hover:bg-[#C2410C]"
                          : "bg-white border-2 border-[#E07A2F] text-[#E07A2F] hover:bg-[#FAF9F7]"
                      } disabled:opacity-50`}
                    >
                      {paymentLoading && selectedPlan?.id === plan.id
                        ? "Đang tạo..."
                        : "Chọn gói này"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="mt-8 mx-auto max-w-md bg-red-50 text-red-600 text-sm p-4 rounded-xl text-center">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
