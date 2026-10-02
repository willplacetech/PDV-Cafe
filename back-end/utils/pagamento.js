const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'credito_loja'];
const FORMAS_PAGAMENTO_CARTAO = ['cartao_credito', 'cartao_debito'];
const ROTULOS_PAGAMENTO = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  credito_loja: 'Crédito na Loja',
};

const dinheiro = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const formaPagamentoValida = (valor) => FORMAS_PAGAMENTO.includes(String(valor || ''));
const normalizarFormaPagamento = (valor) => (formaPagamentoValida(valor) ? String(valor) : null);
const rotuloPagamento = (tipo) => ROTULOS_PAGAMENTO[String(tipo || '')] || String(tipo || '');
const ehCartao = (tipo) => FORMAS_PAGAMENTO_CARTAO.includes(String(tipo || ''));
const ehCreditoLoja = (tipo) => String(tipo || '') === 'credito_loja';

const taxaDePagamento = (pagamento) => {
  const taxaValor = Number(pagamento?.taxaValor || 0);
  return { taxa: dinheiro(taxaValor), liquido: dinheiro(Number(pagamento?.valorRecebido || 0) - taxaValor) };
};

const normalizarPagamento = (pagamento) => {
  if (!pagamento) return null;
  // Pagamentos legados podem não ter formaPagamento; assume dinheiro em vez
  // de descartar dinheiro já recebido.
  const tipoInformado = normalizarFormaPagamento(pagamento?.tipo || pagamento?.formaPagamento) || 'dinheiro';
  const valorRecebido = dinheiro(pagamento?.valorRecebido ?? pagamento?.valor ?? 0);
  const { taxa, liquido } = taxaDePagamento({ ...pagamento, valorRecebido });
  return {
    tipo: tipoInformado,
    valorRecebido,
    taxaPercentual: Number(pagamento?.taxaPercentual || 0),
    taxaValor: taxa,
    valorLiquido: liquido,
    dataPagamento: pagamento?.dataPagamento || pagamento?.data || null,
    observacao: pagamento?.observacao || '',
    usuario: pagamento?.usuario || '',
  };
};

const normalizarPagamentos = (pagamentos) => (Array.isArray(pagamentos) ? pagamentos : []).map(normalizarPagamento).filter(Boolean);

const totalPago = (pagamentos) => dinheiro(normalizarPagamentos(pagamentos).reduce((soma, pagamento) => soma + pagamento.valorRecebido, 0));
const saldoDevedor = (valorTotal, pagamentos) => dinheiro(Math.max(0, Number(valorTotal || 0) - totalPago(pagamentos)));

const statusPagamentoDe = (valorTotal, pagamentos) => {
  const total = dinheiro(valorTotal);
  const pago = totalPago(pagamentos);
  if (total <= 0) return 'quitado';
  if (pago <= 0) return 'pendente';
  if (pago >= total) return 'quitado';
  return 'parcial';
};

const calcularStatusPagamento = (comanda) => {
  const valorTotal = dinheiro(comanda?.valorTotal ?? comanda?.total ?? 0);
  const valorPago = totalPago(comanda?.historicoPagamentos || comanda?.pagamentos);
  return { valorTotal, valorPago, saldoDevedor: dinheiro(Math.max(0, valorTotal - valorPago)), statusPagamento: statusPagamentoDe(valorTotal, comanda?.historicoPagamentos || comanda?.pagamentos) };
};

const construirPagamento = ({ valor, formaPagamento, taxas, observacao, usuario }) => {
  const tipo = normalizarFormaPagamento(formaPagamento);
  if (!tipo) throw new Error('Forma de pagamento inválida');
  const valorRecebido = dinheiro(valor);
  if (!Number.isFinite(valorRecebido) || valorRecebido <= 0) throw new Error('Informe um valor válido para receber');
  const percentual = ehCartao(tipo) ? Number(taxas?.[tipo] || 0) : 0;
  const taxaValor = dinheiro(valorRecebido * percentual / 100);
  return {
    valor: valorRecebido,
    formaPagamento: tipo,
    taxaPercentual: percentual,
    taxaValor,
    valorLiquido: dinheiro(valorRecebido - taxaValor),
    data: new Date(),
    observacao: observacao || '',
    usuario: usuario || 'sistema',
  };
};

const valorRecebidoReal = (pagamento) => (ehCreditoLoja(pagamento?.tipo) ? 0 : Number(pagamento?.valorRecebido || 0));
const recebidoTotal = (pagamentos) => dinheiro(normalizarPagamentos(pagamentos).reduce((soma, pagamento) => soma + valorRecebidoReal(pagamento), 0));
const temPagamentoReal = (pagamentos) => normalizarPagamentos(pagamentos).some((pagamento) => !ehCreditoLoja(pagamento.tipo) && pagamento.valorRecebido > 0);
const temCreditoLoja = (pagamentos) => normalizarPagamentos(pagamentos).some((pagamento) => ehCreditoLoja(pagamento.tipo));

const emAReceber = (total, pagamentos) => {
  const valorTotal = dinheiro(total);
  if (valorTotal <= 0) return 0;
  const lista = normalizarPagamentos(pagamentos);
  if (temCreditoLoja(lista) && !temPagamentoReal(lista)) return 0;
  return dinheiro(Math.max(0, valorTotal - recebidoTotal(lista)));
};

/**
 * Fonte única de verdade do dinheiro recebido.
 * Pedidos originados de uma comanda têm o pagamento registrado em
 * Comanda.historicoPagamentos; os demais usam Order.pagamentos.
 * Isso impede contagem dupla entre comanda e pedido.
 */
const pagamentosDoPedido = (pedido, comanda) => {
  if (!pedido) return [];
  const comandaVinculada = comanda || (pedido.comandaId ? { historicoPagamentos: pedido.historicoPagamentosComanda } : null);
  if (pedido.comandaId && Array.isArray(comandaVinculada?.historicoPagamentos)) return comandaVinculada.historicoPagamentos;
  return normalizarPagamentos(pedido.pagamentos);
};

const indexarComandasPorId = (comandas) => new Map((comandas || []).map((comanda) => [String(comanda._id), comanda]));

const pagamentosResolvidos = (pedido, comandasPorId) => pagamentosDoPedido(pedido, pedido?.comandaId ? comandasPorId?.get(String(pedido.comandaId)) : null);

/**
 * Carrega todos os pagamentos de um período, sem contar duas vezes.
 * Pedidos com comanda vinculada usam Comanda.historicoPagamentos;
 * comandas abertas com parcial entram mesmo sem pedido.
 * Retorna lista normalizada: [{ tipo, valorRecebido, taxaValor, valorLiquido, dataPagamento, comandaId, pedidoId }]
 */
const carregarPagamentosDoPeriodo = async ({ inicio, fim }) => {
  const Order = require('../models/Order');
  const Comanda = require('../models/Comanda');
  const janela = { $gte: inicio, $lt: fim };
  const dentroDoPeriodo = (data) => data && new Date(data) >= inicio && new Date(data) < fim;

  const [pedidos, comandas] = await Promise.all([
    Order.find({ 'pagamentos.dataPagamento': janela }).select('comandaId pagamentos').lean(),
    Comanda.find({ status: { $ne: 'cancelada' }, 'historicoPagamentos.data': janela }).select('historicoPagamentos').lean(),
  ]);
  const comandasPorId = indexarComandasPorId(comandas);
  const pagamentos = [];
  const comandasConsumidas = new Set();

  pedidos.forEach((pedido) => {
    const comanda = pedido.comandaId ? comandasPorId.get(String(pedido.comandaId)) : null;
    if (comanda) comandasConsumidas.add(String(pedido.comandaId));
    normalizarPagamentos(comanda ? comanda.historicoPagamentos : pedido.pagamentos)
      .filter((pagamento) => dentroDoPeriodo(pagamento.dataPagamento))
      .forEach((pagamento) => pagamentos.push({ ...pagamento, comandaId: comanda?._id || null, pedidoId: pedido._id }));
  });

  comandas.forEach((comanda) => {
    if (comandasConsumidas.has(String(comanda._id))) return;
    normalizarPagamentos(comanda.historicoPagamentos)
      .filter((pagamento) => dentroDoPeriodo(pagamento.dataPagamento))
      .forEach((pagamento) => pagamentos.push({ ...pagamento, comandaId: comanda._id, pedidoId: null }));
  });

  return pagamentos.sort((a, b) => new Date(a.dataPagamento) - new Date(b.dataPagamento));
};

const somarPorForma = (pagamentos, tipos) => dinheiro(normalizarPagamentos(pagamentos)
  .filter((pagamento) => tipos.includes(pagamento.tipo))
  .reduce((total, pagamento) => total + pagamento.valorRecebido, 0));

module.exports = {
  FORMAS_PAGAMENTO,
  FORMAS_PAGAMENTO_CARTAO,
  ROTULOS_PAGAMENTO,
  dinheiro,
  formaPagamentoValida,
  normalizarFormaPagamento,
  rotuloPagamento,
  ehCartao,
  ehCreditoLoja,
  taxaDePagamento,
  normalizarPagamento,
  normalizarPagamentos,
  totalPago,
  saldoDevedor,
  statusPagamentoDe,
  calcularStatusPagamento,
  construirPagamento,
  valorRecebidoReal,
  recebidoTotal,
  temPagamentoReal,
  temCreditoLoja,
  emAReceber,
  pagamentosDoPedido,
  pagamentosResolvidos,
  indexarComandasPorId,
  carregarPagamentosDoPeriodo,
  somarPorForma,
};
