const PaymentSettings = require('../models/PaymentSettings');
const { formaPagamentoValida, formaPersonalizada, catalogoDaConfiguracao } = require('./formasPagamento');

const dinheiro = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const obterTaxasCartao = async () => {
  const configuracao = await PaymentSettings.findOne({ chave: 'principal' }).lean();
  const formas = catalogoDaConfiguracao(configuracao);
  return { ...Object.fromEntries(formas.map(forma => [forma.value, forma.taxaPercentual])), rotulos: Object.fromEntries(formas.map(forma => [forma.value, forma.label])) };
};

const calcularPagamento = (tipo, valorRecebido, taxas) => {
  const valor = dinheiro(valorRecebido);
  if (!formaPagamentoValida(tipo) || (formaPersonalizada(tipo) && !Object.hasOwn(taxas || {}, tipo))) throw new Error('Forma de pagamento não cadastrada');
  const percentual = tipo === 'credito_loja' ? 0 : Number(taxas?.[tipo] || 0);
  const taxaValor = dinheiro(valor * percentual / 100);
  return { taxaPercentual: percentual, taxaValor, valorLiquido: dinheiro(valor - taxaValor), ...(formaPersonalizada(tipo) ? { rotuloPagamento: taxas.rotulos?.[tipo] || tipo } : {}) };
};

module.exports = { obterTaxasCartao, calcularPagamento, dinheiro };
