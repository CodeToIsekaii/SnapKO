import React from "react";

export const metadata = {
  title: "Chính sách Quyền riêng tư - SnapKO",
  description:
    "Chính sách bảo vệ dữ liệu cá nhân của SnapKO theo Nghị định 13/2023/NĐ-CP",
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Chính sách Quyền riêng tư</h1>
        <p className="text-slate-400 mb-8">Cập nhật lần cuối: 18/12/2024</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-blue-400">
            1. Giới thiệu
          </h2>
          <p className="text-slate-300 leading-relaxed">
            Chào mừng bạn đến với <strong>SnapKO</strong>. Chúng tôi cam kết bảo
            vệ thông tin cá nhân của bạn và tuân thủ{" "}
            <strong>Nghị định 13/2023/NĐ-CP</strong> về bảo vệ dữ liệu cá nhân
            của Việt Nam cũng như các quy định quốc tế liên quan.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-blue-400">
            2. Dữ liệu chúng tôi thu thập
          </h2>
          <ul className="list-disc list-inside text-slate-300 space-y-2">
            <li>
              <strong>Thông tin tài khoản:</strong> Số điện thoại, Tên hiển thị.
            </li>
            <li>
              <strong>Dữ liệu kinh doanh:</strong> Ảnh hóa đơn, nguyên liệu,
              công thức, lịch sử kho.
            </li>
            <li>
              <strong>Dữ liệu thiết bị:</strong> IP, loại thiết bị (bảo mật &
              Rate Limiting).
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-blue-400">
            3. Quyền truy cập thiết bị
          </h2>
          <ul className="list-disc list-inside text-slate-300 space-y-2">
            <li>
              <strong>Camera:</strong> Chụp ảnh hóa đơn nhập kho.
            </li>
            <li>
              <strong>Thư viện ảnh:</strong> Chọn ảnh hóa đơn đã chụp sẵn.
            </li>
          </ul>
          <p className="text-slate-400 mt-2">
            Chúng tôi <strong>không</strong> thu thập hình ảnh nếu không có thao
            tác chủ động từ bạn.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-blue-400">
            4. Công nghệ AI (Google Gemini)
          </h2>
          <p className="text-slate-300 leading-relaxed mb-2">
            SnapKO sử dụng Google Gemini để trích xuất dữ liệu từ ảnh hóa đơn:
          </p>
          <ul className="list-disc list-inside text-slate-300 space-y-2">
            <li>Ảnh được gửi ẩn danh tới API của đối tác AI.</li>
            <li>Chỉ phục vụ trích xuất thông tin cho chính bạn.</li>
            <li>Không dùng để đào tạo mô hình AI công cộng.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-blue-400">
            5. Chia sẻ dữ liệu
          </h2>
          <p className="text-slate-300 mb-2">
            Chúng tôi <strong>không bán</strong> dữ liệu. Chỉ chia sẻ khi:
          </p>
          <ul className="list-disc list-inside text-slate-300 space-y-2">
            <li>
              <strong>Hạ tầng:</strong> Supabase (Database), Google Cloud (AI).
            </li>
            <li>
              <strong>Thanh toán:</strong> PayOS (Giao dịch ngân hàng qua
              VietQR).
            </li>
            <li>
              <strong>Pháp lý:</strong> Theo yêu cầu cơ quan có thẩm quyền.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-blue-400">
            6. Xóa tài khoản
          </h2>
          <p className="text-slate-300 leading-relaxed">
            Bạn có quyền xóa hoàn toàn tài khoản bất cứ lúc nào:
          </p>
          <ul className="list-disc list-inside text-slate-300 space-y-2 mt-2">
            <li>
              <strong>Cách thực hiện:</strong> Cài đặt → "Xóa tài khoản".
            </li>
            <li>
              <strong>Hệ quả:</strong> Tất cả dữ liệu sẽ bị xóa vĩnh viễn sau 30
              ngày.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-blue-400">
            7. Liên hệ
          </h2>
          <ul className="text-slate-300 space-y-2">
            <li>
              <strong>Đơn vị:</strong> SnapKO Team
            </li>
            <li>
              <strong>Email:</strong> support@snapko.vn
            </li>
            <li>
              <strong>Hotline:</strong> 0123.456.789
            </li>
          </ul>
        </section>

        <div className="border-t border-slate-700 pt-6 mt-8">
          <a href="/" className="text-blue-400 hover:underline">
            ← Quay lại trang chủ
          </a>
        </div>
      </div>
    </div>
  );
}
