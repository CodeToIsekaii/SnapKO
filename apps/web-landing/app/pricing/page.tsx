"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { User } from "@supabase/supabase-js";
import NavBar from "../components/NavBar";
import { CheckCircle, Crown } from "lucide-react";

/**
 * /pricing - Payment Page
 * Shows QR code for payment using PayOS
 * Handles return from PayOS with status parameter
 */

const PRO_PRICE = 100000; // 100.000đ

export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [payosUrl, setPayosUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for payment status from return URL
  const paymentStatus = searchParams.get("status");
  const paymentCode = searchParams.get("code");
  const cancelParam = searchParams.get("cancel");

  // Check cancelled FIRST (cancelled can come with code=00 sometimes)
  const isPaymentCancelled =
    paymentStatus === "cancelled" ||
    paymentStatus === "CANCELLED" ||
    cancelParam === "true";

  // Success only if NOT cancelled
  const isPaymentSuccess =
    !isPaymentCancelled &&
    (paymentStatus === "success" ||
      paymentStatus === "PAID" ||
      paymentCode === "00");

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/auth/register");
        return;
      }
      setUser(data.session.user);
      setIsLoading(false);
    };

    checkSession();
  }, [supabase, router]);

  // Calculate trial status
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

  // Create PayOS payment link
  const createPayment = async () => {
    if (!user) return;

    setPaymentLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-payos-link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            tier: "PRO",
            amount: PRO_PRICE,
          }),
        }
      );

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.checkoutUrl) {
        setPayosUrl(data.checkoutUrl);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Lỗi tạo thanh toán";
      setError(message);
    } finally {
      setPaymentLoading(false);
    }
  };

  // Auto create payment on load (only if not returning from payment)
  useEffect(() => {
    if (
      user &&
      !payosUrl &&
      !paymentLoading &&
      !isPaymentSuccess &&
      !isPaymentCancelled
    ) {
      createPayment();
    }
  }, [user, isPaymentSuccess, isPaymentCancelled]);

  // Payment Success UI - show immediately without waiting for session
  if (isPaymentSuccess) {
    return (
      <div className="min-h-screen bg-[#FAF9F7]">
        <NavBar />
        <div className="pt-28 pb-20">
          <div className="max-w-md mx-auto px-4 text-center">
            {/* Success Animation */}
            <div className="mb-8">
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-[#6B8E23] to-[#556B2F] rounded-full flex items-center justify-center animate-pulse">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
            </div>

            {/* Success Message */}
            <h1 className="text-3xl font-bold text-[#1E1E1E] mb-4">
              🎉 Thanh toán thành công!
            </h1>
            <p className="text-[#6F6B63] mb-8">
              Chúc mừng bạn đã nâng cấp lên gói PRO. Tất cả tính năng cao cấp đã
              được kích hoạt.
            </p>

            {/* PRO Badge */}
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#E07A2F] to-[#C2410C] text-white rounded-full font-bold mb-8">
              <Crown className="w-5 h-5" />
              BẠN ĐÃ LÀ THÀNH VIÊN PRO
            </div>

            {/* Features unlocked */}
            <div className="bg-white rounded-2xl border border-[#E0DCD5] p-6 mb-8 text-left">
              <h3 className="font-bold text-[#1E1E1E] mb-4">
                Tính năng đã mở khóa:
              </h3>
              <ul className="space-y-3 text-sm">
                {[
                  "Cloud Sync real-time đa thiết bị",
                  "Unlimited AI scan",
                  "Chống gian lận thông minh",
                  "Đa người dùng & phân quyền",
                  "Báo cáo nâng cao",
                  "Kho Model B & C",
                ].map((feature, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-[#6F6B63]"
                  >
                    <CheckCircle className="w-4 h-4 text-[#6B8E23]" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA */}
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

  // Payment Cancelled UI
  if (isPaymentCancelled) {
    return (
      <div className="min-h-screen bg-[#FAF9F7]">
        <NavBar />
        <div className="pt-28 pb-20">
          <div className="max-w-md mx-auto px-4 text-center">
            <h1 className="text-3xl font-bold text-[#1E1E1E] mb-4">
              Thanh toán đã hủy
            </h1>
            <p className="text-[#6F6B63] mb-8">
              Bạn đã hủy thanh toán. Bạn có thể thử lại bất cứ lúc nào.
            </p>
            <button
              onClick={() => {
                router.push("/pricing");
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

  // Loading state for normal pricing page (not for success/cancelled)
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
        <div className="max-w-md mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#1E1E1E] mb-2">
              {isTrialExpired ? "Gia hạn gói PRO" : "Nâng cấp lên PRO"}
            </h1>
            <p className="text-[#6F6B63]">
              {isTrialExpired
                ? "Bản dùng thử đã hết hạn. Thanh toán để tiếp tục sử dụng."
                : `Còn ${trialDaysLeft} ngày dùng thử. Nâng cấp ngay để không bị gián đoạn.`}
            </p>
          </div>

          {/* Payment Card */}
          <div className="bg-white rounded-2xl border border-[#E0DCD5] p-8">
            {/* Plan info */}
            <div className="text-center mb-6">
              <div className="text-xs text-[#6F6B63] mb-1">Gói B: PRO</div>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-4xl font-serif text-[#E07A2F]">
                  100.000đ
                </span>
                <span className="text-[#6F6B63]">/tháng</span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4 text-center">
                {error}
              </div>
            )}

            {/* PayOS Button */}
            {paymentLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-4 border-[#E07A2F] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : payosUrl ? (
              <>
                <a
                  href={payosUrl}
                  className="block w-full py-4 px-6 rounded-xl bg-[#E07A2F] text-white font-bold text-center hover:bg-[#C2410C] transition-colors mb-4"
                >
                  🚀 MỞ TRANG THANH TOÁN
                </a>
                <p className="text-sm text-[#6F6B63] text-center mb-4">
                  Nhấn để mở trang thanh toán PayOS và quét mã QR
                </p>
              </>
            ) : (
              <button
                onClick={createPayment}
                className="w-full py-4 px-6 rounded-xl bg-[#E07A2F] text-white font-bold hover:bg-[#C2410C] transition-colors mb-4"
              >
                Tạo mã thanh toán
              </button>
            )}

            {/* Info */}
            <div className="bg-[#FAF9F7] rounded-xl p-4 mb-6 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#6F6B63]">Gói:</span>
                <span className="font-bold text-[#1E1E1E]">PRO</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6F6B63]">Số tiền:</span>
                <span className="font-bold text-[#E07A2F]">100.000₫</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6F6B63]">Thanh toán qua:</span>
                <span className="font-bold text-[#1E1E1E]">PayOS</span>
              </div>
            </div>

            <p className="text-sm text-[#6F6B63] text-center mb-6">
              ⚠️ Sau khi thanh toán, hệ thống sẽ tự động kích hoạt gói PRO.
            </p>

            {/* Actions */}
            <div className="space-y-3">
              <Link
                href="/dashboard"
                className="block w-full py-3 px-6 rounded-xl font-semibold bg-[#E0DCD5] text-[#6F6B63] text-center hover:bg-[#D0CCC5] transition-colors"
              >
                Quay lại Dashboard
              </Link>
              {!isTrialExpired && (
                <p className="text-center text-xs text-[#6F6B63]">
                  Bạn vẫn có thể tiếp tục dùng thử trong {trialDaysLeft} ngày
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
