const resolverTipoProduto = (produto = {}) => {
  if (produto.tipo === 'insumo' || produto.tipo === 'venda') return produto.tipo;
  if (produto.controladoComoInsumo || produto.controlarComoInsumo) return 'insumo';
  return 'venda';
};

const categoriaPorTipo = (tipo) => (tipo === 'insumo' ? 'Insumos' : 'Outros');

module.exports = { resolverTipoProduto, categoriaPorTipo };
