import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">SK</span>
            </div>
            <span className="text-white font-bold text-xl">SnapKO</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/pricing"
              className="text-slate-300 hover:text-white transition-colors"
            >
              Bảng giá
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
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
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-4 py-2 mb-8">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-blue-300 text-sm">
                Local-first • Tuân thủ Nghị định 13
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Quản lý kho F&B{" "}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                thông minh
              </span>{" "}
              bằng AI
            </h1>

            <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-10">
              Chụp ảnh → AI nhận dạng hàng hóa → Tự động cập nhật kho.
              <br />
              Onboarding nhân viên chỉ{" "}
              <strong className="text-white">10 giây</strong>. COGS lãi gộp{" "}
              <strong className="text-white">realtime</strong>.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <a
                href="#download"
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all"
              >
                Tải App Miễn Phí
              </a>
              <Link
                href="/pricing"
                className="w-full sm:w-auto px-8 py-4 border border-slate-600 hover:border-slate-500 text-white font-medium rounded-xl transition-colors"
              >
                Xem Bảng Giá
              </Link>
            </div>

            {/* Feature Grid */}
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 text-left">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-blue-400"
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
                <h3 className="text-white font-bold text-lg mb-2">
                  Offline-First
                </h3>
                <p className="text-slate-400 text-sm">
                  Hoạt động không cần mạng. Tự động đồng bộ khi có kết nối.
                </p>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 text-left">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-purple-400"
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
                <h3 className="text-white font-bold text-lg mb-2">
                  AI Nhận Dạng
                </h3>
                <p className="text-slate-400 text-sm">
                  Gemini Vision tự động parse hóa đơn, menu với confidence
                  score.
                </p>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 text-left">
                <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-green-400"
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
                <h3 className="text-white font-bold text-lg mb-2">
                  COGS Realtime
                </h3>
                <p className="text-slate-400 text-sm">
                  Theo dõi giá vốn, lãi gộp từng món theo thời gian thực.
                </p>
              </div>
            </div>
          </div>

          {/* Download Section */}
          <div id="download" className="py-16">
            <h2 className="text-3xl font-bold text-white text-center mb-8">
              Tải ứng dụng
            </h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="#"
                className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl px-6 py-4 transition-colors"
              >
                <svg
                  className="w-8 h-8 text-white"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                <div className="text-left">
                  <div className="text-slate-400 text-xs">Tải về từ</div>
                  <div className="text-white font-semibold">App Store</div>
                </div>
              </a>
              <a
                href="#"
                className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl px-6 py-4 transition-colors"
              >
                <svg
                  className="w-8 h-8 text-white"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
                </svg>
                <div className="text-left">
                  <div className="text-slate-400 text-xs">Tải về từ</div>
                  <div className="text-white font-semibold">Google Play</div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-sm">
            © 2024 SnapKO. Ứng dụng quản lý kho F&B thông minh.
          </p>
          <div className="flex items-center justify-center gap-4 mt-4 text-sm">
            <a
              href="#"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Điều khoản
            </a>
            <a
              href="#"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Quyền riêng tư
            </a>
            <a
              href="https://zalo.me/snapko"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Liên hệ Zalo
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
