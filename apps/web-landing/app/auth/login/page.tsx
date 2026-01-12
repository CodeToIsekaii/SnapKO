"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { FaGoogle } from "react-icons/fa";

/**
 * Login Page - Web Landing
 * Per .UXUIrules: Light Mode, Burnt Orange CTAs
 * Supports Email/Password + Google OAuth
 */

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError("Vui lòng nhập email và mật khẩu");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

      if (signInError) {
        throw new Error(signInError.message);
      }

      if (data.session) {
        console.log("AUTH: Session found, checking profile...");
        // Check role and redirect
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.session.user.id)
          .single();

        if (profileError) {
          console.error("AUTH: Profile error:", profileError);
        }

        console.log("AUTH: Profile data:", profile);

        if (profile?.role === "ADMIN") {
          console.log("AUTH: Redirecting to /admin");
          router.push("/admin");
        } else {
          console.log("AUTH: Redirecting to /dashboard");
          router.push("/dashboard");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Đăng nhập thất bại";
      setError(message);
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
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
        err instanceof Error ? err.message : "Đăng nhập Google thất bại";
      setError(message);
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="text-3xl font-bold text-[#E07A2F]">SnapKO</span>
          </Link>
          <p className="text-[#6F6B63] mt-2">Đăng nhập vào tài khoản của bạn</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-[#E0DCD5] p-8 shadow-sm">
          {/* Google Login - Priority */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isGoogleLoading || isLoading}
            className="w-full py-3 px-4 bg-white border border-[#E0DCD5] hover:bg-[#FAF9F7] text-[#1E1E1E] font-semibold rounded-xl transition-colors flex items-center justify-center gap-3 disabled:opacity-50 mb-6"
          >
            {isGoogleLoading ? (
              <div className="w-5 h-5 border-2 border-[#E07A2F] border-t-transparent rounded-full animate-spin" />
            ) : (
              <FaGoogle className="w-5 h-5 text-[#4285F4]" />
            )}
            {isGoogleLoading ? "Đang kết nối..." : "Đăng nhập với Google"}
          </button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E0DCD5]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-[#6F6B63]">hoặc</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleLogin} className="space-y-4">
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
                placeholder="••••••••"
                required
              />
            </div>

            <div className="flex justify-end">
              <Link
                href="/auth/forgot-password"
                className="text-sm text-[#6F6B63] hover:text-[#E07A2F]"
              >
                Quên mật khẩu?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading || isGoogleLoading}
              className="w-full py-3 px-4 bg-[#E07A2F] hover:bg-[#C2410C] text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {isLoading ? "Đang đăng nhập..." : "Đăng nhập với Email"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-[#6F6B63]">Chưa có tài khoản? </span>
            <Link
              href="/auth/register"
              className="text-[#E07A2F] font-semibold hover:underline"
            >
              Đăng ký ngay
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
