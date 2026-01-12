"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabaseClient";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const isLoginPage = pathname === "/admin/login";

      if (!session) {
        if (!isLoginPage) {
          router.replace("/admin/login");
        } else {
          setLoading(false);
        }
        return;
      }

      // Check Role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (profile?.role !== "ADMIN") {
        // Logged in but not Admin -> Redirect to Home or Error
        console.log("User is not ADMIN, role is:", profile?.role);
        // Sign out to prevent stuck loop? Or just redirect
        await supabase.auth.signOut();
        router.replace("/admin/login");
        return;
      }

      // Is Admin
      if (isLoginPage) {
        router.replace("/admin");
      } else {
        setLoading(false);
      }
    };

    checkAuth();
  }, [pathname, router]);

  // Loading Screen
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
          <p className="mt-2 text-sm text-gray-500">Checking permissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900">
      {/* Simple Admin Header */}
      {pathname !== "/admin/login" && (
        <header className="bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
            <h1 className="text-lg font-bold text-slate-900">SnapKO Admin</h1>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/admin/login");
              }}
              className="text-sm font-medium text-red-600 hover:text-red-500"
            >
              Sign Out
            </button>
          </div>
        </header>
      )}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
