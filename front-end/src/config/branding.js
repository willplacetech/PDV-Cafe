/**
 * Branding white-label (P2).
 *
 * Build-time (Vite / Render):
 *   VITE_APP_NAME, VITE_APP_SHORT_NAME, VITE_APP_TAGLINE,
 *   VITE_APP_LOGO_URL, VITE_APP_THEME_COLOR, VITE_APP_BG_COLOR
 *
 * Runtime (demo / multi-loja leve):
 *   localStorage key `pdv_branding_override` (JSON parcial)
 *   via Configurações → Aparência
 *
 * O plugin em vite.config.js injeta title/theme-color/manifest no build.
 */

const STORAGE_KEY = 'pdv_branding_override';

const env = (key, fallback) => {
  const value = import.meta.env[key];
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim();
};

const defaults = {
  name: env('VITE_APP_NAME', 'PDV'),
  shortName: env('VITE_APP_SHORT_NAME', 'PDV'),
  tagline: env('VITE_APP_TAGLINE', 'Sistema de atendimento'),
  logoUrl: env('VITE_APP_LOGO_URL', '/logo.svg'),
  themeColor: env('VITE_APP_THEME_COLOR', '#4f9d6a'),
  backgroundColor: env('VITE_APP_BG_COLOR', '#f3f6f1'),
};

function readOverride() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function mergeBranding() {
  const override = readOverride();
  const pick = (key) => {
    const v = override[key];
    if (v === undefined || v === null || String(v).trim() === '') return defaults[key];
    return String(v).trim();
  };
  return {
    name: pick('name'),
    shortName: pick('shortName'),
    tagline: pick('tagline'),
    logoUrl: pick('logoUrl'),
    themeColor: pick('themeColor'),
    backgroundColor: pick('backgroundColor'),
  };
}

/** Snapshot atual (build + override local). */
export function getBranding() {
  return mergeBranding();
}

/** Objeto reativo o suficiente para a maioria dos usos em módulo. */
export const branding = new Proxy(defaults, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined;
    return mergeBranding()[prop];
  },
});

export function saveBrandingOverride(partial) {
  if (typeof localStorage === 'undefined') {
    throw new Error('Armazenamento local indisponível.');
  }
  const current = readOverride();
  const next = { ...current };
  for (const key of ['name', 'shortName', 'tagline', 'logoUrl', 'themeColor', 'backgroundColor']) {
    if (partial[key] === undefined) continue;
    const value = String(partial[key] ?? '').trim();
    if (!value) delete next[key];
    else next[key] = value;
  }
  if (Object.keys(next).length === 0) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  applyBrandingToDocument();
  return getBranding();
}

export function clearBrandingOverride() {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  applyBrandingToDocument();
  return getBranding();
}

export function applyBrandingToDocument() {
  if (typeof document === 'undefined') return getBranding();
  const b = getBranding();
  document.title = b.name;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', b.themeColor);
  const bgMeta = document.querySelector('meta[name="background-color"]');
  if (bgMeta) bgMeta.setAttribute('content', b.backgroundColor);
  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.setAttribute('content', b.shortName);
  // Cor de ação no tema (sem exigir rebuild)
  document.documentElement.style.setProperty('--color-primary', b.themeColor);
  document.documentElement.style.setProperty('--accent-primary', b.themeColor);
  document.documentElement.style.setProperty('--accent', b.themeColor);
  return b;
}

export default branding;
