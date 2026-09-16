const resolverTipoProduto = (produto = {}) => {
  if (produto.controladoComoInsumo || produto.controlarComoInsumo) return 'insumo';
  if (produto.tipo === 'insumo' || produto.tipo === 'venda') return produto.tipo;
  return 'venda';
};

const categoriaPorTipo = (tipo) => (tipo === 'insumo' ? 'Insumos' : 'Outros');

module.exports = { resolverTipoProduto, categoriaPorTipo };
