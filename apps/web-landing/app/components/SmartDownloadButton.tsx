"use client";

import { useEffect, useState, useMemo } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type OS = "win" | "mac" | "ios" | "android" | "unknown";

interface SmartDownloadButtonProps {
  windowsUrl?: string;
  macUrl?: string;
  iosUrl?: string;
  androidUrl?: string;
  className?: string;
}

export default function SmartDownloadButton({
  windowsUrl = "/download",
  macUrl = "/download",
  iosUrl = "/download",
  androidUrl = "/download",
  className = "",
}: SmartDownloadButtonProps) {
  const [os, setOs] = useState<OS>("unknown");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Use Supabase client for accurate auth check
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  useEffect(() => {
    // 1. Detect OS
    const userAgent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) setOs("ios");
    else if (/android/.test(userAgent)) setOs("android");
    else if (/mac|macintosh/.test(userAgent)) setOs("mac");
    else if (/win|windows/.test(userAgent)) setOs("win");

    // 2. Check Auth using Supabase Client
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error("Auth check error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    // Listen for auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const getDestinationUrl = (targetOsUrl: string) => {
    if (isLoading) return "#";
    // If authenticated -> Go to Download page
    // If NOT authenticated -> Go to Register page
    return isAuthenticated ? targetOsUrl : "/auth/register";
  };

  const buttonBase =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors";
  const primaryButton = `${buttonBase} bg-[#E07A2F] hover:bg-[#C2410C] text-white px-6 py-3 cursor-pointer`;

  const btnText = isAuthenticated ? "Tải xuống ngay" : "Dùng thử miễn phí";

  // Windows detected
  if (os === "win") {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <a href={getDestinationUrl(windowsUrl)} className={primaryButton}>
          <Monitor className="w-5 h-5" />
          {btnText}
        </a>
        <span className="text-xs text-[#6F6B63]">
          Hỗ trợ Windows 10/11 64-bit
        </span>
      </div>
    );
  }

  // macOS detected
  if (os === "mac") {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <a href={getDestinationUrl(macUrl)} className={primaryButton}>
          <Monitor className="w-5 h-5" />
          {btnText}
        </a>
        <span className="text-xs text-[#6F6B63]">
          macOS • Apple Silicon & Intel
        </span>
      </div>
    );
  }

  // iOS detected
  if (os === "ios") {
    return (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        <a href={getDestinationUrl(iosUrl)} className={primaryButton}>
          <Smartphone className="w-5 h-5" />
          {btnText}
        </a>
        <span className="text-xs text-[#6F6B63]">App Store</span>
      </div>
    );
  }

  // Android detected
  if (os === "android") {
    return (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        <a href={getDestinationUrl(androidUrl)} className={primaryButton}>
          <Smartphone className="w-5 h-5" />
          {btnText}
        </a>
        <span className="text-xs text-[#6F6B63]">Google Play</span>
      </div>
    );
  }

  // Unknown - show single button
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <a href={getDestinationUrl(windowsUrl)} className={primaryButton}>
        <Monitor className="w-5 h-5" />
        {btnText}
      </a>
      <span className="text-xs text-[#6F6B63]">
        Windows, macOS, iOS, Android
      </span>
    </div>
  );
}
