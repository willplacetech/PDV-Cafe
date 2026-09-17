const dinheiro = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizarDescontos = (descontos = []) => descontos
  .filter((faixa) => faixa && Number(faixa.quantidadeMinima) > 0 && Number(faixa.precoUnitario) >= 0 && faixa.ativo !== false)
  .map((faixa) => ({
    quantidadeMinima: Number(faixa.quantidadeMinima),
    precoUnitario: dinheiro(faixa.precoUnitario),
    ativo: faixa.ativo !== false,
  }))
  .sort((a, b) => a.quantidadeMinima - b.quantidadeMinima);

const calcularPrecoComDesconto = (produto, quantidade, precoBase = produto?.preco) => {
  const quantidadeNumerica = Number(quantidade || 0);
  const precoNormal = dinheiro(precoBase);
  const faixas = normalizarDescontos(produto?.descontosPorQuantidade)
    .filter((faixa) => faixa.quantidadeMinima <= quantidadeNumerica);
  const faixaAplicada = faixas[faixas.length - 1] || null;
  const precoUnitario = faixaAplicada ? faixaAplicada.precoUnitario : precoNormal;
  return {
    precoNormal,
    precoUnitario,
    economiaUnitario: Math.max(0, dinheiro(precoNormal - precoUnitario)),
    economiaTotal: Math.max(0, dinheiro((precoNormal - precoUnitario) * quantidadeNumerica)),
    faixaAplicada,
  };
};

module.exports = { dinheiro, normalizarDescontos, calcularPrecoComDesconto };
