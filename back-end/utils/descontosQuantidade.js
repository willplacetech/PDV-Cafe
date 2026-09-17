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

const calcGroupTotals = (cartItens = []) => {
  const totals = new Map();
  cartItens.forEach((item) => {
    const produto = item.produto;
    const grupo = produto?.grupoDesconto;
    if (!grupo?.nome || grupo?.ativo === false) return;
    const key = String(grupo.nome);
    const atual = totals.get(key);
    if (atual) {
      atual.quantidadeTotal += Number(item.quantidade || 0);
    } else {
      totals.set(key, { quantidadeTotal: Number(item.quantidade || 0), rule: grupo });
    }
  });
  return totals;
};

const calcularPrecoGrupo = (produto, quantidade, cartItens = [], precoBase = produto?.preco) => {
  const grupo = produto?.grupoDesconto;
  if (!grupo?.nome || grupo.ativo === false) return null;
  const quantidadeNumerica = Number(quantidade || 0);
  const totals = calcGroupTotals(cartItens);
  const entry = totals.get(String(grupo.nome));
  const totalGrupo = entry ? entry.quantidadeTotal : 0;
  const quantidadeMinima = Number(grupo.quantidadeMinima || 0);
  const grupoAtivo = quantidadeMinima > 0 && totalGrupo >= quantidadeMinima;
  const precoNormal = dinheiro(precoBase);
  const precoUnitario = grupoAtivo ? dinheiro(grupo.precoPromocional) : precoNormal;
  return {
    precoNormal,
    precoUnitario,
    economiaUnitario: Math.max(0, dinheiro(precoNormal - precoUnitario)),
    economiaTotal: Math.max(0, dinheiro((precoNormal - precoUnitario) * quantidadeNumerica)),
    grupoAtivo,
    totalGrupo,
    faltamParaGrupo: Math.max(0, quantidadeMinima - totalGrupo),
    nomeGrupo: grupo.nome,
  };
};

module.exports = { dinheiro, normalizarDescontos, calcularPrecoComDesconto, calcGroupTotals, calcularPrecoGrupo };
