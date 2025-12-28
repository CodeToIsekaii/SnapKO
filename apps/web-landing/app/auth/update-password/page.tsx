"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

/**
 * Update Password Page - Web Landing
 * User lands here after clicking reset link from email
 * Per .UXUIrules: Light Mode, Burnt Orange CTAs
 */

export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  // Check if user has a valid session from reset link
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setIsValidSession(!!data.session);
    };
    checkSession();
  }, [supabase]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

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
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      setSuccess(true);

      // Auto redirect after 2 seconds
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Cập nhật mật khẩu thất bại";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while checking session
  if (isValidSession === null) {
    return (
      <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center">
        <div className="text-[#6F6B63]">Đang kiểm tra...</div>
      </div>
    );
  }

  // Invalid or expired link
  if (!isValidSession) {
    return (
      <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#1E1E1E] mb-2">
            Link đã hết hạn
          </h1>
          <p className="text-[#6F6B63] mb-6">
            Link đặt lại mật khẩu đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu
            gửi lại email.
          </p>
          <Link
            href="/auth/forgot-password"
            className="inline-block px-6 py-3 bg-[#E07A2F] hover:bg-[#C2410C] text-white font-semibold rounded-xl transition-colors"
          >
            Gửi lại email
          </Link>
        </div>
      </div>
    );
  }

  // Success state
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
            Đổi mật khẩu thành công!
          </h1>
          <p className="text-[#6F6B63] mb-6">
            Đang chuyển hướng về trang chính...
          </p>
          <div className="animate-spin w-6 h-6 border-2 border-[#E07A2F] border-t-transparent rounded-full mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#E07A2F]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-[#E07A2F]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#1E1E1E]">
            Đặt mật khẩu mới
          </h1>
          <p className="text-[#6F6B63] mt-2">
            Tạo mật khẩu mới cho tài khoản của bạn
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-[#E0DCD5] p-8 shadow-sm">
          <form onSubmit={handleUpdate} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#1E1E1E] mb-2">
                Mật khẩu mới
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#E0DCD5] focus:border-[#E07A2F] focus:ring-1 focus:ring-[#E07A2F] outline-none transition-colors"
                placeholder="Tối thiểu 6 ký tự"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1E1E1E] mb-2">
                Xác nhận mật khẩu mới
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
              {isLoading ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
            </button>
          </form>
        </div>

        {/* Security hint */}
        <div className="mt-6 p-4 bg-[#6B8E23]/10 border border-[#6B8E23]/30 rounded-xl">
          <p className="text-sm text-[#6F6B63]">
            💡 <strong>Mẹo:</strong> Sử dụng mật khẩu có cả chữ hoa, chữ thường
            và số để bảo mật hơn.
          </p>
        </div>
      </div>
    </div>
  );
}
