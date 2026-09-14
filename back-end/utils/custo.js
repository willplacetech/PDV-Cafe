const converterCustoBase = (precoCompra, unidadeCompra, unidadeReferencia = 'g') => {
  if (!Number.isFinite(Number(precoCompra)) || Number(precoCompra) <= 0) return 0;
  const ratios = { kg: 1000, g: 1, l: 1000, ml: 1, un: 1, dz: 12 };
  const base = ratios[unidadeCompra] || 1;
  const target = unidadeReferencia === 'g' || unidadeReferencia === 'ml' ? 1 : unidadeReferencia === 'un' ? 1 : 1;
  const preco = Number(precoCompra) / base;
  return Number((preco / target).toFixed(12));
};

const quantidadeNaBase = (quantidade, unidade) => {
  const fatores = { kg: 1000, g: 1, l: 1000, ml: 1, un: 1, dz: 12 };
  return Number(quantidade || 0) * (fatores[unidade] || 1);
};

const arredondar = (valor) => Number(Number(valor || 0).toFixed(6));

const calcularCustoReceita = (ingredientes, custoEmbalagem = 0, custoIndireto = 0, maoDeObra = 0, rendimento = 1) => {
  const custoInsumosTotal = arredondar(ingredientes.reduce((soma, item) => soma + quantidadeNaBase(item.quantidade, item.unidade) * Number(item.custoUnitarioBase || 0), 0));
  const custoTotal = arredondar(custoInsumosTotal + Number(custoEmbalagem || 0) + Number(custoIndireto || 0) + Number(maoDeObra || 0));
  const custoUnitario = arredondar(Number(rendimento) > 0 ? custoTotal / Number(rendimento) : 0);
  return { custoInsumosTotal, custoTotal, custoUnitario };
};

const calcularVariacaoPercentual = (valorAntigo, valorNovo) => {
  if (!Number.isFinite(Number(valorAntigo)) || Number(valorAntigo) === 0) return 0;
  return Number((((Number(valorNovo) - Number(valorAntigo)) / Number(valorAntigo)) * 100).toFixed(2));
};

const calcularMargem = (custo, venda) => {
  if (!Number.isFinite(Number(custo)) || !Number.isFinite(Number(venda)) || Number(venda) <= 0) return 0;
  const percentual = ((Number(venda) - Number(custo)) / Number(venda)) * 100;
  return Number(percentual.toFixed(2));
};

module.exports = { converterCustoBase, quantidadeNaBase, arredondar, calcularCustoReceita, calcularVariacaoPercentual, calcularMargem };
