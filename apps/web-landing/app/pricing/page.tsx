"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabaseClient";

interface PayOSLink {
  checkoutUrl: string;
  qrCode: string;
  orderCode: number;
}

// Pricing tiers
const TIERS = [
  {
    name: "FREE",
    price: 0,
    priceLabel: "Miễn phí",
    description: "Dành cho quán nhỏ, dữ liệu local",
    features: [
      "Quản lý tồn kho offline",
      "AI nhận dạng hàng hóa",
      "1 thiết bị",
      "Lưu trữ local",
    ],
    cta: "Đang sử dụng",
    popular: false,
  },
  {
    name: "PERSONAL",
    price: 99000,
    priceLabel: "99.000₫/tháng",
    description: "Đồng bộ cloud cho 1 quán",
    features: [
      "Mọi tính năng FREE",
      "Đồng bộ Cloud realtime",
      "5 thiết bị",
      "Báo cáo COGS/Lãi gộp",
      "Hỗ trợ email",
    ],
    cta: "Nâng cấp",
    popular: true,
  },
  {
    name: "CHAIN",
    price: 299000,
    priceLabel: "299.000₫/tháng",
    description: "Dành cho chuỗi F&B",
    features: [
      "Mọi tính năng PERSONAL",
      "Không giới hạn thiết bị",
      "Quản lý nhiều chi nhánh",
      "API integration",
      "Hỗ trợ ưu tiên 24/7",
    ],
    cta: "Liên hệ",
    popular: false,
  },
];

// Bank info for QR payment
const BANK_INFO = {
  bankId: "MB", // Ngân hàng MB
  accountNo: "0123456789", // Số tài khoản (thay bằng số thật)
  accountName: "SNAPKO TECHNOLOGY",
  template: "compact2",
};

// Generate VietQR URL
function generateVietQRUrl(amount: number, content: string): string {
  const { bankId, accountNo, accountName, template } = BANK_INFO;
  const encodedContent = encodeURIComponent(content);
  const encodedName = encodeURIComponent(accountName);
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${amount}&addInfo=${encodedContent}&accountName=${encodedName}`;
}

export default function PricingPage() {
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payosLink, setPayosLink] = useState<PayOSLink | null>(null);
  const [session, setSession] = useState<any>(null);

  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSelectTier = async (tier: any) => {
    if (tier.name === "FREE") return;
    if (tier.name === "CHAIN") {
      window.open("https://zalo.me/snapko", "_blank");
      return;
    }

    if (!session) {
      alert("Vui lòng đăng nhập để nâng cấp gói!");
      window.location.href = "/login"; // Assuming login page exists
      return;
    }

    setLoading(true);
    setSelectedTier(tier.name);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-payos-link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            tier: tier.name,
            amount: tier.price,
          }),
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setPayosLink(data);
      setShowQR(true);
    } catch (err: any) {
      alert("Lỗi: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedTierData = TIERS.find((t) => t.name === selectedTier);
  const qrUrl = payosLink?.checkoutUrl || "";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF9F7" }}>
      {/* Header */}
      <header className="py-8 text-center">
        <h1 className="text-4xl font-bold mb-2" style={{ color: "#1E1E1E" }}>
          SnapKO Pricing
        </h1>
        <p className="text-lg" style={{ color: "#6F6B63" }}>
          Chọn gói phù hợp cho doanh nghiệp của bạn
        </p>
      </header>

      {/* Pricing Cards */}
      <main className="max-w-6xl mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-3 gap-8">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl p-8 ${
                tier.popular ? "ring-4" : "border"
              }`}
              style={{
                backgroundColor: tier.popular ? "#E07A2F" : "#FFFFFF",
                borderColor: tier.popular ? "#E07A2F" : "#E0DCD5",
                boxShadow: tier.popular
                  ? "0 8px 32px rgba(224, 122, 47, 0.3)"
                  : undefined,
              }}
            >
              {tier.popular && (
                <div
                  className="absolute -top-4 left-1/2 -translate-x-1/2 text-sm font-bold px-4 py-1 rounded-full"
                  style={{ backgroundColor: "#6B8E23", color: "white" }}
                >
                  Phổ biến nhất
                </div>
              )}

              <h2
                className="text-2xl font-bold mb-2"
                style={{ color: tier.popular ? "white" : "#1E1E1E" }}
              >
                {tier.name}
              </h2>

              <p
                className="text-sm mb-4"
                style={{
                  color: tier.popular ? "rgba(255,255,255,0.9)" : "#6F6B63",
                }}
              >
                {tier.description}
              </p>

              <div className="mb-6">
                <span
                  className={`text-3xl font-bold ${
                    tier.popular ? "text-white" : "text-slate-100"
                  }`}
                >
                  {tier.priceLabel}
                </span>
              </div>

              <ul className="space-y-3 mb-8">
                {tier.features.map((feature, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-2"
                    style={{
                      color: tier.popular ? "rgba(255,255,255,0.9)" : "#1E1E1E",
                    }}
                  >
                    <svg
                      className="w-5 h-5"
                      style={{ color: tier.popular ? "white" : "#6B8E23" }}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelectTier(tier)}
                disabled={tier.name === "FREE" || loading}
                className="w-full py-3 px-6 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                style={{
                  backgroundColor:
                    tier.name === "FREE"
                      ? "#E0DCD5"
                      : tier.popular
                      ? "white"
                      : "#E07A2F",
                  color:
                    tier.name === "FREE"
                      ? "#6F6B63"
                      : tier.popular
                      ? "#E07A2F"
                      : "white",
                  cursor:
                    tier.name === "FREE" || loading ? "not-allowed" : "pointer",
                }}
              >
                {loading && selectedTier === tier.name ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : null}
                {tier.cta}
              </button>
            </div>
          ))}
        </div>

        {/* QR Payment Modal */}
        {showQR && selectedTierData && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full">
              <h3 className="text-2xl font-bold text-slate-800 mb-2 text-center">
                Thanh toán {selectedTierData.name}
              </h3>
              <p className="text-slate-500 text-center mb-6">
                Quét mã QR để chuyển khoản
              </p>

              {/* Payment Link */}
              <div className="flex flex-col items-center mb-6">
                <p className="text-sm text-slate-500 mb-4 text-center">
                  Vui lòng nhấn nút thanh toán để mở trang thanh toán PayOS hoặc
                  quét mã QR trên trang đó.
                </p>
                <a
                  href={qrUrl}
                  target="_blank"
                  className="w-full py-4 px-6 rounded-xl font-bold bg-blue-600 text-white text-center hover:bg-blue-500 transition-all shadow-lg"
                >
                  🚀 MỞ TRANG THANH TOÁN
                </a>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Mã đơn hàng:</span>
                  <span className="font-bold text-slate-800">
                    #{payosLink?.orderCode}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Số tiền:</span>
                  <span className="font-bold text-slate-800">
                    {selectedTierData?.price.toLocaleString("vi-VN")}₫
                  </span>
                </div>
              </div>

              <p className="text-sm text-slate-400 text-center mb-4">
                ⚠️ Vui lòng ghi đúng nội dung chuyển khoản để hệ thống tự động
                kích hoạt gói.
              </p>

              <div className="flex gap-4">
                <button
                  onClick={() => setShowQR(false)}
                  className="flex-1 py-3 px-6 rounded-xl font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Đóng
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(paymentContent);
                    alert("Đã copy nội dung chuyển khoản!");
                  }}
                  className="flex-1 py-3 px-6 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                >
                  Copy nội dung
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-slate-500 text-sm">
        <p>© 2024 SnapKO. Ứng dụng quản lý kho F&B thông minh.</p>
        <p className="mt-2">
          Cần hỗ trợ?{" "}
          <a
            href="https://zalo.me/snapko"
            className="text-blue-400 hover:underline"
          >
            Liên hệ Zalo
          </a>
        </p>
      </footer>
    </div>
  );
}
