"use client";

import React, { useState, ReactNode } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Users,
  BarChart3,
  Camera,
  FileText,
  ClipboardCheck,
  Smartphone,
  Calculator,
  ShieldCheck,
  Zap,
  AlertTriangle,
  Check,
  Apple,
  Monitor,
  ChevronRight,
  ChevronDown,
  Wifi,
  WifiOff,
} from "lucide-react";
import SmartDownloadButton from "./components/SmartDownloadButton";
import NavBar from "./components/NavBar";

// ============================================================
// REUSABLE COMPONENTS
// ============================================================

// Logo Component
const Logo = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <div className="w-8 h-8 bg-[#6B8E23] rounded-full flex items-center justify-center">
      <Check className="w-4 h-4 text-white" />
    </div>
    <span className="text-[#1E1E1E] font-bold text-lg">SnapKO</span>
  </div>
);

// Badge Component
interface BadgeProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline";
}

const Badge = ({ children, variant = "primary" }: BadgeProps) => {
  const variants = {
    primary: "bg-[#E07A2F]/10 text-[#E07A2F]",
    secondary: "bg-[#6B8E23]/10 text-[#6B8E23]",
    outline: "border border-[#E0DCD5] text-[#6F6B63]",
  };

  return (
    <span
      className={`inline-block text-xs font-medium px-3 py-1.5 rounded-full ${variants[variant]}`}
    >
      {children}
    </span>
  );
};

// Button Component
interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
  href?: string;
}

const Button = ({
  children,
  variant = "primary",
  size = "md",
  className = "",
  onClick,
  href,
}: ButtonProps) => {
  const variants = {
    primary: "bg-[#E07A2F] hover:bg-[#C2410C] text-white",
    secondary: "bg-[#6B8E23] hover:bg-[#5a7a1f] text-white",
    outline: "border-2 border-[#E07A2F] text-[#E07A2F] hover:bg-[#E07A2F]/5",
    ghost: "text-[#6F6B63] hover:text-[#1E1E1E] hover:bg-[#FAF9F7]",
  };

  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-base",
  };

  const baseClass = `inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors ${variants[variant]} ${sizes[size]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={baseClass}>
        {children}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={baseClass}>
      {children}
    </button>
  );
};

// Feature Card Component
interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  iconBg?: string;
}

const FeatureCard = ({
  icon,
  title,
  description,
  iconBg = "bg-[#FAF9F7]",
}: FeatureCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5 }}
    className="bg-white border border-[#E0DCD5] rounded-xl p-6 hover:shadow-lg transition-shadow"
  >
    <div
      className={`w-12 h-12 ${iconBg} border border-[#E0DCD5] rounded-xl flex items-center justify-center mb-4`}
    >
      {icon}
    </div>
    <h4 className="font-bold text-[#1E1E1E] mb-2">{title}</h4>
    <p className="text-sm text-[#6F6B63] leading-relaxed">{description}</p>
  </motion.div>
);

// Workflow Step Card
interface StepCardProps {
  icon: ReactNode;
  iconBg: string;
  title: string;
  description: string;
  delay?: number;
}

const StepCard = ({
  icon,
  iconBg,
  title,
  description,
  delay = 0,
}: StepCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay }}
    className="bg-[#FAF9F7] rounded-xl p-6 text-center"
  >
    <div
      className={`w-14 h-14 ${iconBg} rounded-xl flex items-center justify-center mx-auto mb-4`}
    >
      {icon}
    </div>
    <h4 className="font-bold text-[#1E1E1E] mb-2">{title}</h4>
    <p className="text-sm text-[#6F6B63] leading-relaxed">{description}</p>
  </motion.div>
);

// Pricing Card
interface PricingCardProps {
  name: string;
  subtitle: string;
  price: string;
  priceUnit: string;
  features: string[];
  cta: string;
  popular?: boolean;
  checkColor?: string;
  href?: string;
}

const PricingCard = ({
  name,
  subtitle,
  price,
  priceUnit,
  features,
  cta,
  popular = false,
  checkColor = "text-[#6F6B63]",
  href,
}: PricingCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5 }}
    className={`bg-white rounded-2xl p-8 relative ${
      popular
        ? "border-2 border-[#E07A2F] shadow-lg"
        : "border border-[#E0DCD5]"
    }`}
  >
    {popular && (
      <div className="absolute -top-3 right-6 bg-[#E07A2F] text-white text-xs font-bold px-3 py-1 rounded-full">
        PHỔ BIẾN
      </div>
    )}

    <div
      className={`text-sm mb-1 ${
        popular ? "text-[#E07A2F] font-medium" : "text-[#6F6B63]"
      }`}
    >
      {name}
    </div>
    <p className="text-xs text-[#6F6B63] mb-4">{subtitle}</p>

    <div className="mb-6">
      <span className="text-3xl font-bold text-[#1E1E1E]">{price}</span>
      <span className="text-[#6F6B63] ml-2">{priceUnit}</span>
    </div>

    <ul className="space-y-3 mb-8">
      {features.map((feature, i) => (
        <li key={i} className="flex items-center gap-3 text-sm">
          <Check className={`w-4 h-4 ${checkColor}`} />
          <span>{feature}</span>
        </li>
      ))}
    </ul>

    <Button
      variant={popular ? "primary" : "outline"}
      className="w-full"
      href={href}
    >
      {cta}
    </Button>
    {popular && (
      <p className="text-center text-xs text-[#6F6B63] mt-3">
        Không cần thẻ tín dụng
      </p>
    )}
  </motion.div>
);

// FAQ Accordion Item
interface FAQItemProps {
  icon: ReactNode;
  number: number;
  question: string;
  answer: string;
}

const FAQItem = ({ icon, number, question, answer }: FAQItemProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="bg-white border border-[#E0DCD5] rounded-xl overflow-hidden"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-start gap-3 w-full p-6 text-left hover:bg-[#FAF9F7] transition-colors"
      >
        <div className="w-8 h-8 bg-[#6B8E23]/10 rounded-lg flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-[#1E1E1E]">
            {number}. {question}
          </h4>
          <AnimatePresence>
            {isOpen && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="text-sm text-[#6F6B63] mt-2 leading-relaxed"
              >
                {answer}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-[#6F6B63] transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
    </motion.div>
  );
};

// Section Wrapper with Animation
interface SectionProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

const Section = ({ children, className = "", id }: SectionProps) => (
  <section id={id} className={`py-16 md:py-20 ${className}`}>
    <div className="max-w-6xl mx-auto px-4">{children}</div>
  </section>
);

// Section Header
interface SectionHeaderProps {
  badge?: string;
  badgeVariant?: "primary" | "secondary";
  title: string | ReactNode;
  subtitle?: string;
  centered?: boolean;
}

const SectionHeader = ({
  badge,
  badgeVariant = "primary",
  title,
  subtitle,
  centered = false,
}: SectionHeaderProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className={`mb-12 ${centered ? "text-center" : ""}`}
  >
    {badge && <Badge variant={badgeVariant}>{badge}</Badge>}
    <div className="mt-4">
      {typeof title === "string" ? (
        <h2 className="text-3xl md:text-4xl font-bold text-[#1E1E1E]">
          {title}
        </h2>
      ) : (
        title
      )}
    </div>
    {subtitle && (
      <p className="text-[#6F6B63] mt-4 max-w-2xl mx-auto">{subtitle}</p>
    )}
  </motion.div>
);

// ============================================================
// MAIN LANDING PAGE COMPONENT
// ============================================================

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      {/* Navigation - Now uses NavBar component */}
      <NavBar />

      {/* Hero Section */}
      <section className="pt-28 pb-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Badge variant="secondary">
                ĐÃ MỞ ĐĂNG KÝ • THAM GIA CÙNG 2,000+ CHỦ QUÁN
              </Badge>

              <h1 className="text-4xl md:text-5xl font-bold text-[#1E1E1E] mt-6 mb-2 leading-tight">
                Hệ sinh thái
              </h1>
              <h1 className="text-4xl md:text-5xl font-bold text-[#E07A2F] mb-2 leading-tight">
                Hybrid
              </h1>
              <h1 className="text-4xl md:text-5xl font-bold text-[#1E1E1E] mb-6 leading-tight">
                quản lý kho cho F&B
              </h1>

              <p className="text-[#6F6B63] text-base mb-8 leading-relaxed max-w-md">
                Kết hợp thói quen dùng giấy bút truyền thống với sức mạnh AI.
                Đối soát kho, hóa đơn, và báo cáo POS trong vài giây. An toàn dữ
                liệu tuyệt đối.
              </p>

              <SmartDownloadButton />
              <div className="flex items-center gap-4 mt-4">
                <Link
                  href="/download"
                  className="text-[#6F6B63] text-sm hover:text-[#E07A2F] underline"
                >
                  Xem tất cả các phiên bản →
                </Link>
              </div>
            </motion.div>

            {/* Right - App Preview */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="bg-white rounded-2xl shadow-xl border border-[#E0DCD5] p-6">
                {/* Window controls */}
                <div className="flex gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F57]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#28C840]"></div>
                </div>

                {/* Content area with placeholder bars and badge */}
                <div className="relative mb-6">
                  {/* Left side - Placeholder bars */}
                  <div className="space-y-3">
                    <div className="h-3 w-32 bg-[#E5E5E5] rounded"></div>
                    <div className="h-3 w-24 bg-[#E5E5E5] rounded"></div>
                    <div className="h-3 w-28 bg-[#E5E5E5] rounded"></div>
                    <div className="h-3 w-20 bg-[#E5E5E5] rounded"></div>
                  </div>

                  {/* Smart check badge - positioned to the right */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 }}
                    className="absolute top-0 right-0 bg-white border border-[#E0DCD5] rounded-lg px-3 py-2 shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 bg-[#28C840] rounded-full animate-pulse"></span>
                      <span className="text-[10px] text-[#6F6B63] font-medium">
                        KIỂM TRA THÔNG MINH
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[#6B8E23]" />
                      <span className="text-sm font-medium text-[#1E1E1E]">
                        Khớp dữ liệu
                      </span>
                    </div>
                  </motion.div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-4 mb-6 border border-[#E0DCD5] rounded-lg p-4">
                  <div className="text-center">
                    <div className="text-xl font-bold text-[#1E1E1E]">
                      125.4tr
                    </div>
                  </div>
                  <div className="text-center border-l border-r border-[#E0DCD5]">
                    <div className="text-xl font-bold text-[#E07A2F]">
                      32.1%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-[#6B8E23]">
                      45.2tr
                    </div>
                  </div>
                </div>

                {/* Green Download Card */}
                <div className="bg-[#6B8E23] rounded-xl p-5 text-white">
                  <h3 className="font-bold text-lg mb-1">
                    Sẵn sàng kiểm soát kho?
                  </h3>
                  <p className="text-sm opacity-90 mb-4">
                    Tham gia cuộc cách mạng Hybrid. Tải SnapKO ngay hôm nay.
                  </p>

                  {/* Download buttons - matching Figma layout */}
                  <div className="flex items-center gap-2">
                    {/* iOS button - gray background */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-2 bg-[#F5F5F5] text-[#1E1E1E] rounded-lg px-4 py-2.5"
                    >
                      <Apple className="w-5 h-5" />
                      <span className="text-sm font-medium">iOS</span>
                    </motion.button>

                    {/* Android button - white border */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-2 bg-white text-[#1E1E1E] border border-[#E0DCD5] rounded-lg px-4 py-2.5"
                    >
                      <Smartphone className="w-5 h-5" />
                      <span className="text-sm font-medium">Android</span>
                    </motion.button>

                    {/* Desktop dropdown - green bg with macOS + Windows */}
                    <div className="flex bg-[#5a7a1f] rounded-lg overflow-hidden ml-auto">
                      <button className="flex items-center gap-1.5 px-3 py-2.5 text-white hover:bg-[#4d6a1a] transition-colors">
                        <Apple className="w-4 h-4" />
                        <span className="text-sm">macOS</span>
                      </button>
                      <div className="w-px bg-white/30"></div>
                      <button className="flex items-center gap-1.5 px-3 py-2.5 text-white hover:bg-[#4d6a1a] transition-colors">
                        <Monitor className="w-4 h-4" />
                        <span className="text-sm">Windows</span>
                      </button>
                      <ChevronDown className="w-4 h-4 text-white self-center mr-2" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <Section id="guide" className="bg-white">
        <SectionHeader
          badge="HƯỚNG DẪN SỬ DỤNG"
          title={
            <>
              <h2 className="text-3xl md:text-4xl font-bold text-[#1E1E1E]">
                Quản lý kho F&B chỉ với
              </h2>
              <h2 className="text-3xl md:text-4xl font-bold text-[#E07A2F]">
                3 lần chụp ảnh
              </h2>
            </>
          }
          subtitle="Quy trình được chia làm 2 phần rõ rệt dành cho Chủ quán và Nhân viên"
          centered
        />

        {/* Owner Section */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <Settings className="w-5 h-5 text-[#6F6B63]" />
            <h3 className="text-xl font-bold text-[#1E1E1E]">
              Dành cho Chủ Quán (Owner)
            </h3>
            <Badge variant="outline">Web Dashboard / Desktop App</Badge>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <StepCard
              icon={<Settings className="w-6 h-6 text-[#E07A2F]" />}
              iconBg="bg-[#E07A2F]/10"
              title="1. Thiết lập ban đầu"
              description="Đăng ký & chọn gói PRO nếu cần quản lý nhân viên. Cấu hình Mô hình kho (Model A cho quán nhỏ hoặc B cho quán có kho riêng)."
              delay={0}
            />
            <StepCard
              icon={<Users className="w-6 h-6 text-[#E07A2F]" />}
              iconBg="bg-[#E07A2F]/10"
              title="2. Mời nhân viên"
              description="Tạo mã mời 6 số trong menu Staff Management và gửi cho nhân viên. Mã chỉ hiệu lực trong 24h."
              delay={0.1}
            />
            <StepCard
              icon={<BarChart3 className="w-6 h-6 text-[#6B8E23]" />}
              iconBg="bg-[#6B8E23]/10"
              title="3. Xem báo cáo & Cảnh báo"
              description='Xem Real-time Stock và Variance Report. Xanh là khớp, Đỏ là lệch. Cảnh báo "Perfect Score Trap" nếu số liệu quá hoàn hảo.'
              delay={0.2}
            />
          </div>

          {/* Warning Box */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-6 bg-[#FFF8E7] border border-[#FFBD2E]/30 rounded-xl p-4 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-[#FFBD2E] flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-[#1E1E1E]">
                Cảnh báo đặc biệt:{" "}
              </span>
              <span className="text-[#6F6B63] text-sm">
                Nếu thấy thông báo &quot;Perfect Score Trap&quot;, hãy kiểm tra
                camera ngay. Có thể nhân viên đang điền bừa số liệu cho khớp
                100% để đối phó.
              </span>
            </div>
          </motion.div>
        </div>

        {/* Staff Section */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <Settings className="w-5 h-5 text-[#6F6B63]" />
            <h3 className="text-xl font-bold text-[#1E1E1E]">
              Dành cho Nhân Viên (Staff)
            </h3>
            <Badge variant="outline">Mobile App (iOS / Android)</Badge>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <StepCard
              icon={<Camera className="w-6 h-6 text-[#E07A2F]" />}
              iconBg="bg-[#E07A2F]/10"
              title="Bước 1: Nhập hàng (Import Snap)"
              description="Chụp Hóa đơn đỏ/Phiếu giao hàng. AI đọc tên món & số lượng. Confirm nếu Xanh, Sửa nếu Đỏ."
              delay={0}
            />
            <StepCard
              icon={<FileText className="w-6 h-6 text-[#6B8E23]" />}
              iconBg="bg-[#6B8E23]/10"
              title="Bước 2: Bán hàng (Sales Snap)"
              description='Cuối ca, chụp báo cáo "Tổng kết ca" từ máy POS. Hệ thống tự trừ kho tại Quầy Bar.'
              delay={0.1}
            />
            <StepCard
              icon={<ClipboardCheck className="w-6 h-6 text-[#6B8E23]" />}
              iconBg="bg-[#6B8E23]/10"
              title="Bước 3: Kiểm kho (Stock Snap)"
              description="Điền số lượng thực tế vào giấy kiểm kê rồi chụp lại. Nếu lệch >2% phải chọn lý do (Vỡ, Đổ...) mới được gửi."
              delay={0.2}
            />
          </div>

          {/* Info boxes */}
          <div className="grid md:grid-cols-2 gap-4 mt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-[#FAF9F7] rounded-xl p-4 flex items-start gap-3"
            >
              <Monitor className="w-5 h-5 text-[#6F6B63] flex-shrink-0 mt-0.5" />
              <div>
                <h5 className="font-semibold text-[#1E1E1E] mb-1">Đăng nhập</h5>
                <p className="text-sm text-[#6F6B63]">
                  Tải app SnapKO → Chọn &quot;Join as Staff&quot; → Nhập Tên &
                  SĐT → Nhập Invite Code từ chủ quán.
                </p>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-[#FAF9F7] rounded-xl p-4 flex items-start gap-3"
            >
              <Zap className="w-5 h-5 text-[#6F6B63] flex-shrink-0 mt-0.5" />
              <div>
                <h5 className="font-semibold text-[#1E1E1E] mb-1">
                  Xử lý chênh lệch
                </h5>
                <p className="text-sm text-[#6F6B63]">
                  App báo Dư: Bấm &quot;Auto-Fix&quot;. App báo Thiếu {">"}2%:
                  Phải chọn lý do (Vỡ, hết hạn...) mới được gửi.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </Section>

      {/* Features Section */}
      <Section id="features">
        <SectionHeader
          badge="TẠI SAO CHỌN SNAPKO"
          title={
            <>
              <h2 className="text-3xl md:text-4xl font-bold text-[#1E1E1E]">
                Xây dựng cho thực tế vận hành
              </h2>
              <h2 className="text-3xl md:text-4xl font-bold text-[#1E1E1E]">
                F&B
              </h2>
            </>
          }
        />

        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<FileText className="w-5 h-5 text-[#6F6B63]" />}
            title="Hybrid Giấy-Kỹ Thuật Số"
            description="Không ép nhân viên dùng điện thoại tay ướt. Để họ viết giấy, SnapKO sẽ số hóa tất cả."
          />
          <FeatureCard
            icon={<Smartphone className="w-5 h-5 text-[#6F6B63]" />}
            title="Local-First & Offline"
            description="Hoạt động mượt mà không cần internet. Tự động đồng bộ an toàn khi có mạng."
          />
          <FeatureCard
            icon={<Calculator className="w-5 h-5 text-[#6F6B63]" />}
            title="Tính COGS Realtime"
            description="Tính giá vốn hàng bán (COGS) ngay lập tức khi quét hóa đơn. Nắm rõ lợi nhuận từng ngày."
          />
          <FeatureCard
            icon={<ShieldCheck className="w-5 h-5 text-[#6F6B63]" />}
            title="Kiểm Tra Thông Minh"
            description="3 tầng kiểm tra: Độ tin cậy AI, So sánh Toán học, và Yêu cầu giải trình khi lệch kho."
          />
          <FeatureCard
            icon={<Zap className="w-5 h-5 text-[#6F6B63]" />}
            title="Đăng Ký Trong 10 Giây"
            description="Nhân viên tham gia chỉ cần Tên + SĐT. Không form phức tạp, không thu thập dữ liệu thừa."
          />
          <FeatureCard
            icon={<AlertTriangle className="w-5 h-5 text-[#6F6B63]" />}
            title="Phát Hiện Gian Lận"
            description="Đối soát chéo bill POS với lượng tiêu thụ thực tế để phát hiện các mẫu bất thường."
          />
        </div>
      </Section>

      {/* Pricing Section */}
      <Section id="pricing" className="bg-white">
        <SectionHeader
          badge="BẢNG GIÁ ĐƠN GIẢN"
          title="Trả phí cho hiệu quả thực tế"
          centered
        />

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <PricingCard
            name="Gói A: STARTER"
            subtitle="Để chủ quán dùng thử & trải nghiệm"
            price="Miễn phí"
            priceUnit="vĩnh viễn"
            features={[
              "Lưu trữ nội bộ (Local-first)",
              "Không đồng bộ Cloud",
              "1 Người dùng (Owner)",
              "AI: 10 lần scan/tháng",
              "Kho Model A (Cơ bản)",
            ]}
            cta="Bắt đầu ngay"
            href="/download"
          />
          <PricingCard
            name="Gói B: PRO"
            subtitle="Dành cho quán vận hành chuyên nghiệp"
            price="100.000đ"
            priceUnit="/tháng"
            features={[
              "Cloud Sync (Real-time) đa thiết bị",
              "Unlimited AI (Scan thoải mái)",
              "Chống gian lận (Cảnh báo Dư/Thiếu)",
              "Đa người dùng (Phân quyền Staff)",
              "Báo cáo nâng cao (Excel, Biểu đồ)",
              "Kho Model B (Chuẩn) & C (Chuỗi)",
            ]}
            cta="Dùng thử 14 ngày miễn phí"
            popular
            checkColor="text-[#E07A2F]"
            href="/pricing"
          />
        </div>
      </Section>

      {/* FAQ Section */}
      <Section id="faq">
        <SectionHeader
          badge="GIẢI ĐÁP THẮC MẮC"
          badgeVariant="secondary"
          title="Câu hỏi thường gặp"
          centered
        />

        <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          <FAQItem
            icon={<WifiOff className="w-4 h-4 text-[#6B8E23]" />}
            number={1}
            question="Mất mạng có dùng được không?"
            answer="Được. App chạy chế độ Offline-first. Bạn cứ chụp và lưu bình thường. Khi nào có mạng, app sẽ tự động đồng bộ lên cho chủ quán xem."
          />
          <FAQItem
            icon={<Monitor className="w-4 h-4 text-[#6B8E23]" />}
            number={2}
            question="Tại sao tôi không tải được App trên máy tính?"
            answer="Chủ quán: Dùng trình duyệt web vào app.snapko.vn. Không cần tải cài đặt phức tạp. Nhân viên: Chỉ dùng trên điện thoại để chụp ảnh cho tiện."
          />
          <FAQItem
            icon={<ShieldCheck className="w-4 h-4 text-[#6B8E23]" />}
            number={3}
            question='Tại sao App báo "Too Perfect" (Quá hoàn hảo)?'
            answer="Nếu bạn kiểm kho chất lỏng (sữa, rượu) mà khớp 100% liên tục, hệ thống sẽ nghi ngờ bạn không cân đo thật mà tự đạo sổ. Hãy trung thực ghi nhận hao hụt (spillage) nếu có."
          />
          <FAQItem
            icon={<ClipboardCheck className="w-4 h-4 text-[#6B8E23]" />}
            number={4}
            question="Tôi lỡ chụp sai thì sao?"
            answer='Trước khi bấm nút "Submit" (Gửi), bạn luôn có thể sửa lại. Sau khi đã Gửi, bạn phải liên hệ Chủ quán để họ sửa trên Dashboard. Nhân viên không có quyền sửa dữ liệu quá khứ.'
          />
        </div>
      </Section>

      {/* Final CTA */}
      <Section id="download">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-[#6B8E23] rounded-3xl p-10 md:p-16 text-center text-white"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Sẵn sàng kiểm soát kho?
          </h2>
          <p className="opacity-90 mb-10 max-w-xl mx-auto">
            Tham gia cuộc cách mạng Hybrid. Tải SnapKO ngay hôm nay và đừng việc
            thất thoát lợi nhuận.
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <motion.a
              href="#"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 bg-white text-[#1E1E1E] rounded-xl px-5 py-3 hover:bg-[#FAF9F7] transition-colors"
            >
              <Apple className="w-5 h-5" />
              <div className="text-left">
                <div className="text-[10px] text-[#6F6B63]">Download for</div>
                <div className="font-semibold text-sm">iOS</div>
              </div>
            </motion.a>
            <motion.a
              href="#"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 bg-white text-[#1E1E1E] rounded-xl px-5 py-3 hover:bg-[#FAF9F7] transition-colors"
            >
              <Smartphone className="w-5 h-5" />
              <div className="text-left">
                <div className="text-[10px] text-[#6F6B63]">Download for</div>
                <div className="font-semibold text-sm">Android</div>
              </div>
            </motion.a>
            <div className="flex bg-white/10 rounded-xl overflow-hidden">
              <motion.a
                href="#"
                whileHover={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                className="flex items-center gap-2 px-4 py-3"
              >
                <Apple className="w-4 h-4" />
                <span className="text-sm font-medium">macOS</span>
              </motion.a>
              <motion.a
                href="#"
                whileHover={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                className="flex items-center gap-2 px-4 py-3 border-l border-white/20"
              >
                <Monitor className="w-4 h-4" />
                <span className="text-sm font-medium">Windows</span>
              </motion.a>
            </div>
          </div>
          <p className="text-xs opacity-70 mt-4">
            Requires Windows 10/11 64-bit
          </p>
        </motion.div>
      </Section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 border-t border-[#E0DCD5]">
        <div className="max-w-5xl mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-12">
            <span className="text-xs font-bold text-[#E07A2F] uppercase tracking-wider">
              BẢNG GIÁ ĐƠN GIẢN
            </span>
            <h2 className="text-4xl font-serif text-[#1E1E1E] mt-3">
              Trả phí cho hiệu quả thực tế
            </h2>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-2 gap-8">
            {/* STARTER - Free */}
            <div className="bg-white rounded-2xl border border-[#E0DCD5] p-8">
              <div className="text-xs text-[#6F6B63] mb-1">Gói A: STARTER</div>
              <div className="text-sm text-[#6F6B63] mb-4">
                Để chủ quán dùng thử & trải nghiệm
              </div>

              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-4xl font-serif text-[#E07A2F]">
                  Miễn phí
                </span>
                <span className="text-[#6F6B63]">vĩnh viễn</span>
              </div>

              <ul className="space-y-3 mb-8">
                {[
                  "Lưu trữ nội bộ (Local-first)",
                  "Không đồng bộ Cloud",
                  "1 Người dùng (Owner)",
                  "AI: 10 lần scan/tháng",
                  "Kho Model A (Cơ bản)",
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-[#6B8E23] mt-0.5 flex-shrink-0" />
                    <span className="text-[#1E1E1E]">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/auth/register"
                className="block w-full py-3 px-6 rounded-xl border-2 border-[#E0DCD5] text-[#E07A2F] font-semibold text-center hover:bg-[#FAF9F7] transition-colors"
              >
                Bắt đầu ngay
              </Link>
            </div>

            {/* PRO */}
            <div className="relative bg-white rounded-2xl border-2 border-[#E07A2F] p-8 shadow-lg">
              {/* Popular badge */}
              <div className="absolute -top-4 right-6 bg-[#6B8E23] text-white text-xs font-bold px-4 py-1.5 rounded-full">
                PHỔ BIẾN
              </div>

              <div className="text-xs text-[#6F6B63] mb-1">Gói B: PRO</div>
              <div className="text-sm text-[#6F6B63] mb-4">
                Dành cho quán vận hành chuyên nghiệp
              </div>

              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-4xl font-serif text-[#E07A2F]">
                  100.000đ
                </span>
                <span className="text-[#6F6B63]">/tháng</span>
              </div>

              <ul className="space-y-3 mb-8">
                {[
                  "Cloud Sync (Real-time) đa thiết bị",
                  "Unlimited AI (Scan thoải mái)",
                  "Chống gian lận (Cảnh báo Dư/Thiếu)",
                  "Đa người dùng (Phân quyền Staff)",
                  "Báo cáo nâng cao (Excel, Biểu đồ)",
                  "Kho Model B (Chuẩn) & C (Chuỗi)",
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-[#6B8E23] mt-0.5 flex-shrink-0" />
                    <span className="text-[#1E1E1E]">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/pricing"
                className="block w-full py-3 px-6 rounded-xl bg-[#E07A2F] text-white font-semibold text-center hover:bg-[#C2410C] transition-colors"
              >
                Dùng thử 14 ngày miễn phí
              </Link>

              <p className="text-center text-sm text-[#6F6B63] mt-3">
                Không cần thẻ tín dụng
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-[#E0DCD5]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div className="md:col-span-1">
              <Logo className="mb-4" />
              <p className="text-sm text-[#6F6B63] mb-4">
                Hệ thống quản lý kho duy nhất được thiết kế cho sự hỗn loạn của
                F&B. Local-first, AI mạnh mẽ, và bảo mật tuyệt đối.
              </p>
              <div className="flex gap-2">
                <div className="w-8 h-8 bg-[#1E1E1E] rounded-full"></div>
                <div className="w-8 h-8 bg-[#1E1E1E] rounded-full"></div>
                <div className="w-8 h-8 bg-[#1E1E1E] rounded-full"></div>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-[#1E1E1E] mb-4">Sản phẩm</h4>
              <ul className="space-y-2 text-sm text-[#6F6B63]">
                <li>
                  <Link href="#features" className="hover:text-[#1E1E1E]">
                    Tính năng
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="hover:text-[#1E1E1E]">
                    Bảng giá
                  </Link>
                </li>
                <li>
                  <Link href="#download" className="hover:text-[#1E1E1E]">
                    Tải ứng dụng
                  </Link>
                </li>
                <li>
                  <a href="#" className="hover:text-[#1E1E1E]">
                    Nhật ký cập nhật
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-[#1E1E1E] mb-4">Công ty</h4>
              <ul className="space-y-2 text-sm text-[#6F6B63]">
                <li>
                  <a href="#" className="hover:text-[#1E1E1E]">
                    Về chúng tôi
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-[#1E1E1E]">
                    Liên hệ
                  </a>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-[#1E1E1E]">
                    Chính sách bảo mật
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-[#1E1E1E]">
                    Điều khoản dịch vụ
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-[#E0DCD5] flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-[#6F6B63]">
              © 2024 SnapKO Inc. Bảo lưu mọi quyền.
            </p>
            <div className="flex gap-6 text-sm text-[#6F6B63]">
              <Link href="/privacy" className="hover:text-[#1E1E1E]">
                Bảo mật
              </Link>
              <Link href="/terms" className="hover:text-[#1E1E1E]">
                Điều khoản
              </Link>
              <a href="#" className="hover:text-[#1E1E1E]">
                Sitemap
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
