import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "一园入画·掌上云游",
  description: "以3D模型为基础 浏览拙政园风光",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
