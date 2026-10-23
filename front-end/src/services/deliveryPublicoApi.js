import api from './api.jsx';

export const carregarCatalogoDelivery = async () => {
  const { data } = await api.get('/publico/delivery/catalogo');
  return data;
};

export const criarPedidoDeliveryPublico = async (payload, idempotencyKey) => {
  const { data } = await api.post('/publico/delivery/pedidos', payload, { headers: { 'Idempotency-Key': idempotencyKey } });
  return data;
};
