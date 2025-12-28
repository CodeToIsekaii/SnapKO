"use client";

import { useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { FaWindows, FaApple, FaAndroid } from "react-icons/fa";
import { SiAppstore } from "react-icons/si";

type OS = "win" | "mac" | "ios" | "android" | "unknown";

interface SmartDownloadButtonProps {
  windowsUrl?: string;
  macUrl?: string;
  iosUrl?: string;
  androidUrl?: string;
  className?: string;
}

export default function SmartDownloadButton({
  windowsUrl = "/auth/register",
  macUrl = "/auth/register",
  iosUrl = "/auth/register",
  androidUrl = "/auth/register",
  className = "",
}: SmartDownloadButtonProps) {
  const [os, setOs] = useState<OS>("unknown");

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();

    if (/iphone|ipad|ipod/.test(userAgent)) {
      setOs("ios");
    } else if (/android/.test(userAgent)) {
      setOs("android");
    } else if (/mac|macintosh/.test(userAgent)) {
      setOs("mac");
    } else if (/win|windows/.test(userAgent)) {
      setOs("win");
    }
  }, []);

  const buttonBase =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors";
  const primaryButton = `${buttonBase} bg-[#E07A2F] hover:bg-[#C2410C] text-white px-6 py-3`;
  const secondaryButton = `${buttonBase} bg-white text-[#1E1E1E] border border-[#E0DCD5] px-5 py-3 hover:bg-[#FAF9F7]`;

  // Windows detected
  if (os === "win") {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <a href={windowsUrl} className={primaryButton}>
          <Monitor className="w-5 h-5" />
          Dùng thử miễn phí
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
        <a href={macUrl} className={primaryButton}>
          <Monitor className="w-5 h-5" />
          Dùng thử miễn phí
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
        <a href={iosUrl} className={primaryButton}>
          <Smartphone className="w-5 h-5" />
          Dùng thử miễn phí
        </a>
        <span className="text-xs text-[#6F6B63]">App Store</span>
      </div>
    );
  }

  // Android detected
  if (os === "android") {
    return (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        <a href={androidUrl} className={primaryButton}>
          <Smartphone className="w-5 h-5" />
          Dùng thử miễn phí
        </a>
        <span className="text-xs text-[#6F6B63]">Google Play</span>
      </div>
    );
  }

  // Unknown - show single button
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <a href={windowsUrl} className={primaryButton}>
        <Monitor className="w-5 h-5" />
        Dùng thử miễn phí
      </a>
      <span className="text-xs text-[#6F6B63]">
        Windows, macOS, iOS, Android
      </span>
    </div>
  );
}
