import "./header.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { BASE, SITE } from "@/lib/base";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space", display: "swap", weight: ["500", "600"] });

const TITLE = "Auditor web gratis · Dazenty";
const DESC = "Audita tu web gratis: cómo la ven Google, LinkedIn, WhatsApp y X, qué velocidad tienen sus visitantes reales en móvil, tablet y ordenador, y qué corregir primero.";
const URL_PAGE = `${SITE}${BASE}`;
const OG_IMAGE = `${SITE}/img/og-dazenty.jpg`; // misma imagen social que dazenty.com (1200×630)

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESC,
  alternates: { canonical: URL_PAGE },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website", url: URL_PAGE, siteName: "Dazenty", locale: "es_ES", title: TITLE, description: DESC,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Dazenty · Auditor web gratis" }],
  },
  twitter: { card: "summary_large_image", site: "@DAzenty", title: TITLE, description: DESC, images: [OG_IMAGE] },
};

export const viewport: Viewport = { themeColor: "#d97762", colorScheme: "dark" };

// Datos estructurados para Google (https://schema.org/WebApplication)
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE}/#org`, name: "Dazenty", url: SITE, logo: `${SITE}/img/logodazenty.webp`, sameAs: ["https://www.instagram.com/dazen.ty"] },
    {
      "@type": "WebApplication", "@id": `${URL_PAGE}#app`, name: "Auditor web gratis", url: URL_PAGE, inLanguage: "es",
      description: DESC, applicationCategory: "DeveloperApplication", operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" }, publisher: { "@id": `${SITE}/#org` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${space.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        {children}
      </body>
    </html>
  );
}
