/**
 * Branding white-label (P1).
 * Sobrescreva via variáveis de ambiente no build (Vite):
 *   VITE_APP_NAME, VITE_APP_SHORT_NAME, VITE_APP_TAGLINE,
 *   VITE_APP_LOGO_URL, VITE_APP_THEME_COLOR, VITE_APP_BG_COLOR
 *
 * index.html e public/manifest.json usam os defaults estáticos (PDV).
 * Para rebrand completo de PWA/aba, alinhe esses arquivos ou injete no CI.
 */
const env = (key, fallback) => {
  const value = import.meta.env[key];
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim();
};

export const branding = {
  name: env('VITE_APP_NAME', 'PDV'),
  shortName: env('VITE_APP_SHORT_NAME', 'PDV'),
  tagline: env('VITE_APP_TAGLINE', 'Sistema de atendimento'),
  logoUrl: env('VITE_APP_LOGO_URL', '/logo.svg'),
  themeColor: env('VITE_APP_THEME_COLOR', '#a0522d'),
  backgroundColor: env('VITE_APP_BG_COLOR', '#f7f3ec'),
};

export default branding;
