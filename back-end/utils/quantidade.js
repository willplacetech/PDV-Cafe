const quantidadeNaUnidadeBase = (item = {}) => {
  const quantidade = Number(item.quantidade || 0);
  const pesoPorUnidade = Number(item.pesoPorUnidade || 0) * (item.unidadePeso === 'g' ? 0.001 : 1);
  if (pesoPorUnidade > 0 && ['kg', 'g'].includes(item.unidadeVenda)) {
    if (item.tipoVenda === 'peso' || Number(item.pesoVendidoKg || 0) > 0) return Number(item.pesoVendidoKg || 0);
    if (item.unidadeVenda === 'kg' && quantidade >= 100) return quantidade / 1000;
    return quantidade * pesoPorUnidade;
  }
  if (item.unidadeVenda === 'g') return quantidade / 1000;
  if (item.unidadeVenda === 'ml') return quantidade / 1000;
  return quantidade;
};

module.exports = { quantidadeNaUnidadeBase };