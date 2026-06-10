"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { User } from "@supabase/supabase-js";
import {
  ArrowRight,
  Building2,
  CheckCircle,
  Crown,
  ShieldCheck,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import NavBar from "../components/NavBar";

type BillingCycle = "monthly" | "quarterly" | "yearly";

interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  price: number;
  duration_days: number;
  target_tier: "FREE" | "PRO" | "CHAIN" | string;
  description: string | null;
  monthly_scans_quota: number;
}

const CANONICAL_PLANS: SubscriptionPlan[] = [
  {
    id: "FREE_DEFAULT",
    code: "FREE_DEFAULT",
    name: "Free",
    description: "Dùng thử quy trình SnapKO với quota cơ bản.",
    price: 0,
    duration_days: 0,
    target_tier: "FREE",
    monthly_scans_quota: 20,
  },
  {
    id: "PRO_MONTHLY",
    code: "PRO_MONTHLY",
    name: "Pro tháng",
    description: "Cho quán vận hành chuyên nghiệp mỗi ngày.",
    price: 199000,
    duration_days: 30,
    target_tier: "PRO",
    monthly_scans_quota: 100,
  },
  {
    id: "PRO_QUARTERLY",
    code: "PRO_QUARTERLY",
    name: "Pro 3 tháng",
    description: "Tiết kiệm hơn so với trả từng tháng.",
    price: 539000,
    duration_days: 90,
    target_tier: "PRO",
    monthly_scans_quota: 100,
  },
  {
    id: "PRO_YEARLY",
    code: "PRO_YEARLY",
    name: "Pro 1 năm",
    description: "Tối ưu chi phí cho quán dùng lâu dài.",
    price: 1990000,
    duration_days: 365,
    target_tier: "PRO",
    monthly_scans_quota: 100,
  },
  {
    id: "CHAIN_MONTHLY",
    code: "CHAIN_MONTHLY",
    name: "Chain tháng",
    description: "Cho chuỗi hoặc quán có nhiều khu vực kho.",
    price: 499000,
    duration_days: 30,
    target_tier: "CHAIN",
    monthly_scans_quota: 500,
  },
  {
    id: "CHAIN_QUARTERLY",
    code: "CHAIN_QUARTERLY",
    name: "Chain 3 tháng",
    description: "Tiết kiệm hơn cho vận hành chuỗi ổn định.",
    price: 1349000,
    duration_days: 90,
    target_tier: "CHAIN",
    monthly_scans_quota: 500,
  },
  {
    id: "CHAIN_YEARLY",
    code: "CHAIN_YEARLY",
    name: "Chain 1 năm",
    description: "Chi phí tốt nhất cho chuỗi F&B.",
    price: 4790000,
    duration_days: 365,
    target_tier: "CHAIN",
    monthly_scans_quota: 500,
  },
];

const PLAN_CODES = CANONICAL_PLANS.map((plan) => plan.code);

const PERIODS: Array<{
  key: BillingCycle;
  label: string;
  helper: string;
  suffix: "MONTHLY" | "QUARTERLY" | "YEARLY";
}> = [
  {
    key: "monthly",
    label: "Tháng",
    helper: "Linh hoạt",
    suffix: "MONTHLY",
  },
  {
    key: "quarterly",
    label: "3 tháng",
    helper: "Tiết kiệm",
    suffix: "QUARTERLY",
  },
  {
    key: "yearly",
    label: "1 năm",
    helper: "Tốt nhất",
    suffix: "YEARLY",
  },
];

const PLAN_COPY = {
  FREE: {
    title: "Free",
    eyebrow: "Bắt đầu miễn phí",
    icon: ShieldCheck,
    accent: "border-[#E0DCD5]",
    button: "Tải app",
    features: [
      "20 lượt scan/tháng",
      "Quản lý kho cơ bản",
      "Phù hợp để làm quen quy trình",
    ],
  },
  PRO: {
    title: "Pro",
    eyebrow: "Cho một quán vận hành nghiêm túc",
    icon: Crown,
    accent: "border-[#E07A2F] shadow-md",
    button: "Chọn gói Pro",
    features: [
      "100 lượt scan/tháng",
      "Cloud sync đa thiết bị",
      "Duyệt nhân viên và phân quyền",
      "Kho chuẩn cho F&B",
    ],
  },
  CHAIN: {
    title: "Chain",
    eyebrow: "Cho chuỗi hoặc nhiều khu vực kho",
    icon: Building2,
    accent: "border-[#6B8E23] shadow-md",
    button: "Chọn gói Chain",
    features: [
      "500 lượt scan/tháng",
      "Tất cả tính năng Pro",
      "Kho Model C / nhiều khu vực",
      "Ưu tiên cho vận hành chuỗi",
    ],
  },
} as const;

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAF9F7]">
          <NavBar />
          <div className="flex items-center justify-center pt-28">
            <div className="text-[#6F6B63]">Đang tải...</div>
          </div>
        </div>
      }
    >
      <PricingPageContent />
    </Suspense>
  );
}

function PricingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [payosUrl, setPayosUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user ?? null);

      const { data: plansData, error: plansError } = await supabase
        .from("subscription_plans")
        .select(
          "id, code, name, description, price, duration_days, target_tier, monthly_scans_quota",
        )
        .eq("is_active", true)
        .in("code", PLAN_CODES);

      if (plansError) {
        console.warn("PricingPage: plan fetch failed, using fallback copy", plansError);
      }

      if (plansData) {
        setPlans(
          plansData.map((plan) => ({
            id: plan.id,
            code: plan.code,
            name: plan.name,
            description: plan.description,
            price: Number(plan.price),
            duration_days: Number(plan.duration_days),
            target_tier: plan.target_tier,
            monthly_scans_quota: Number(plan.monthly_scans_quota ?? 0),
          })),
        );
      }

      setIsLoading(false);
    };

    init();
  }, [supabase]);

  useEffect(() => {
    setPayosUrl(null);
    setSelectedPlanCode(null);
  }, [billingCycle]);

  const planByCode = useMemo(() => {
    const map = new Map<string, SubscriptionPlan>();
    for (const plan of CANONICAL_PLANS) map.set(plan.code, plan);
    for (const plan of plans) map.set(plan.code, plan);
    return map;
  }, [plans]);

  const currentSuffix =
    PERIODS.find((period) => period.key === billingCycle)?.suffix ?? "MONTHLY";
  const freePlan = planByCode.get("FREE_DEFAULT") ?? CANONICAL_PLANS[0];
  const proPlan =
    planByCode.get(`PRO_${currentSuffix}`) ??
    planByCode.get("PRO_MONTHLY") ??
    CANONICAL_PLANS[1];
  const chainPlan =
    planByCode.get(`CHAIN_${currentSuffix}`) ??
    planByCode.get("CHAIN_MONTHLY") ??
    CANONICAL_PLANS[4];

  const createPayment = async (plan: SubscriptionPlan) => {
    if (plan.price <= 0) {
      router.push("/download");
      return;
    }

    if (!user) {
      router.push("/auth/register");
      return;
    }

    if (paymentLoading) return;

    setPaymentLoading(true);
    setSelectedPlanCode(plan.code);
    setError(null);
    setPayosUrl(null);

    try {
      const { apiFetch } = await import("@/lib/backendClient");
      const origin = window.location.origin;

      const data = await apiFetch<{ checkoutUrl?: string; error?: string }>(
        "/payments/create-link",
        {
          method: "POST",
          body: JSON.stringify({
            planCode: plan.code,
            origin,
            returnUrl: `${origin}/pricing?status=success`,
            cancelUrl: `${origin}/pricing?status=cancelled`,
          }),
        },
      );

      if (data.error) throw new Error(data.error);
      if (data.checkoutUrl) setPayosUrl(data.checkoutUrl);
    } catch (err) {
      const message =
        err instanceof Error && !err.message.startsWith("apiFetch")
          ? err.message
          : "Không thể tạo thanh toán. Vui lòng thử lại sau.";
      setError(message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const formatPrice = (price: number) =>
    `${new Intl.NumberFormat("vi-VN").format(price)}đ`;

  const durationLabel = (plan: SubscriptionPlan) => {
    if (plan.price === 0) return "miễn phí";
    if (plan.duration_days >= 365) return "/năm";
    if (plan.duration_days >= 90) return "/3 tháng";
    return "/tháng";
  };

  const renderPlanCard = (
    tier: "FREE" | "PRO" | "CHAIN",
    plan: SubscriptionPlan,
  ) => {
    const copy = PLAN_COPY[tier];
    const Icon = copy.icon;
    const isPaid = tier !== "FREE";
    const isSelected = selectedPlanCode === plan.code;
    const isBusy = paymentLoading && isSelected;

    return (
      <div
        key={tier}
        className={`relative flex min-h-[520px] flex-col rounded-lg border bg-white p-6 ${copy.accent}`}
      >
        {tier === "PRO" && (
          <div className="absolute right-5 top-5 rounded-full bg-[#E07A2F] px-3 py-1 text-xs font-bold text-white">
            PHỔ BIẾN
          </div>
        )}
        {tier === "CHAIN" && (
          <div className="absolute right-5 top-5 rounded-full bg-[#6B8E23] px-3 py-1 text-xs font-bold text-white">
            CHUỖI
          </div>
        )}

        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-[#FAF9F7] text-[#E07A2F]">
          <Icon className="h-6 w-6" />
        </div>

        <div>
          <p className="text-sm font-semibold text-[#6F6B63]">{copy.eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold text-[#1E1E1E]">
            {copy.title}
          </h2>
          <p className="mt-2 min-h-10 text-sm leading-6 text-[#6F6B63]">
            {plan.description ?? CANONICAL_PLANS.find((p) => p.code === plan.code)?.description}
          </p>
        </div>

        <div className="my-7">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-[#1E1E1E]">
              {formatPrice(plan.price)}
            </span>
            <span className="text-sm text-[#6F6B63]">
              {durationLabel(plan)}
            </span>
          </div>
          {isPaid && (
            <p className="mt-2 text-sm text-[#6F6B63]">
              {plan.duration_days} ngày sử dụng, {plan.monthly_scans_quota} lượt
              scan/tháng
            </p>
          )}
          {!isPaid && (
            <p className="mt-2 text-sm text-[#6F6B63]">
              {plan.monthly_scans_quota} lượt scan/tháng
            </p>
          )}
        </div>

        <ul className="mb-8 flex-1 space-y-3">
          {copy.features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2 text-sm text-[#1E1E1E]"
            >
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#6B8E23]" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {payosUrl && isSelected ? (
          <div className="space-y-2">
            <a
              href={payosUrl}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#6B8E23] px-4 py-3 text-center font-bold text-white transition-colors hover:bg-[#556B2F]"
            >
              Thanh toán ngay
              <ArrowRight className="h-4 w-4" />
            </a>
            <button
              onClick={() => {
                setPayosUrl(null);
                setSelectedPlanCode(null);
              }}
              className="block w-full text-center text-xs text-[#6F6B63] hover:underline"
            >
              Chọn gói khác
            </button>
          </div>
        ) : (
          <button
            disabled={paymentLoading}
            onClick={() => createPayment(plan)}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-center font-bold transition-colors disabled:opacity-50 ${
              tier === "FREE"
                ? "border border-[#E0DCD5] bg-white text-[#1E1E1E] hover:border-[#E07A2F]"
                : tier === "CHAIN"
                  ? "bg-[#6B8E23] text-white hover:bg-[#556B2F]"
                  : "bg-[#E07A2F] text-white hover:bg-[#C2410C]"
            }`}
          >
            {isBusy ? "Đang tạo..." : copy.button}
            {!isBusy && <ArrowRight className="h-4 w-4" />}
          </button>
        )}
      </div>
    );
  };

  if (isPaymentSuccess) {
    return (
      <div className="min-h-screen bg-[#FAF9F7]">
        <NavBar />
        <div className="px-4 pb-20 pt-28">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-[#6B8E23]">
              <CheckCircle className="h-10 w-10 text-white" />
            </div>
            <h1 className="mb-4 text-3xl font-bold text-[#1E1E1E]">
              Thanh toán thành công
            </h1>
            <p className="mb-8 text-[#6F6B63]">
              Gói cước của bạn đã được kích hoạt.
            </p>
            <Link
              href="/dashboard"
              className="block w-full rounded-lg bg-[#E07A2F] px-6 py-4 text-center font-bold text-white transition-colors hover:bg-[#C2410C]"
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
        <div className="px-4 pb-20 pt-28">
          <div className="mx-auto max-w-md text-center">
            <h1 className="mb-4 text-3xl font-bold text-[#1E1E1E]">
              Thanh toán đã hủy
            </h1>
            <button
              onClick={() => router.replace("/pricing")}
              className="mb-4 block w-full rounded-lg bg-[#E07A2F] px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-[#C2410C]"
            >
              Thử lại
            </button>
            <Link
              href="/dashboard"
              className="block w-full rounded-lg bg-[#E0DCD5] px-6 py-3 text-center font-semibold text-[#6F6B63] transition-colors hover:bg-[#D0CCC5]"
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
        <div className="flex items-center justify-center pt-28">
          <div className="text-[#6F6B63]">Đang tải...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      <NavBar />
      <main className="px-4 pb-20 pt-28">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#E07A2F]">
              Bảng giá SnapKO
            </p>
            <h1 className="text-3xl font-bold text-[#1E1E1E] md:text-4xl">
              Chọn gói phù hợp với cách quán vận hành
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-[#6F6B63]">
              Free để bắt đầu, Pro cho một quán chuyên nghiệp, Chain cho chuỗi
              hoặc nhiều khu vực kho.
            </p>
          </div>

          <div className="mb-8 flex justify-center">
            <div className="grid grid-cols-3 rounded-lg border border-[#E0DCD5] bg-white p-1 shadow-sm">
              {PERIODS.map((period) => (
                <button
                  key={period.key}
                  onClick={() => setBillingCycle(period.key)}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors md:px-6 ${
                    billingCycle === period.key
                      ? "bg-[#1E1E1E] text-white"
                      : "text-[#6F6B63] hover:text-[#1E1E1E]"
                  }`}
                >
                  <span className="block">{period.label}</span>
                  <span className="block text-[11px] opacity-70">
                    {period.helper}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {renderPlanCard("FREE", freePlan)}
            {renderPlanCard("PRO", proPlan)}
            {renderPlanCard("CHAIN", chainPlan)}
          </div>

          {error && (
            <div className="mx-auto mt-8 max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
