import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "COURTSIDE | 新歓管理",
  description: "テニスサークルの新歓・練習予約管理アプリ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
