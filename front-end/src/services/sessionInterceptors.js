import { getAccessToken, getSessionGeneration, refreshAccessSession, canRestoreSession } from './accessSession.js';
const sessionEndpoint = url => /\/(?:auth|delivery|entregador)\/(?:login|refresh|logout)(?:\?|$)/.test(url || '');
export const attachSessionInterceptors = (api, scope = 'pdv') => {
  api.interceptors.request.use(async config => {
    if (!sessionEndpoint(config.url) && !getAccessToken(scope) && canRestoreSession(scope) && (typeof navigator === 'undefined' || navigator.onLine !== false)) await refreshAccessSession(scope, api.defaults.baseURL);
    config.sessionGeneration = getSessionGeneration(scope);
    const token = getAccessToken(scope);
    if (token && !sessionEndpoint(config.url)) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  api.interceptors.response.use(response => response, async error => {
    const config = error.config;
    if (error.response?.status !== 401 || !config || config.sessionRetried || sessionEndpoint(config.url)) return Promise.reject(error);
    if (config.sessionGeneration !== getSessionGeneration(scope)) return Promise.reject(error);
    config.sessionRetried = true;
    try {
      await refreshAccessSession(scope, api.defaults.baseURL);
      const token = getAccessToken(scope);
      if (!token) return Promise.reject(error);
      config.headers.Authorization = `Bearer ${token}`;
      return api(config);
    } catch { return Promise.reject(error); }
  });
};
