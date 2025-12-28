"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaWindows, FaApple, FaAndroid } from "react-icons/fa";
import { SiAppstore } from "react-icons/si";
import {
  Monitor,
  Smartphone,
  QrCode,
  Download,
  ArrowLeft,
  Check,
} from "lucide-react";

type OS = "win" | "mac" | "ios" | "android" | "unknown";

// TODO: Replace with actual download URLs from GitHub Releases
const DOWNLOAD_URLS = {
  windows:
    "https://github.com/your-org/snapko/releases/latest/download/SnapKO-Setup.exe",
  mac: "https://github.com/your-org/snapko/releases/latest/download/SnapKO.dmg",
  ios: "https://apps.apple.com/app/snapko/id123456789",
  android: "https://play.google.com/store/apps/details?id=com.snapko.app",
};

export default function DownloadPage() {
  const [detectedOS, setDetectedOS] = useState<OS>("unknown");

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setDetectedOS("ios");
    } else if (/android/.test(userAgent)) {
      setDetectedOS("android");
    } else if (/mac|macintosh/.test(userAgent)) {
      setDetectedOS("mac");
    } else if (/win|windows/.test(userAgent)) {
      setDetectedOS("win");
    }
  }, []);

  const cardBase =
    "bg-white rounded-2xl border border-[#E0DCD5] p-6 hover:shadow-lg transition-shadow";
  const recommendedCard = "ring-2 ring-[#E07A2F] relative";

  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      {/* Header */}
      <header className="border-b border-[#E0DCD5] bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#6B8E23] rounded-full flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <span className="text-[#1E1E1E] font-bold text-lg">SnapKO</span>
          </Link>
          <Link
            href="/"
            className="text-[#6F6B63] hover:text-[#1E1E1E] flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Về trang chủ
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-12">
        {/* Title */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1E1E1E] mb-4">
            Tải SnapKO
          </h1>
          <p className="text-[#6F6B63] max-w-xl mx-auto">
            Chọn phiên bản phù hợp với thiết bị của bạn. Chủ quán dùng Desktop,
            nhân viên dùng Mobile.
          </p>
        </div>

        {/* Desktop Section */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Monitor className="w-6 h-6 text-[#6F6B63]" />
            <h2 className="text-xl font-bold text-[#1E1E1E]">
              Dành cho Chủ Quán (Desktop)
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Windows */}
            <a
              href={DOWNLOAD_URLS.windows}
              className={`${cardBase} ${
                detectedOS === "win" ? recommendedCard : ""
              } block`}
            >
              {detectedOS === "win" && (
                <span className="absolute -top-3 right-4 bg-[#E07A2F] text-white text-xs font-bold px-3 py-1 rounded-full">
                  KHUYÊN DÙNG
                </span>
              )}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-[#0078D4]/10 rounded-xl flex items-center justify-center">
                  <FaWindows className="w-6 h-6 text-[#0078D4]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-[#1E1E1E] mb-1">Windows</h3>
                  <p className="text-sm text-[#6F6B63] mb-3">
                    Windows 10/11 64-bit
                  </p>
                  <div className="flex items-center gap-2 text-[#E07A2F] font-semibold text-sm">
                    <Download className="w-4 h-4" />
                    SnapKO-Setup.exe
                  </div>
                </div>
              </div>
            </a>

            {/* macOS */}
            <a
              href={DOWNLOAD_URLS.mac}
              className={`${cardBase} ${
                detectedOS === "mac" ? recommendedCard : ""
              } block`}
            >
              {detectedOS === "mac" && (
                <span className="absolute -top-3 right-4 bg-[#E07A2F] text-white text-xs font-bold px-3 py-1 rounded-full">
                  KHUYÊN DÙNG
                </span>
              )}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-[#000]/5 rounded-xl flex items-center justify-center">
                  <FaApple className="w-6 h-6 text-[#000]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-[#1E1E1E] mb-1">macOS</h3>
                  <p className="text-sm text-[#6F6B63] mb-3">
                    Apple Silicon & Intel
                  </p>
                  <div className="flex items-center gap-2 text-[#E07A2F] font-semibold text-sm">
                    <Download className="w-4 h-4" />
                    SnapKO.dmg
                  </div>
                </div>
              </div>
            </a>
          </div>
        </section>

        {/* Mobile Section */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Smartphone className="w-6 h-6 text-[#6F6B63]" />
            <h2 className="text-xl font-bold text-[#1E1E1E]">
              Dành cho Nhân Viên (Mobile)
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* iOS */}
            <a
              href={DOWNLOAD_URLS.ios}
              target="_blank"
              rel="noopener noreferrer"
              className={`${cardBase} ${
                detectedOS === "ios" ? recommendedCard : ""
              } block`}
            >
              {detectedOS === "ios" && (
                <span className="absolute -top-3 right-4 bg-[#E07A2F] text-white text-xs font-bold px-3 py-1 rounded-full">
                  KHUYÊN DÙNG
                </span>
              )}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-[#000]/5 rounded-xl flex items-center justify-center">
                  <SiAppstore className="w-6 h-6 text-[#0D96F6]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-[#1E1E1E] mb-1">iOS</h3>
                  <p className="text-sm text-[#6F6B63] mb-3">iPhone & iPad</p>
                  <div className="flex items-center gap-2 text-[#E07A2F] font-semibold text-sm">
                    Mở App Store →
                  </div>
                </div>
              </div>
            </a>

            {/* Android */}
            <a
              href={DOWNLOAD_URLS.android}
              target="_blank"
              rel="noopener noreferrer"
              className={`${cardBase} ${
                detectedOS === "android" ? recommendedCard : ""
              } block`}
            >
              {detectedOS === "android" && (
                <span className="absolute -top-3 right-4 bg-[#E07A2F] text-white text-xs font-bold px-3 py-1 rounded-full">
                  KHUYÊN DÙNG
                </span>
              )}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-[#3DDC84]/10 rounded-xl flex items-center justify-center">
                  <FaAndroid className="w-6 h-6 text-[#3DDC84]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-[#1E1E1E] mb-1">Android</h3>
                  <p className="text-sm text-[#6F6B63] mb-3">Android 8.0+</p>
                  <div className="flex items-center gap-2 text-[#E07A2F] font-semibold text-sm">
                    Mở Google Play →
                  </div>
                </div>
              </div>
            </a>
          </div>
        </section>

        {/* QR Code Section */}
        <section className="bg-white rounded-2xl border border-[#E0DCD5] p-8">
          <div className="flex items-center gap-3 mb-6">
            <QrCode className="w-6 h-6 text-[#6F6B63]" />
            <h2 className="text-xl font-bold text-[#1E1E1E]">
              Tải bằng QR Code
            </h2>
          </div>

          <p className="text-[#6F6B63] mb-6">
            Đang xem trên máy tính? Quét mã QR để tải app trên điện thoại ngay
            lập tức.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {/* iOS QR */}
            <div className="text-center">
              <div className="w-40 h-40 bg-[#FAF9F7] border border-[#E0DCD5] rounded-xl mx-auto mb-4 flex items-center justify-center">
                {/* Placeholder - Generate real QR with library like react-qr-code */}
                <div className="text-[#6F6B63] text-xs text-center">
                  <QrCode className="w-16 h-16 mx-auto mb-2 opacity-30" />
                  QR iOS
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-[#6F6B63]">
                <SiAppstore className="w-4 h-4 text-[#0D96F6]" />
                App Store
              </div>
            </div>

            {/* Android QR */}
            <div className="text-center">
              <div className="w-40 h-40 bg-[#FAF9F7] border border-[#E0DCD5] rounded-xl mx-auto mb-4 flex items-center justify-center">
                {/* Placeholder - Generate real QR with library like react-qr-code */}
                <div className="text-[#6F6B63] text-xs text-center">
                  <QrCode className="w-16 h-16 mx-auto mb-2 opacity-30" />
                  QR Android
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-[#6F6B63]">
                <FaAndroid className="w-4 h-4 text-[#3DDC84]" />
                Google Play
              </div>
            </div>
          </div>
        </section>

        {/* Info Box */}
        <div className="mt-8 bg-[#6B8E23]/10 border border-[#6B8E23]/30 rounded-xl p-6">
          <h3 className="font-bold text-[#1E1E1E] mb-2">💡 Ai dùng app nào?</h3>
          <ul className="text-sm text-[#6F6B63] space-y-2">
            <li>
              • <strong>Chủ quán:</strong> Dùng Desktop (Windows/Mac) để xem báo
              cáo, quản lý nhân viên
            </li>
            <li>
              • <strong>Nhân viên:</strong> Dùng Mobile (iOS/Android) để chụp
              hóa đơn, kiểm kho
            </li>
          </ul>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E0DCD5] py-8 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-[#6F6B63]">
          © 2024 SnapKO Inc. Bảo lưu mọi quyền.
        </div>
      </footer>
    </div>
  );
}
