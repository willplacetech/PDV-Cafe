const dinheiro = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calcularDreResumo = ({
  receitaBruta = 0,
  deducoes = 0,
  cmv = 0,
  despesasOperacionais = 0,
  depreciacaoAmortizacao = 0,
  despesasFinanceiras = 0,
  impostos = 0,
} = {}) => {
  const receitaLiquida = dinheiro(receitaBruta - deducoes);
  const lucroBruto = dinheiro(receitaLiquida - cmv);
  const ebit = dinheiro(lucroBruto - despesasOperacionais);
  const ebitda = dinheiro(ebit + depreciacaoAmortizacao);
  const lucroLiquido = dinheiro(ebit - despesasFinanceiras - impostos);

  return {
    receitaBruta: dinheiro(receitaBruta),
    deducoes: dinheiro(deducoes),
    receitaLiquida,
    cmv: dinheiro(cmv),
    lucroBruto,
    despesasOperacionais: dinheiro(despesasOperacionais),
    ebit,
    depreciacaoAmortizacao: dinheiro(depreciacaoAmortizacao),
    ebitda,
    despesasFinanceiras: dinheiro(despesasFinanceiras),
    impostosEstimados: dinheiro(impostos),
    lucroLiquido,
  };
};

module.exports = { calcularDreResumo };
