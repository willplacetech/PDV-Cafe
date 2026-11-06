const PaymentSettings = require('../models/PaymentSettings');
const { ROTULOS_PAGAMENTO, formaPagamentoValida, formaPersonalizada, catalogoDaConfiguracao } = require('./formasPagamento');

const dinheiro = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const obterTaxasCartao = async () => {
  const configuracao = await PaymentSettings.findOne({ chave: 'principal' }).lean();
  const formas = catalogoDaConfiguracao(configuracao);
  return {
    ...Object.fromEntries(formas.map(forma => [forma.value, forma.taxaPercentual])),
    rotulos: Object.fromEntries(formas.map(forma => [forma.value, forma.label])),
    formasDesativadas: configuracao?.formasDesativadas || [],
  };
};

const calcularPagamento = (tipo, valorRecebido, taxas) => {
  const valor = dinheiro(valorRecebido);
  if (!formaPagamentoValida(tipo) || (formaPersonalizada(tipo) && !Object.hasOwn(taxas || {}, tipo))) throw new Error('Forma de pagamento não cadastrada');
  if (taxas?.formasDesativadas?.includes(tipo)) throw new Error('Forma de pagamento não cadastrada');
  const percentual = tipo === 'credito_loja' ? 0 : Number(taxas?.[tipo] || 0);
  const taxaValor = dinheiro(valor * percentual / 100);
  const rotulo = taxas?.rotulos?.[tipo];
  const rotuloRenomeado = rotulo && rotulo !== ROTULOS_PAGAMENTO[tipo];
  return {
    taxaPercentual: percentual,
    taxaValor,
    valorLiquido: dinheiro(valor - taxaValor),
    ...(formaPersonalizada(tipo) || rotuloRenomeado ? { rotuloPagamento: rotulo || tipo } : {}),
  };
};

module.exports = { obterTaxasCartao, calcularPagamento, dinheiro };
