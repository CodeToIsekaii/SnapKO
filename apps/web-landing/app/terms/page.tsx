import React from "react";
import Link from "next/link";

/**
 * Terms of Service - SnapKO
 * Per .UXUIrules: Light Mode for web landing pages
 * Colors: #FAF9F7 (Off-white), #1E1E1E (Near Black), #E07A2F (Burnt Orange)
 */

export const metadata = {
  title: "Điều khoản Sử dụng - SnapKO",
  description: "Điều khoản và điều kiện sử dụng ứng dụng SnapKO",
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#FAF9F7] text-[#1E1E1E]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Điều khoản Sử dụng</h1>
        <p className="text-[#6F6B63] mb-8">Cập nhật lần cuối: 18/12/2024</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            1. Chấp nhận Điều khoản
          </h2>
          <p className="text-[#6F6B63] leading-relaxed">
            Bằng việc tải xuống, cài đặt hoặc sử dụng ứng dụng SnapKO, bạn đồng
            ý tuân thủ các điều khoản và điều kiện được nêu trong tài liệu này.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            2. Mô tả Dịch vụ
          </h2>
          <p className="text-[#6F6B63] leading-relaxed">
            SnapKO là giải pháp quản lý kho F&B sử dụng công nghệ AI, bao gồm:
          </p>
          <ul className="list-disc list-inside text-[#6F6B63] space-y-2 mt-2">
            <li>Nhận diện hóa đơn bằng AI</li>
            <li>Quản lý nguyên liệu và công thức</li>
            <li>Tính toán giá vốn (COGS) tự động</li>
            <li>Đồng bộ dữ liệu đa nền tảng</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            3. Tài khoản Người dùng
          </h2>
          <ul className="list-disc list-inside text-[#6F6B63] space-y-2">
            <li>Bạn chịu trách nhiệm bảo mật thông tin đăng nhập.</li>
            <li>Mỗi tài khoản chỉ được sử dụng cho một doanh nghiệp.</li>
            <li>Nhân viên được mời phải được chủ quán phê duyệt.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            4. Thanh toán & Gói dịch vụ
          </h2>
          <ul className="list-disc list-inside text-[#6F6B63] space-y-2">
            <li>
              <strong>Gói FREE:</strong> Sử dụng cơ bản, lưu trữ local.
            </li>
            <li>
              <strong>Gói PERSONAL:</strong> Đồng bộ cloud, báo cáo nâng cao.
            </li>
            <li>Thanh toán qua chuyển khoản ngân hàng (SePay/Casso).</li>
            <li>Không hoàn tiền sau khi kích hoạt gói dịch vụ.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            5. Nội dung Người dùng
          </h2>
          <p className="text-[#6F6B63] leading-relaxed">
            Bạn sở hữu toàn bộ dữ liệu kinh doanh (hóa đơn, công thức, nguyên
            liệu) mà bạn tải lên. SnapKO không sử dụng dữ liệu này cho mục đích
            khác ngoài việc cung cấp dịch vụ cho bạn.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            6. Giới hạn Trách nhiệm
          </h2>
          <ul className="list-disc list-inside text-[#6F6B63] space-y-2">
            <li>
              SnapKO không chịu trách nhiệm về tính chính xác của AI parse.
            </li>
            <li>Người dùng nên kiểm tra lại dữ liệu trước khi xác nhận.</li>
            <li>
              Không chịu trách nhiệm về mất mát do lỗi thiết bị người dùng.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            7. Chấm dứt Dịch vụ
          </h2>
          <p className="text-[#6F6B63] leading-relaxed">
            Chúng tôi có quyền tạm ngưng hoặc chấm dứt tài khoản nếu phát hiện
            vi phạm điều khoản sử dụng hoặc hành vi gian lận.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-[#E07A2F]">
            8. Liên hệ
          </h2>
          <p className="text-[#6F6B63]">
            Mọi thắc mắc về Điều khoản, vui lòng liên hệ:{" "}
            <strong className="text-[#1E1E1E]">support@snapko.vn</strong>
          </p>
        </section>

        <div className="border-t border-[#E0DCD5] pt-6 mt-8 flex gap-4">
          <Link href="/" className="text-[#E07A2F] hover:underline">
            ← Trang chủ
          </Link>
          <Link href="/privacy" className="text-[#E07A2F] hover:underline">
            Chính sách Quyền riêng tư
          </Link>
        </div>
      </div>
    </div>
  );
}
