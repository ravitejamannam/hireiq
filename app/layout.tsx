import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import AuthSessionProvider from "@/components/providers/AuthSessionProvider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
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
  title: {
    default: "HireIQ",
    template: "%s · HireIQ",
  },
  description: "HireIQ hiring workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <div className="flex justify-end px-4 pt-3">
          <ThemeToggle />
        </div>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
