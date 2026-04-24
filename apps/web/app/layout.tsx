import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClientSideCPP Playground",
  description: "Run ClientSideCPP programs directly in the browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
