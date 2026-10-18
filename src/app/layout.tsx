import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Mộc Chi | Quản lý tài chính cá nhân",
  description: "Theo dõi thu chi, ngân sách và mục tiêu tài chính cá nhân.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "Mộc Chi Finance",
    description: "Trợ lý ghi thu chi theo phong cách trò chuyện.",
    images: [{ url: "/moc-chi-thumbnail.png", width: 1734, height: 907, alt: "Mộc Chi Finance" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
