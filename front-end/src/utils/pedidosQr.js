export const agruparItensQr = (comanda) => {
  const itens = Array.isArray(comanda?.itens) ? comanda.itens : [];
  const pedidos = Array.isArray(comanda?.pedidosQr) ? comanda.pedidosQr : [];
  const grupos = pedidos.map((pedido) => ({
    id: String(pedido._id),
    pedido,
    itens: itens.filter((item) => String(item.pedidoQrId || '') === String(pedido._id)),
  })).filter((grupo) => grupo.itens.length > 0);
  const idsPedidos = new Set(pedidos.map((pedido) => String(pedido._id)));
  const itensSemPedido = itens.filter((item) => !idsPedidos.has(String(item.pedidoQrId || '')));

  if (itensSemPedido.length > 0) grupos.push({ id: 'sem-pedido-qr', pedido: null, itens: itensSemPedido });
  return grupos.length > 0 ? grupos : [{ id: 'itens', pedido: null, itens }];
};

export const formatarHorarioPedidoQr = (valor) => {
  if (!valor) return '';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const identificacaoQrComanda = (comanda) => {
  const numeroPedidos = Array.isArray(comanda?.pedidosQr) ? comanda.pedidosQr.length : 0;
  if (numeroPedidos > 1) return `QR — Mesa ${comanda.mesa || 'não informada'} · ${numeroPedidos} pedidos`;
  return `QR — ${comanda.clienteNome || 'Cliente'} (Mesa ${comanda.mesa || 'não informada'})`;
};
