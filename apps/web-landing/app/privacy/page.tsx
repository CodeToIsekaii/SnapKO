import React from "react";
import Link from "next/link";

/**
 * Privacy Policy - SnapKO
 * Per .UXUIrules: Light Mode for web landing pages
 * Colors: #FAF9F7 (Off-white), #1E1E1E (Near Black), #E07A2F (Burnt Orange)
 */

export const metadata = {
  title: "Chính sách Quyền riêng tư - SnapKO",
  description:
    "Chính sách bảo vệ dữ liệu cá nhân của SnapKO theo Nghị định 13/2023/NĐ-CP",
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#FAF9F7] text-[#1E1E1E]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Chính sách Quyền riêng tư</h1>
        <p className="text-[#6F6B63] mb-8">Cập nhật lần cuối: 18/12/2024</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            1. Giới thiệu
          </h2>
          <p className="text-[#6F6B63] leading-relaxed">
            Chào mừng bạn đến với{" "}
            <strong className="text-[#1E1E1E]">SnapKO</strong>. Chúng tôi cam
            kết bảo vệ thông tin cá nhân của bạn và tuân thủ{" "}
            <strong className="text-[#1E1E1E]">Nghị định 13/2023/NĐ-CP</strong>{" "}
            về bảo vệ dữ liệu cá nhân của Việt Nam cũng như các quy định quốc tế
            liên quan.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            2. Dữ liệu chúng tôi thu thập
          </h2>
          <ul className="list-disc list-inside text-[#6F6B63] space-y-2">
            <li>
              <strong className="text-[#1E1E1E]">Thông tin tài khoản:</strong>{" "}
              Số điện thoại, Tên hiển thị.
            </li>
            <li>
              <strong className="text-[#1E1E1E]">Dữ liệu kinh doanh:</strong>{" "}
              Ảnh hóa đơn, nguyên liệu, công thức, lịch sử kho.
            </li>
            <li>
              <strong className="text-[#1E1E1E]">Dữ liệu thiết bị:</strong> IP,
              loại thiết bị (bảo mật & Rate Limiting).
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            3. Quyền truy cập thiết bị
          </h2>
          <ul className="list-disc list-inside text-[#6F6B63] space-y-2">
            <li>
              <strong className="text-[#1E1E1E]">Camera:</strong> Chụp ảnh hóa
              đơn nhập kho.
            </li>
            <li>
              <strong className="text-[#1E1E1E]">Thư viện ảnh:</strong> Chọn ảnh
              hóa đơn đã chụp sẵn.
            </li>
          </ul>
          <p className="text-[#6F6B63] mt-2">
            Chúng tôi <strong className="text-[#1E1E1E]">không</strong> thu thập
            hình ảnh nếu không có thao tác chủ động từ bạn.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            4. Công nghệ AI (Google Gemini)
          </h2>
          <p className="text-[#6F6B63] leading-relaxed mb-2">
            SnapKO sử dụng Google Gemini để trích xuất dữ liệu từ ảnh hóa đơn:
          </p>
          <ul className="list-disc list-inside text-[#6F6B63] space-y-2">
            <li>Ảnh được gửi ẩn danh tới API của đối tác AI.</li>
            <li>Chỉ phục vụ trích xuất thông tin cho chính bạn.</li>
            <li>Không dùng để đào tạo mô hình AI công cộng.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            5. Chia sẻ dữ liệu
          </h2>
          <p className="text-[#6F6B63] mb-2">
            Chúng tôi <strong className="text-[#1E1E1E]">không bán</strong> dữ
            liệu. Chỉ chia sẻ khi:
          </p>
          <ul className="list-disc list-inside text-[#6F6B63] space-y-2">
            <li>
              <strong className="text-[#1E1E1E]">Hạ tầng:</strong> Supabase
              (Database), Google Cloud (AI).
            </li>
            <li>
              <strong className="text-[#1E1E1E]">Thanh toán:</strong> PayOS
              (Giao dịch ngân hàng qua VietQR).
            </li>
            <li>
              <strong className="text-[#1E1E1E]">Pháp lý:</strong> Theo yêu cầu
              cơ quan có thẩm quyền.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            6. Xóa tài khoản
          </h2>
          <p className="text-[#6F6B63] leading-relaxed">
            Bạn có quyền xóa hoàn toàn tài khoản bất cứ lúc nào:
          </p>
          <ul className="list-disc list-inside text-[#6F6B63] space-y-2 mt-2">
            <li>
              <strong className="text-[#1E1E1E]">Cách thực hiện:</strong> Cài
              đặt → "Xóa tài khoản".
            </li>
            <li>
              <strong className="text-[#1E1E1E]">Hệ quả:</strong> Tất cả dữ liệu
              sẽ bị xóa vĩnh viễn sau 30 ngày.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            7. Liên hệ
          </h2>
          <ul className="text-[#6F6B63] space-y-2">
            <li>
              <strong className="text-[#1E1E1E]">Đơn vị:</strong> SnapKO Team
            </li>
            <li>
              <strong className="text-[#1E1E1E]">Email:</strong>{" "}
              support@snapko.vn
            </li>
            <li>
              <strong className="text-[#1E1E1E]">Hotline:</strong> 0123.456.789
            </li>
          </ul>
        </section>

        <div className="border-t border-[#E0DCD5] pt-6 mt-8">
          <Link href="/" className="text-[#E07A2F] hover:underline">
            ← Quay lại trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
