const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarStatusFiltro } = require('../routes/orders');
const { calcularStatusPagamentoComanda } = require('../routes/comandas');

const pagamentoRecebido = (pagamento) => {
  if (!pagamento || pagamento.tipo === 'credito_loja') return 0;
  return Number(pagamento.valorRecebido || 0);
};

const pedidoRecebidoTotal = (pedido) => (pedido.pagamentos || []).reduce((total, pagamento) => total + pagamentoRecebido(pagamento), 0);

const pedidoEmAReceber = (pedido) => {
  if (!pedido || pedido.status === 'cancelado' || pedido.status === 'pago' || pedido.utilizacaoInterna) return 0;

  const pagamentos = pedido.pagamentos || [];
  const temCreditoLoja = pagamentos.some((pagamento) => pagamento.tipo === 'credito_loja');
  const temPagamentoValido = pagamentos.some((pagamento) => pagamento.tipo !== 'credito_loja' && Number(pagamento.valorRecebido || 0) > 0);

  if (temCreditoLoja && !temPagamentoValido) return 0;

  return Math.max(0, Number(pedido.total || 0) - pedidoRecebidoTotal(pedido));
};

const pagamentoTaxa = (pagamento) => {
  const valor = Number(pagamento.valorRecebido || 0);
  const taxa = Number(pagamento.taxaValor || (valor * Number(pagamento.taxaPercentual || 0) / 100));
  return { taxa };
};

const valorLiquidoPedido = (pedido) => Math.round((Math.max(0, Number(pedido.total || 0) - (pedido.pagamentos || []).filter((pagamento) => pagamento.tipo !== 'credito_loja').reduce((total, pagamento) => total + pagamentoTaxa(pagamento).taxa, 0)) + Number.EPSILON) * 100) / 100;

test('serie historica usa valor liquido apos taxas de cartao', () => {
  assert.equal(valorLiquidoPedido({ total: 210.36, pagamentos: [{ valorRecebido: 210.36, taxaPercentual: 2 }] }), 206.15);
  assert.equal(valorLiquidoPedido({ total: 100, pagamentos: [] }), 100);
});

test('credito da loja nao entra no valor a receber', () => {
  const pedido = {
    status: 'pendente',
    total: 165.7,
    pagamentos: [{ tipo: 'credito_loja', valorRecebido: 0 }],
  };

  assert.equal(pedidoRecebidoTotal(pedido), 0);
  assert.equal(pedidoEmAReceber(pedido), 0);
});

test('pedido pago nao entra em a receber', () => {
  const pedido = {
    status: 'pago',
    total: 80,
    pagamentos: [{ tipo: 'dinheiro', valorRecebido: 80 }],
  };

  assert.equal(pedidoEmAReceber(pedido), 0);
});

test('filtro de contas a receber usa apenas pedidos abertos', () => {
  assert.deepEqual(normalizarStatusFiltro('abertas'), { $in: ['pendente', 'parcial'] });
  assert.deepEqual(normalizarStatusFiltro('pendente,parcial'), { $in: ['pendente', 'parcial'] });
  assert.deepEqual(normalizarStatusFiltro('todos'), { $in: ['pendente', 'parcial'] });
  assert.equal(normalizarStatusFiltro('pendente'), 'pendente');
});

test('pagamento parcial da comanda calcula saldo e status corretamente', () => {
  const atualizada = calcularStatusPagamentoComanda({
    status: 'aberta',
    valorTotal: 100,
    historicoPagamentos: [{ valor: 40 }],
  });

  assert.equal(atualizada.valorPago, 40);
  assert.equal(atualizada.saldoDevedor, 60);
  assert.equal(atualizada.statusPagamento, 'parcial');
});