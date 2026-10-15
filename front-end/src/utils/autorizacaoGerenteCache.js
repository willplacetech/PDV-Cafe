const EXIGIR_LOCAL = typeof import.meta !== 'undefined' && import.meta.env?.VITE_EXIGIR_AUTORIZACAO_GERENTE !== 'false';

const autorizacaoCache = new Map();
const CACHE_MS = 4 * 60 * 1000;

export function limparCacheAutorizacao(acao) {
  if (acao) autorizacaoCache.delete(acao);
  else autorizacaoCache.clear();
}

export function getAutorizacaoCache(acao, userRole) {
  if (!EXIGIR_LOCAL) return { token: null, reaproveitado: true };
  const entry = autorizacaoCache.get(acao);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_MS) {
    autorizacaoCache.delete(acao);
    return null;
  }
  if (entry.role === 'operador' && userRole !== entry.userRole) return null;
  return entry;
}

export function setAutorizacaoCache(acao, token, role, userRole) {
  autorizacaoCache.set(acao, { token, timestamp: Date.now(), role, userRole });
}

export { EXIGIR_LOCAL };
