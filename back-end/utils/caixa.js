const FechamentoCaixa = require('../models/FechamentoCaixa');
const { carregarPagamentosDoPeriodo, normalizarPagamentos, somarPorForma } = require('./pagamento');

const DENOMINACOES_CEDULAS = [100, 50, 20, 10, 5, 2, 1];
const DENOMINACOES_MOEDAS = [1, 0.5, 0.25, 0.1, 0.05];
const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const dataCaixa = (value) => {
  if (value instanceof Date) return value;
  const texto = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T00:00:00-03:00`) : new Date();
};

const faixaDoDia = (value) => {
  const inicio = dataCaixa(value);
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicio, fim };
};

const somarPagamentos = (pagamentos, tipos) => somarPorForma(pagamentos, tipos);

const calcularOutrosMeios = (pagamentos) => {
  const normalizados = normalizarPagamentos(pagamentos);
  const pix = somarPagamentos(pagamentos, ['pix']);
  const credito = somarPagamentos(pagamentos, ['cartao_credito']);
  const debito = somarPagamentos(pagamentos, ['cartao_debito']);
  const creditoLoja = somarPagamentos(pagamentos, ['credito_loja']);
  const taxaCredito = money(normalizados.filter((pagamento) => pagamento.tipo === 'cartao_credito').reduce((total, pagamento) => total + pagamento.taxaValor, 0));
  const taxaDebito = money(normalizados.filter((pagamento) => pagamento.tipo === 'cartao_debito').reduce((total, pagamento) => total + pagamento.taxaValor, 0));
  return {
    pix,
    credito,
    taxaCredito,
    liquidoCredito: money(credito - taxaCredito),
    debito,
    taxaDebito,
    liquidoDebito: money(debito - taxaDebito),
    creditoLoja,
    total: money(pix + credito + debito),
    totalLiquido: money(pix + credito - taxaCredito + debito - taxaDebito),
  };
};

const calcularContagem = (cedulas = [], moedas = []) => {
  const totalCedulas = money(cedulas.reduce((total, item) => total + Number(item.valor || 0) * Number(item.quantidade || 0), 0));
  const totalMoedas = money(moedas.reduce((total, item) => total + Number(item.valor || 0) * Number(item.quantidade || 0), 0));
  return { totalCedulas, totalMoedas, totalDinheiro: money(totalCedulas + totalMoedas) };
};

const normalizarValorContado = (valor) => {
  if (valor === undefined || valor === null || String(valor).trim() === '') throw new Error('Informe o valor contado');
  const total = Number(valor);
  if (!Number.isFinite(total) || total < 0) throw new Error('Informe um valor contado válido');
  return money(total);
};

const calcularConferencia = (totalDinheiro, saldoEsperado) => {
  const diferenca = money(Number(totalDinheiro || 0) - Number(saldoEsperado || 0));
  return {
    diferenca,
    situacao: diferenca === 0 ? 'conferido' : (diferenca > 0 ? 'sobrando' : 'faltante'),
  };
};

const buscarBaseSistema = async (data, turno) => {
  const { inicio, fim } = faixaDoDia(data);
  const fechamentoAnterior = await FechamentoCaixa.findOne({ data: { $lt: inicio }, turno, status: 'fechado' }).sort({ data: -1, createdAt: -1 }).lean();
  const pagamentos = await carregarPagamentosDoPeriodo({ inicio, fim });
  const entradasDinheiro = somarPagamentos(pagamentos, ['dinheiro']);
  const outrosMeios = calcularOutrosMeios(pagamentos);
  const saldoAnterior = money(fechamentoAnterior?.sistema?.saldoEsperado || 0);
  return {
    saldoAnterior,
    entradasDinheiro,
    saldoEsperado: saldoAnterior + entradasDinheiro,
    outrosMeios,
    fechamentoAnteriorId: fechamentoAnterior?._id || null,
  };
};

const aplicarMovimentos = (sistema) => {
  const sangrias = (sistema.sangrias || []).reduce((total, item) => total + Number(item.valor || 0), 0);
  const suplementacoes = (sistema.suplementacoes || []).reduce((total, item) => total + Number(item.valor || 0), 0);
  return {
    ...sistema,
    saldoAnterior: money(sistema.saldoAnterior),
    entradasDinheiro: money(sistema.entradasDinheiro),
    saldoEsperado: money(Number(sistema.saldoAnterior || 0) + Number(sistema.entradasDinheiro || 0) - sangrias + suplementacoes),
  };
};

const prepararSistema = (base, fechamento) => aplicarMovimentos({
  ...base,
  sangrias: fechamento?.sistema?.sangrias || [],
  suplementacoes: fechamento?.sistema?.suplementacoes || [],
});

module.exports = {
  DENOMINACOES_CEDULAS,
  DENOMINACOES_MOEDAS,
  money,
  dataCaixa,
  faixaDoDia,
  calcularContagem,
  calcularOutrosMeios,
  normalizarValorContado,
  calcularConferencia,
  buscarBaseSistema,
  prepararSistema,
};
