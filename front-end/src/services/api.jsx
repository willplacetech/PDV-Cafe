import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://pdv-cafe-api-willplacetech.onrender.com/api',
  withCredentials: true,
  timeout: 30000,
});

const emitirEventoApi = (nome) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(nome));
};

const finalizarRequisicao = (config) => {
  if (!config?.pdvRequisicaoEmAndamento) return;
  config.pdvRequisicaoEmAndamento = false;
  emitirEventoApi('pdv:request-end');
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pdv_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.pdvRequisicaoEmAndamento = true;
  emitirEventoApi('pdv:request-start');
  return config;
});

api.interceptors.response.use(
  (res) => { finalizarRequisicao(res.config); return res; },
  (err) => {
    finalizarRequisicao(err.config);
    console.error('[API]', {
      method: err.config?.method?.toUpperCase(),
      path: err.config?.url?.split('?')[0],
      status: err.response?.status,
      code: err.code,
      message: err.message,
    });
    if (err.response?.status === 401) {
      localStorage.removeItem('pdv_token');
      localStorage.removeItem('pdv_user');
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    if (err.response?.status >= 500) {
      const msg = 'O servidor encontrou um problema. Aguarde um instante e tente novamente.';
      const data = err.response.data;
      err.response.data = { ...(data && typeof data === 'object' ? data : {}), msg };
      err.message = msg;
    } else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      err.message = 'O servidor demorou para responder. Aguarde e tente novamente.';
      err.response = { status: 408, data: { msg: err.message } };
    } else if (!err.response) {
      err.message = 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
      err.response = { status: 0, data: { msg: err.message } };
    }
    return Promise.reject(err);
  }
);

export default api;
