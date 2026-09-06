import type { Metadata } from "next";
import "./globals.css";
import "./features.css";
import "./experience.css";
import { NavigationFeedback } from "@/components/navigation-feedback";
import { ScrollToTop } from "@/components/scroll-to-top";

export const metadata: Metadata = {
  title: "早大Fortylove",
  description: "早大Fortyloveの新歓・練習予約管理アプリ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body><NavigationFeedback />{children}<ScrollToTop /></body>
    </html>
  );
}
