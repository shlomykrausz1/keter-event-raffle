import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Big Keter Event – Monsey",
  description: "Enter the raffle at The Big Keter Event – Monsey.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Keter Event",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/keter-logo.png",
    apple: "/keter-logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#3E1F52",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
