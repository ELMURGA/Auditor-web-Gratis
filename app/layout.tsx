import "./globals.css";
import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space", display: "swap", weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "Auditor web gratis · Dazenty",
  description: "Audita tu web gratis: cómo la ven Google, LinkedIn, WhatsApp y X, qué velocidad tienen sus visitantes reales en móvil, tablet y ordenador, y qué corregir primero.",
  icons: { icon: "/favicon.webp", apple: "/favicon.webp" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${space.variable}`}>
      <body>{children}</body>
    </html>
  );
}
