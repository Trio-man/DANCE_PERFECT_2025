
import type { Metadata } from "next";
import { GeistSans, GeistMono } from "geist/font";
import "./globals.css";

export const metadata: Metadata = {
  title: "DancePerfect",
  description: "Analyze your hip-hop dance performance with AI-powered kinematic feedback.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        suppressHydrationWarning={true} // Suppress hydration warnings for browser extension attributes
      >
        {children}
      </body>
    </html>
  );
}
