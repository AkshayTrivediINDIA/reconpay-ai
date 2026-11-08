import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ReconPay AI — Invoice verification and reconciliation",
    template: "%s · ReconPay AI",
  },
  description:
    "AI-assisted invoice extraction, deterministic three-way reconciliation, evidence, and controlled B2B settlement operations.",
  applicationName: "ReconPay AI",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1220",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
