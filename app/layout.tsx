import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "./components/AppShell";
import PWA from "./components/PWA";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0B0B0D',
}

export const metadata: Metadata = {
  title: "Terny",
  description: "Gerencie sua loja com inteligência",
  applicationName: "Terny",
  appleWebApp: {
    capable: true,
    title: "Terny",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  other: { google: "notranslate" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="notranslate min-h-full bg-[#09090b]" translate="no">
        <AppShell>{children}</AppShell>
        <PWA />
      </body>
    </html>
  );
}
