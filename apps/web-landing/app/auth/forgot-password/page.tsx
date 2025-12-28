"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

/**
 * Forgot Password Page - Web Landing
 * Per .UXUIrules: Light Mode, Burnt Orange CTAs
 */

export default function ForgotPasswordPage() {
  const supabase = getSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError("Vui lòng nhập email");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const redirectUrl = `${window.location.origin}/auth/update-password`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: redirectUrl }
      );

      if (resetError) {
        throw new Error(resetError.message);
      }

      setSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gửi email thất bại";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-[#6B8E23] rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#1E1E1E] mb-2">
            Kiểm tra email!
          </h1>
          <p className="text-[#6F6B63] mb-2">
            Chúng tôi đã gửi link đặt lại mật khẩu đến
          </p>
          <p className="text-[#E07A2F] font-semibold mb-6">{email}</p>
          <p className="text-sm text-[#6F6B63] mb-6">
            Không thấy email? Kiểm tra thư mục Spam hoặc thử lại sau vài phút.
          </p>
          <Link
            href="/auth/login"
            className="inline-block px-6 py-3 border-2 border-[#E07A2F] text-[#E07A2F] font-semibold rounded-xl hover:bg-[#E07A2F]/5 transition-colors"
          >
            Về trang đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="text-3xl font-bold text-[#E07A2F]">SnapKO</span>
          </Link>
          <p className="text-[#6F6B63] mt-2">Quên mật khẩu?</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-[#E0DCD5] p-8 shadow-sm">
          <p className="text-[#6F6B63] mb-6">
            Nhập email đã đăng ký để nhận link đặt lại mật khẩu.
          </p>

          <form onSubmit={handleReset} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#1E1E1E] mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#E0DCD5] focus:border-[#E07A2F] focus:ring-1 focus:ring-[#E07A2F] outline-none transition-colors"
                placeholder="email@example.com"
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-[#E07A2F] hover:bg-[#C2410C] text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {isLoading ? "Đang gửi..." : "Gửi link khôi phục"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-[#6F6B63]">Nhớ mật khẩu rồi? </span>
            <Link
              href="/auth/login"
              className="text-[#E07A2F] font-semibold hover:underline"
            >
              Đăng nhập
            </Link>
          </div>
        </div>

        {/* Back to home */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-[#6F6B63] hover:text-[#1E1E1E]"
          >
            ← Quay lại trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
