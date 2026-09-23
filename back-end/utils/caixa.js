const Order = require('../models/Order');
const FechamentoCaixa = require('../models/FechamentoCaixa');

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

const somarPagamentos = (orders, tipos) => money(orders.reduce((total, order) => total + (order.pagamentos || [])
  .filter((pagamento) => tipos.includes(pagamento.tipo))
  .reduce((subtotal, pagamento) => subtotal + Number(pagamento.valorRecebido || 0), 0), 0));

const calcularContagem = (cedulas = [], moedas = []) => {
  const totalCedulas = money(cedulas.reduce((total, item) => total + Number(item.valor || 0) * Number(item.quantidade || 0), 0));
  const totalMoedas = money(moedas.reduce((total, item) => total + Number(item.valor || 0) * Number(item.quantidade || 0), 0));
  return { totalCedulas, totalMoedas, totalDinheiro: money(totalCedulas + totalMoedas) };
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
  const pedidos = await Order.find({ 'pagamentos.dataPagamento': { $gte: inicio, $lt: fim } }).select('pagamentos').lean();
  const entradasDinheiro = somarPagamentos(pedidos, ['dinheiro']);
  const pix = somarPagamentos(pedidos, ['pix']);
  const credito = somarPagamentos(pedidos, ['cartao_credito', 'credito_loja']);
  const debito = somarPagamentos(pedidos, ['cartao_debito']);
  const saldoAnterior = money(fechamentoAnterior?.sistema?.saldoEsperado || 0);
  return {
    saldoAnterior,
    entradasDinheiro,
    saldoEsperado: saldoAnterior + entradasDinheiro,
    outrosMeios: { pix, credito, debito, total: money(pix + credito + debito) },
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
  calcularConferencia,
  buscarBaseSistema,
  prepararSistema,
};
