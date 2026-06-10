"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { loginMobile } from "@/lib/backendClient";
import { FaGoogle } from "react-icons/fa";

/**
 * Register Page - Web Landing (Owner Only)
 * Per .UXUIrules: Light Mode, Burnt Orange CTAs
 * Supports Email/Password + Google OAuth
 */

export default function RegisterPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleGoogleSignup = async () => {
    setIsGoogleLoading(true);
    setError(null);

    try {
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (googleError) {
        throw new Error(googleError.message);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Đăng ký với Google thất bại";
      setError(message);
      setIsGoogleLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessName.trim() || !fullName.trim()) {
      setError("Vui lòng nhập đầy đủ thông tin");
      return;
    }

    if (password.length < 6) {
      setError("Mật khẩu phải từ 6 ký tự trở lên");
      return;
    }

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp(
        {
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              business_name: businessName.trim(),
              role: "OWNER",
            },
          },
        }
      );

      if (signUpError) {
        throw new Error(signUpError.message);
      }

      if (authData.user) {
        // If Supabase issued a session immediately (email confirmation off),
        // exchange it for backend tokens so profile auto-provisions on BE.
        if (authData.session?.access_token) {
          try {
            await loginMobile(authData.session.access_token, {
              fullName: fullName.trim(),
            });
          } catch (exchangeErr) {
            console.error("AUTH: login-mobile exchange failed:", exchangeErr);
          }
        }
        // If email confirmation is required, profile will provision on next login.
        setSuccess(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Đăng ký thất bại";
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
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#1E1E1E] mb-2">
            Đăng ký thành công!
          </h1>
          <p className="text-[#6F6B63] mb-6">
            Vui lòng kiểm tra email để xác nhận tài khoản.
          </p>
          <Link
            href="/auth/login"
            className="inline-block px-6 py-3 bg-[#E07A2F] hover:bg-[#C2410C] text-white font-semibold rounded-xl transition-colors"
          >
            Về trang đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="text-3xl font-bold text-[#E07A2F]">SnapKO</span>
          </Link>
          <p className="text-[#6F6B63] mt-2">Tạo tài khoản chủ quán</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-[#E0DCD5] p-8 shadow-sm">
          {/* Google Signup - Quick option */}
          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={isGoogleLoading || isLoading}
            className="w-full py-3 px-4 bg-white border border-[#E0DCD5] hover:bg-[#FAF9F7] text-[#1E1E1E] font-semibold rounded-xl transition-colors flex items-center justify-center gap-3 disabled:opacity-50 mb-6"
          >
            {isGoogleLoading ? (
              <div className="w-5 h-5 border-2 border-[#E07A2F] border-t-transparent rounded-full animate-spin" />
            ) : (
              <FaGoogle className="w-5 h-5 text-[#4285F4]" />
            )}
            {isGoogleLoading ? "Đang kết nối..." : "Đăng ký với Google"}
          </button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E0DCD5]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-[#6F6B63]">
                hoặc đăng ký bằng email
              </span>
            </div>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#1E1E1E] mb-2">
                Tên doanh nghiệp / Tên quán
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#E0DCD5] focus:border-[#E07A2F] focus:ring-1 focus:ring-[#E07A2F] outline-none transition-colors"
                placeholder="Ví dụ: Cafe ABC"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1E1E1E] mb-2">
                Họ và tên
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#E0DCD5] focus:border-[#E07A2F] focus:ring-1 focus:ring-[#E07A2F] outline-none transition-colors"
                placeholder="Nguyễn Văn A"
                required
              />
            </div>

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
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1E1E1E] mb-2">
                Mật khẩu
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#E0DCD5] focus:border-[#E07A2F] focus:ring-1 focus:ring-[#E07A2F] outline-none transition-colors"
                placeholder="Tối thiểu 6 ký tự"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1E1E1E] mb-2">
                Xác nhận mật khẩu
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#E0DCD5] focus:border-[#E07A2F] focus:ring-1 focus:ring-[#E07A2F] outline-none transition-colors"
                placeholder="Nhập lại mật khẩu"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-[#E07A2F] hover:bg-[#C2410C] text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {isLoading ? "Đang đăng ký..." : "Đăng ký"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-[#6F6B63]">Đã có tài khoản? </span>
            <Link
              href="/auth/login"
              className="text-[#E07A2F] font-semibold hover:underline"
            >
              Đăng nhập
            </Link>
          </div>
        </div>

        {/* Staff notice */}
        <div className="mt-6 p-4 bg-[#6B8E23]/10 border border-[#6B8E23]/30 rounded-xl">
          <p className="text-sm text-[#6F6B63]">
            <strong>Bạn là nhân viên?</strong> Vui lòng tải app SnapKO trên điện
            thoại và nhập mã mời từ chủ quán.
          </p>
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
