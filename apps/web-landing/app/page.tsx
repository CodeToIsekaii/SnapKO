import Link from "next/link";

/**
 * Landing Page - Light Mode Theme
 * Per .UXUIrules: "Exclusively Light Mode (#FAF9F7 background)"
 * Colors: Burnt Orange (#E07A2F) for CTAs, Olive Green (#6B8E23) for brand
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-[#E0DCD5]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#6B8E23] to-[#84CC16] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">SK</span>
            </div>
            <span className="text-[#1E1E1E] font-bold text-xl">SnapKO</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/pricing"
              className="text-[#6F6B63] hover:text-[#1E1E1E] transition-colors"
            >
              Bảng giá
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-[#E07A2F] hover:bg-[#C2410C] text-white rounded-lg font-medium transition-colors"
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center py-20">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-[#6B8E23]/10 border border-[#6B8E23]/30 rounded-full px-4 py-2 mb-8">
              <span className="w-2 h-2 bg-[#55A630] rounded-full animate-pulse" />
              <span className="text-[#6B8E23] text-sm font-medium">
                Local-first • Tuân thủ Nghị định 13
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-6xl font-bold text-[#1E1E1E] mb-6 leading-tight">
              Quản lý kho F&B{" "}
              <span className="bg-gradient-to-r from-[#E07A2F] to-[#6B8E23] bg-clip-text text-transparent">
                thông minh
              </span>{" "}
              bằng AI
            </h1>

            <p className="text-xl text-[#6F6B63] max-w-2xl mx-auto mb-10">
              Chụp ảnh → AI nhận dạng hàng hóa → Tự động cập nhật kho.
              <br />
              Onboarding nhân viên chỉ{" "}
              <strong className="text-[#1E1E1E]">10 giây</strong>. COGS lãi gộp{" "}
              <strong className="text-[#6B8E23]">realtime</strong>.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <a
                href="#download"
                className="w-full sm:w-auto px-8 py-4 bg-[#E07A2F] hover:bg-[#C2410C] text-white font-bold rounded-xl shadow-lg shadow-[#E07A2F]/25 transition-all"
              >
                Tải App Miễn Phí
              </a>
              <Link
                href="/pricing"
                className="w-full sm:w-auto px-8 py-4 border-2 border-[#6B8E23] hover:bg-[#6B8E23]/10 text-[#6B8E23] font-medium rounded-xl transition-colors"
              >
                Xem Bảng Giá
              </Link>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 mb-16 text-sm text-[#6F6B63]">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-[#55A630]"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Thanh toán bảo mật</span>
              </div>
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-[#55A630]"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Hoàn tiền trong 7 ngày</span>
              </div>
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-[#55A630]"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Hỗ trợ 24/7 qua Zalo</span>
              </div>
            </div>

            {/* Feature Grid */}
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="bg-white border border-[#E0DCD5] rounded-2xl p-6 text-left shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-[#E07A2F]/10 rounded-xl flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-[#E07A2F]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-[#1E1E1E] font-bold text-lg mb-2">
                  Offline-First
                </h3>
                <p className="text-[#6F6B63] text-sm">
                  Hoạt động không cần mạng. Tự động đồng bộ khi có kết nối.
                </p>
              </div>

              <div className="bg-white border border-[#E0DCD5] rounded-2xl p-6 text-left shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-[#6B8E23]/10 rounded-xl flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-[#6B8E23]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-[#1E1E1E] font-bold text-lg mb-2">
                  AI Nhận Dạng
                </h3>
                <p className="text-[#6F6B63] text-sm">
                  Gemini Vision tự động parse hóa đơn, menu với confidence
                  score.
                </p>
              </div>

              <div className="bg-white border border-[#E0DCD5] rounded-2xl p-6 text-left shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-[#55A630]/10 rounded-xl flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-[#55A630]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <h3 className="text-[#1E1E1E] font-bold text-lg mb-2">
                  COGS Realtime
                </h3>
                <p className="text-[#6F6B63] text-sm">
                  Theo dõi giá vốn, lãi gộp từng món theo thời gian thực.
                </p>
              </div>
            </div>
          </div>

          {/* Download Section */}
          <div id="download" className="py-16">
            <h2 className="text-3xl font-bold text-[#1E1E1E] text-center mb-8">
              Tải ứng dụng
            </h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="#"
                className="flex items-center gap-3 bg-[#1E1E1E] hover:bg-[#333] rounded-xl px-6 py-4 transition-colors"
              >
                <svg
                  className="w-8 h-8 text-white"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                <div className="text-left">
                  <div className="text-gray-400 text-xs">Tải về từ</div>
                  <div className="text-white font-semibold">App Store</div>
                </div>
              </a>
              <a
                href="#"
                className="flex items-center gap-3 bg-[#1E1E1E] hover:bg-[#333] rounded-xl px-6 py-4 transition-colors"
              >
                <svg
                  className="w-8 h-8 text-white"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
                </svg>
                <div className="text-left">
                  <div className="text-gray-400 text-xs">Tải về từ</div>
                  <div className="text-white font-semibold">Google Play</div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E0DCD5] py-8 bg-white">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-[#6F6B63] text-sm">
            © 2024 SnapKO. Ứng dụng quản lý kho F&B thông minh.
          </p>
          <div className="flex items-center justify-center gap-4 mt-4 text-sm">
            <Link
              href="/privacy"
              className="text-[#6F6B63] hover:text-[#1E1E1E] transition-colors"
            >
              Quyền riêng tư
            </Link>
            <Link
              href="/terms"
              className="text-[#6F6B63] hover:text-[#1E1E1E] transition-colors"
            >
              Điều khoản
            </Link>
            <a
              href="https://zalo.me/snapko"
              className="text-[#6F6B63] hover:text-[#1E1E1E] transition-colors"
            >
              Liên hệ Zalo
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
