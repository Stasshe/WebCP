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
    <html lang="ja" className="h-full">
      <body className="h-full overflow-hidden bg-[var(--bg)] font-[var(--font-ui)] text-[12px] leading-[1.4] text-[var(--text)]">
        {children}
      </body>
    </html>
  );
}
