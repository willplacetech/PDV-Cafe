export const estoqueDisponivelComanda = (produto, comanda) => {
  const estoque = produto?.aFazer ? Number(produto.cozDisponibilidade?.disponivel || 0) : Number(produto?.estoque || 0);
  const reservado = comanda?.registroOriginal?.estoqueBaixado
    ? (comanda.registroOriginal.itens || []).filter(item => String(item.produtoId) === String(produto?._id))
      .reduce((total, item) => total + Number(item.quantidade || 0), 0)
    : 0;
  return estoque + reservado;
};
