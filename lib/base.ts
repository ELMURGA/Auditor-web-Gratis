// Configuración por entorno. Los valores por defecto sirven para desarrollo local.
// NEXT_PUBLIC_BASE_PATH debe coincidir con basePath de next.config.mjs (se lee de la misma variable).
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "/auditor";
export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dazenty.com";
export const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP ?? "";
export const path = (p: string) => `${BASE}${p}`;
