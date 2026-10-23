import api from './api.jsx';

export const criarReserva = async (payload) => {
  const { data } = await api.post('/reservas', payload);
  return data;
};

export const listarReservas = async (data) => {
  const { data: response } = await api.get('/reservas/agenda', { params: data ? { data } : {} });
  return response;
};

export const atualizarStatusReserva = async (codigo, status) => {
  const { data } = await api.patch(`/reservas/${encodeURIComponent(codigo)}/status`, { status });
  return data;
};

export const cancelarReserva = async (codigo) => {
  const { data } = await api.delete(`/reservas/${encodeURIComponent(codigo)}`);
  return data;
};

export const fazerCheckInReserva = async (codigo, mesaToken) => {
  const { data } = await api.post(`/reservas/${encodeURIComponent(codigo)}/check-in`, { mesaToken });
  return data;
};
