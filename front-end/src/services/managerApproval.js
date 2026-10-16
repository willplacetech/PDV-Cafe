import { getSessionGeneration } from './accessSession.js';

const cache = new Map();
if (typeof window !== 'undefined') window.addEventListener('session:change', event => {
  if (event.detail.scope === 'pdv' && !event.detail.user) cache.clear();
});
export function limparCacheAutorizacao(acao) {
  if (acao) cache.delete(acao);
  else cache.clear();
}
export function getAutorizacaoCache(acao) {
  const entry = cache.get(acao);
  if (!entry || entry.expiresAt <= Date.now() || entry.generation !== getSessionGeneration()) {
    cache.delete(acao);
    return null;
  }
  return entry;
}
export function guardarAutorizacao(acao, token) {
  const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  cache.set(acao, { token, expiresAt: claims.exp * 1000, generation: getSessionGeneration() });
}

export function solicitarAutorizacao(acao) {
  const cached = getAutorizacaoCache(acao);
  if (cached) return Promise.resolve(cached.token);
  return new Promise((resolve, reject) => {
    window.dispatchEvent(new CustomEvent('gerente:autorizar', { detail: { acao, resolve, reject } }));
  });
}
