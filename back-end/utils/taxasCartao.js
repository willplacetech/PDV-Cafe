const PaymentSettings = require('../models/PaymentSettings');

const dinheiro = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const obterTaxasCartao = async () => {
  const configuracao = await PaymentSettings.findOne({ chave: 'principal' }).lean();
  return {
    cartao_credito: Number(configuracao?.cartao_credito || 0),
    cartao_debito: Number(configuracao?.cartao_debito || 0),
  };
};

const calcularPagamento = (tipo, valorRecebido, taxas) => {
  const valor = dinheiro(valorRecebido);
  const percentual = ['cartao_credito', 'cartao_debito'].includes(tipo) ? Number(taxas?.[tipo] || 0) : 0;
  const taxaValor = dinheiro(valor * percentual / 100);
  return { taxaPercentual: percentual, taxaValor, valorLiquido: dinheiro(valor - taxaValor) };
};

module.exports = { obterTaxasCartao, calcularPagamento, dinheiro };
