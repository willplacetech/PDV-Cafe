import axios from 'axios';

export const chaveSessao = (courier = false) => courier ? 'delivery_entregador' : 'delivery_admin';
export const lerSessao = (courier = false) => {
  try { return JSON.parse(localStorage.getItem(chaveSessao(courier)) || 'null'); }
  catch { return null; }
};
export const criarApiDelivery = (courier = false) => {
  const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'https://pdv-cafe-back.onrender.com/api', timeout: 15000 });
  api.interceptors.request.use(config => {
    const token = lerSessao(courier)?.token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  api.interceptors.response.use(res => res, error => {
    if (error.response?.status === 401) {
      localStorage.removeItem(chaveSessao(courier));
      window.dispatchEvent(new CustomEvent('delivery:logout', { detail: chaveSessao(courier) }));
    }
    return Promise.reject(error);
  });
  return api;
};
export const deliveryApi = criarApiDelivery();
export const courierApi = criarApiDelivery(true);
export const erroDelivery = error => error.response?.data?.msg || 'Não foi possível conectar. Verifique sua conexão e tente novamente.';
