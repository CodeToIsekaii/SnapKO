import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "SnapKO - Quản lý kho F&B thông minh bằng AI",
  description:
    "Ứng dụng quản lý kho F&B local-first với AI nhận dạng hàng hóa, COGS realtime, tuân thủ Nghị định 13. Onboarding nhân viên chỉ 10 giây.",
  keywords: [
    "quản lý kho",
    "F&B",
    "inventory management",
    "AI",
    "COGS",
    "restaurant",
    "cafe",
    "Vietnam",
  ],
  authors: [{ name: "SnapKO Team" }],
  openGraph: {
    title: "SnapKO - Quản lý kho F&B thông minh bằng AI",
    description:
      "Ứng dụng quản lý kho F&B local-first với AI nhận dạng hàng hóa, COGS realtime.",
    type: "website",
    locale: "vi_VN",
    siteName: "SnapKO",
  },
  twitter: {
    card: "summary_large_image",
    title: "SnapKO - Quản lý kho F&B thông minh bằng AI",
    description: "AI nhận dạng hàng hóa, COGS realtime, tuân thủ Nghị định 13.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
