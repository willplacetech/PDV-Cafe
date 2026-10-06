const settings = {
  pdv: { key: 'pdv_user', path: '/auth' },
  delivery: { key: 'delivery_admin', path: '/delivery' },
  courier: { key: 'delivery_entregador', path: '/entregador' },
};
const sessions = Object.fromEntries(Object.keys(settings).map(scope => [scope, { token: null, generation: 0, refresh: null, logout: null }]));
const storage = () => ({
  getItem: key => { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } },
  setItem: (key, value) => { try { globalThis.localStorage?.setItem(key, value); } catch { /* Memory session remains usable. */ } },
  removeItem: key => { try { globalThis.localStorage?.removeItem(key); } catch { /* Storage may be blocked by browser policy. */ } },
});
const notify = (scope, user) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('session:change', { detail: { scope, user } }));
};
const minimalProfile = user => user ? Object.fromEntries(Object.entries({ id: user.id || user._id || user.entregadorId, username: user.username, role: user.role, tenantId: user.tenantId }).filter(([, value]) => value != null)) : null;
export const readCachedProfile = (scope = 'pdv') => {
  storage()?.removeItem('pdv_token');
  let selected = null;
  for (const [name, config] of Object.entries(settings)) {
    try {
      const raw = JSON.parse(storage()?.getItem(config.key) || 'null');
      const user = minimalProfile(name === 'pdv' ? raw : raw?.user);
      if (user) storage()?.setItem(config.key, JSON.stringify(name === 'pdv' ? user : { user }));
      else storage()?.removeItem(config.key);
      if (name === scope) selected = user;
    } catch { storage()?.removeItem(config.key); }
  }
  return selected;
};
export const getAccessToken = (scope = 'pdv') => sessions[scope].token;
export const getSessionGeneration = (scope = 'pdv') => sessions[scope].generation;
export const setAccessSession = (scope, data) => {
  const user = minimalProfile(data.user);
  sessions[scope].generation++;
  sessions[scope].token = data.token;
  storage()?.removeItem('pdv_token');
  storage()?.removeItem(`${settings[scope].key}:logged-out`);
  storage()?.setItem(settings[scope].key, JSON.stringify(scope === 'pdv' ? user : { user }));
  notify(scope, user);
  return user;
};
export const clearAccessSession = (scope = 'pdv', expectedGeneration) => {
  if (expectedGeneration !== undefined && sessions[scope].generation !== expectedGeneration) return false;
  sessions[scope].generation++;
  sessions[scope].token = null;
  storage()?.removeItem('pdv_token');
  storage()?.removeItem(settings[scope].key);
  storage()?.setItem(`${settings[scope].key}:logged-out`, '1');
  notify(scope, null);
  return true;
};
export const canRestoreSession = (scope = 'pdv') => storage()?.getItem(`${settings[scope].key}:logged-out`) !== '1';
export const waitForLogout = async (scope = 'pdv') => {
  await sessions[scope].refresh?.catch(() => {});
  await sessions[scope].logout;
};
const withSessionLock = (scope, run) => typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(`pdv-refresh:${scope}`, run) : run();
export const runSessionLogin = async (scope, run) => {
  await waitForLogout(scope);
  return withSessionLock(scope, async () => {
    const response = await run();
    if (response?.data?.token) setAccessSession(scope, response.data);
    return response;
  });
};
export const refreshAccessSession = (scope, baseURL) => {
  const state = sessions[scope];
  if (state.refresh) return state.refresh;
  const generation = state.generation;
  const run = async () => {
    if (state.generation !== generation) return null;
    const response = await fetch(`${baseURL.replace(/\/$/, '')}${settings[scope].path}/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Protection': '1' } });
    if (!response.ok) {
      const error = new Error('Sessão inválida ou expirada');
      error.status = response.status;
      if (response.status === 401) clearAccessSession(scope, generation);
      throw error;
    }
    const data = await response.json();
    if (state.generation !== generation) return null;
    return { ...data, user: setAccessSession(scope, data) };
  };
  const operation = withSessionLock(scope, run);
  state.refresh = operation.finally(() => { if (state.refresh === pending) state.refresh = null; });
  const pending = state.refresh;
  return pending;
};
export const logoutAccessSession = (scope, baseURL) => {
  const state = sessions[scope];
  const token = state.token;
  clearAccessSession(scope);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    // Serialize a following login behind this response so its Set-Cookie cannot
    // erase the newly established refresh cookie.
    const run = () => fetch(`${baseURL.replace(/\/$/, '')}${settings[scope].path}/logout`, { method: 'POST', credentials: 'include', keepalive: true, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-CSRF-Protection': '1' } });
    state.logout = Promise.resolve(state.refresh).catch(() => {}).then(() => withSessionLock(scope, run)).catch(() => {}).finally(() => { state.logout = null; });
  } catch { state.logout = null; }
};
