import axios from 'axios';
import { readCachedProfile, setAccessSession, refreshAccessSession, logoutAccessSession, canRestoreSession } from './accessSession.js';
import { attachSessionInterceptors } from './sessionInterceptors.js';

export const chaveSessao = (courier = false) => courier ? 'delivery_entregador' : 'delivery_admin';
export const lerSessao = (courier = false) => {
  const user = readCachedProfile(courier ? 'courier' : 'delivery');
  return user ? { user } : null;
};
export const salvarSessao = (data, courier = false) => ({ user: setAccessSession(courier ? 'courier' : 'delivery', data) });
export const criarApiDelivery = (courier = false) => {
  const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'https://pdv-cafe-back.onrender.com/api', timeout: 15000, withCredentials: true });
  attachSessionInterceptors(api, courier ? 'courier' : 'delivery');
  return api;
};
export const deliveryApi = criarApiDelivery();
export const courierApi = criarApiDelivery(true);
export const restaurarSessao = async (courier = false) => {
  const scope = courier ? 'courier' : 'delivery';
  if (navigator.onLine === false || !canRestoreSession(scope)) return lerSessao(courier);
  const result = await refreshAccessSession(scope, (courier ? courierApi : deliveryApi).defaults.baseURL);
  return result ? { user: result.user } : null;
};
export const sairSessao = (courier = false) => logoutAccessSession(courier ? 'courier' : 'delivery', (courier ? courierApi : deliveryApi).defaults.baseURL);
export const erroDelivery = error => error.response?.data?.msg || 'Não foi possível conectar. Verifique sua conexão e tente novamente.';
