import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
});

const SITE_TITLE = "DeskTea — Snap your desk. Overhear their secret group chat.";
const SITE_DESC =
  "Upload a photo of your desk. AI turns every object into an avatar and leaks their group chat roasting you behind your back.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://desktea.vercel.app"
  ),
  title: SITE_TITLE,
  description: SITE_DESC,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESC,
    siteName: "DeskTea",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-dvh bg-[#0A0A0A] text-[#FAFAFA] antialiased selection:bg-[#FAFAFA] selection:text-[#0A0A0A]">
        {children}
      </body>
    </html>
  );
}
