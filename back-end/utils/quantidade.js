const quantidadeNaUnidadeBase = (item = {}) => {
  const quantidade = Number(item.quantidade || 0);
  const pesoPorUnidade = Number(item.pesoPorUnidade || 0);
  if (pesoPorUnidade > 0 && item.unidadeVenda === 'kg') {
    if (item.tipoVenda === 'peso' || Number(item.pesoVendidoKg || 0) > 0) return Number(item.pesoVendidoKg || 0);
    return quantidade * pesoPorUnidade;
  }
  return quantidade;
};

module.exports = { quantidadeNaUnidadeBase };