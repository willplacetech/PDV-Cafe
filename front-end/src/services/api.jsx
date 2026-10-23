import axios from 'axios';
import { attachSessionInterceptors } from './sessionInterceptors.js';
import { attachRequestTracker } from './requestTracker.js';
import { solicitarAutorizacao, limparCacheAutorizacao } from './managerApproval.js';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'https://restaurante-pdv-back.onrender.com/api', withCredentials: true, timeout: 30000 });
attachRequestTracker(api);
attachSessionInterceptors(api);
api.interceptors.response.use(undefined, err => {
  const acao = err.response?.data?.acao;
  if (err.response?.status === 403 && acao && !err.config?._gerenteRetry) {
    if (err.config.headers?.['X-Autorizacao-Gerente']) limparCacheAutorizacao(acao);
    return solicitarAutorizacao(acao).then(token => {
      const headers = { ...(err.config.headers || {}) };
      if (token) headers['X-Autorizacao-Gerente'] = token;
      else delete headers['X-Autorizacao-Gerente'];
      return api.request({ ...err.config, _gerenteRetry: true, headers });
    });
  }
  console.error('[API]', { method: err.config?.method?.toUpperCase(), path: err.config?.url?.split('?')[0], status: err.response?.status, code: err.code, message: err.message });
  if (err.response?.status >= 500) { const msg = 'O servidor encontrou um problema. Aguarde um instante e tente novamente.'; err.response.data = { ...(err.response.data && typeof err.response.data === 'object' ? err.response.data : {}), msg }; err.message = msg; }
  else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') { err.message = 'O servidor demorou para responder. Aguarde e tente novamente.'; err.response = { status: 408, data: { msg: err.message } }; }
  else if (!err.response) { err.message = 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'; err.response = { status: 0, data: { msg: err.message } }; }
  err.autorizacaoNecessaria = err.response?.status === 403 && err.response?.data?.msg === 'Autorização do gerente necessária';
  return Promise.reject(err);
});
export const setHeaderAutorizacao = (config = {}, token) => { if (token) config.headers = { ...(config.headers || {}), 'X-Autorizacao-Gerente': token }; return config; };
export default api;
