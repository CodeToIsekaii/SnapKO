import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://snapko.io.vn"),
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
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/logo.png", sizes: "500x500", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "SnapKO - Quản lý kho F&B thông minh bằng AI",
    description:
      "Ứng dụng quản lý kho F&B local-first với AI nhận dạng hàng hóa, COGS realtime.",
    type: "website",
    locale: "vi_VN",
    siteName: "SnapKO",
    images: [
      {
        url: "/logo.png",
        width: 500,
        height: 500,
        alt: "SnapKO",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "SnapKO - Quản lý kho F&B thông minh bằng AI",
    description: "AI nhận dạng hàng hóa, COGS realtime, tuân thủ Nghị định 13.",
    images: ["/logo.png"],
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
