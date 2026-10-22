import api from './api.jsx';

export const carregarCardapio = async (mesaToken) => {
  const { data } = await api.get(`/pedidos/auto-atendimento/${encodeURIComponent(mesaToken)}`);
  return data;
};

export const enviarPedidoAutoAtendimento = async (payload, idempotencyKey) => {
  const { data } = await api.post('/pedidos/auto-atendimento', payload, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data;
};
