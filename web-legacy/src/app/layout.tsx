import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Komenský – Matematika pro 3. třídu",
  description: "Mluvený kurz matematiky pro 3. třídu, který si pamatuje, kde jsi skončila.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
