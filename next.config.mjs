/** @type {import('next').NextConfig} */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/auditor";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

export default {
  // Se sirve bajo una ruta (p. ej. dazenty.com/auditor). Con NEXT_PUBLIC_BASE_PATH="" funciona en la raíz.
  basePath: BASE_PATH || undefined,
  poweredByHeader: false,
  outputFileTracingRoot: import.meta.dirname,
  async headers() { return [{ source: "/(.*)", headers: securityHeaders }]; },
  async redirects() {
    return BASE_PATH ? [{ source: "/", destination: BASE_PATH, basePath: false, permanent: false }] : [];
  },
};
