import type { MetadataRoute } from "next";
import { BASE } from "@/lib/base";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Auditor web gratis · Dazenty",
    short_name: "Auditor Dazenty",
    description: "Audita tu web gratis: SEO, velocidad con datos reales y seguridad.",
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: "standalone",
    background_color: "#050505",
    theme_color: "#d97762",
    icons: [
      { src: `${BASE}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${BASE}/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
  };
}
