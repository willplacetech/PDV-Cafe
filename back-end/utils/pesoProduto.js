const pesoPorUnidadeEmKg = (produto = {}) => {
  const peso = Number(produto.pesoPorUnidade || 0);
  if (!Number.isFinite(peso) || peso <= 0) return 0;
  return produto.unidadePeso === 'g' ? peso / 1000 : peso;
};

const precoPorUnidade = (produto = {}) => {
  const pesoEmKg = pesoPorUnidadeEmKg(produto);
  const preco = pesoEmKg > 0 ? Number(produto.preco || 0) * pesoEmKg : Number(produto.preco || 0);
  return Math.round((preco + Number.EPSILON) * 100) / 100;
};

module.exports = { pesoPorUnidadeEmKg, precoPorUnidade };