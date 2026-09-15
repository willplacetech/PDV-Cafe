const test = require('node:test');
const assert = require('node:assert/strict');

const pagamentoTaxa = (pagamento) => {
  const valor = Number(pagamento.valorRecebido || 0);
  const taxa = Number(pagamento.taxaValor || (valor * Number(pagamento.taxaPercentual || 0) / 100));
  return { taxa };
};

const valorLiquidoPedido = (pedido) => Math.round((Math.max(0, Number(pedido.total || 0) - (pedido.pagamentos || []).reduce((total, pagamento) => total + pagamentoTaxa(pagamento).taxa, 0)) + Number.EPSILON) * 100) / 100;

test('serie historica usa valor liquido apos taxas de cartao', () => {
  assert.equal(valorLiquidoPedido({ total: 210.36, pagamentos: [{ valorRecebido: 210.36, taxaPercentual: 2 }] }), 206.15);
  assert.equal(valorLiquidoPedido({ total: 100, pagamentos: [] }), 100);
});