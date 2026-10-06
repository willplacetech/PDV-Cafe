const UNIDADES_PERMITIDAS = ['kg', 'L', 'un'];

const normalizarUnidade = (unidade) => (unidade === 'l' ? 'L' : unidade);

const casasDecimaisValidas = (valor, unidade) => {
  if (!Number.isFinite(Number(valor))) return false;
  const casas = normalizarUnidade(unidade) === 'un' ? 2 : 3;
  return Number(Number(valor).toFixed(casas)) === Number(valor);
};

const validarQuantidade = (valor, unidade) => Number(valor) >= 0.001 && casasDecimaisValidas(valor, unidade);

const validarQuantidadeCompra = (qtdEmbalagens, conteudoPorEmbalagem, unidade) => {
  const quantidadeTotal = Number(qtdEmbalagens) * Number(conteudoPorEmbalagem);
  if (!Number.isFinite(quantidadeTotal) || quantidadeTotal <= 0) return false;
  if (normalizarUnidade(unidade) === 'un') return Math.abs(quantidadeTotal - Math.round(quantidadeTotal)) < 1e-9;
  return quantidadeTotal >= 0.001
    && Math.abs(quantidadeTotal - Number(quantidadeTotal.toFixed(3))) < 1e-9;
};

const formatarQuantidade = (valor, unidade) => {
  const unidadeNormalizada = normalizarUnidade(unidade) || 'un';
  const casas = unidadeNormalizada === 'un' ? 2 : 3;
  return `${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })} ${unidadeNormalizada}`;
};

module.exports = { UNIDADES_PERMITIDAS, normalizarUnidade, casasDecimaisValidas, validarQuantidade, validarQuantidadeCompra, formatarQuantidade };
