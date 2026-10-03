const { pesoPorUnidadeEmKg } = require('./pesoProduto');

const arredondar = (valor, casas = 6) => {
  const fator = 10 ** casas;
  return Math.round((Number(valor || 0) + Number.EPSILON) * fator) / fator;
};

const produtoControlaPeso = (produto = {}) => Number(produto.pesoPorUnidade || 0) > 0 && produto.unidadeVenda === 'kg';

const estoquePesoAtualKg = (produto = {}) => {
  if (!produtoControlaPeso(produto)) return 0;
  const pesoAusente = produto.estoquePesoKg == null || (typeof produto.$isDefault === 'function' && produto.$isDefault('estoquePesoKg'));
  const gramasLegadas = !produto.estoquePesoNormalizado && Number(produto.estoque || 0) > 1000 && Number(produto.estoquePesoKg || 0) === 0;
  if (!pesoAusente && !gramasLegadas) return Number(produto.estoquePesoKg);
  if (Number(produto.estoque || 0) > 1000) return Number(produto.estoque) / 1000;
  return Number(produto.estoque || 0) * pesoPorUnidadeEmKg(produto);
};

const estoquePecasAtual = (produto = {}) => {
  const pesoExplicito = produto.estoquePesoKg != null && !(typeof produto.$isDefault === 'function' && produto.$isDefault('estoquePesoKg'));
  const gramasLegadas = !produto.estoquePesoNormalizado && Number(produto.estoque || 0) > 1000 && Number(produto.estoquePesoKg || 0) === 0;
  if (!produtoControlaPeso(produto) || Number(produto.estoque || 0) <= 1000 || (pesoExplicito && !gramasLegadas)) return Number(produto.estoque || 0);
  const peso = pesoPorUnidadeEmKg(produto);
  return peso > 0 ? arredondar(estoquePesoAtualKg(produto) / peso) : 0;
};

const normalizarEstoqueLegado = (produto) => {
  if (!produtoControlaPeso(produto)) return produto;
  const peso = estoquePesoAtualKg(produto);
  const pecas = estoquePecasAtual(produto);
  produto.estoque = pecas;
  produto.estoquePesoKg = arredondar(peso);
  produto.estoquePesoNormalizado = true;
  return produto;
};

const dadosEstoqueProduto = (produto = {}) => {
  const pesoPorUnidade = pesoPorUnidadeEmKg(produto);
  const estoquePesoKg = estoquePesoAtualKg(produto);
  const estoque = estoquePecasAtual(produto);
  return {
    estoque,
    estoquePesoKg: arredondar(estoquePesoKg),
    estoquePesoTotal: arredondar(estoquePesoKg),
    estoquePesoTotalExibicao: estoquePesoKg,
    pesoPorUnidadeKg: pesoPorUnidade,
  };
};

const dadosMovimentoEstoque = (produto, item = {}) => {
  const quantidade = Number(item.quantidade || 0);
  const porPeso = produtoControlaPeso(produto) && (item.tipoVenda === 'peso' || Number(item.pesoVendidoKg || 0) > 0);
  if (porPeso) return { pecas: 0, pesoKg: Number(item.pesoVendidoKg || item.quantidade || 0), tipoVenda: 'peso' };
  if (produtoControlaPeso(produto) && item.tipoVenda === undefined && quantidade >= 100) {
    const pesoKg = quantidade / 1000;
    return { pecas: 0, pesoKg, tipoVenda: 'peso' };
  }
  if (produtoControlaPeso(produto)) return { pecas: quantidade, pesoKg: quantidade * pesoPorUnidadeEmKg(produto), tipoVenda: 'inteiro' };
  return { pecas: quantidade, pesoKg: 0, tipoVenda: 'unidade' };
};

module.exports = { arredondar, produtoControlaPeso, estoquePesoAtualKg, estoquePecasAtual, normalizarEstoqueLegado, dadosEstoqueProduto, dadosMovimentoEstoque };