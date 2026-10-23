/**
 * Branding white-label (P4).
 *
 * Prioridade (maior → menor):
 *   1. Override local (localStorage) — cache / offline
 *   2. Branding do servidor (GET /api/configuracoes/branding)
 *   3. Defaults do build (VITE_APP_*)
 */

const STORAGE_KEY = 'pdv_branding_override';
const SERVER_KEY = 'pdv_branding_server';

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

const KEYS = ['name', 'shortName', 'tagline', 'logoUrl', 'themeColor', 'backgroundColor'];

function readJson(key) {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function pickFilled(source) {
  const out = {};
  for (const key of KEYS) {
    const v = source[key];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    out[key] = String(v).trim();
  }
  return out;
}

function mergeBranding() {
  const local = pickFilled(readJson(STORAGE_KEY));
  const server = pickFilled(readJson(SERVER_KEY));
  const merged = { ...defaults, ...server, ...local };
  return {
    name: merged.name,
    shortName: merged.shortName,
    tagline: merged.tagline,
    logoUrl: merged.logoUrl,
    themeColor: merged.themeColor,
    backgroundColor: merged.backgroundColor,
  };
}

export function getBranding() {
  return mergeBranding();
}

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
  const current = readJson(STORAGE_KEY);
  const next = { ...current };
  for (const key of KEYS) {
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

/** Cache do branding vindo da API (não sobrescreve override local). */
export function setServerBranding(partial) {
  if (typeof localStorage === 'undefined') return getBranding();
  const filled = pickFilled(partial || {});
  if (Object.keys(filled).length === 0) localStorage.removeItem(SERVER_KEY);
  else localStorage.setItem(SERVER_KEY, JSON.stringify(filled));
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
  document.documentElement.style.setProperty('--color-primary', b.themeColor);
  document.documentElement.style.setProperty('--accent-primary', b.themeColor);
  document.documentElement.style.setProperty('--accent', b.themeColor);
  return b;
}

/**
 * Busca branding no servidor. Usa api opcional (axios) ou fetch com base VITE_API_URL.
 * Não exige login.
 */
export async function fetchServerBranding(apiClient) {
  try {
    let data;
    if (apiClient?.get) {
      ({ data } = await apiClient.get('/configuracoes/branding', { pdvSilenciosa: true }));
    } else {
      const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
      const res = await fetch(`${base}/configuracoes/branding`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }
    const brandingPayload = data?.branding || data || {};
    return setServerBranding(brandingPayload);
  } catch (error) {
    console.warn('[branding] Não foi possível carregar do servidor.', error?.message || error);
    return getBranding();
  }
}

export default branding;
