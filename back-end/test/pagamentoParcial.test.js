const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dinheiro,
  formaPagamentoValida,
  normalizarFormaPagamento,
  saldoDevedor,
  statusPagamentoDe,
  totalPago,
  normalizarPagamentos,
  recebidoTotal,
  construirPagamento,
  temCreditoLoja,
  temPagamentoReal,
  emAReceber,
} = require('../utils/pagamento');
const migrarCreditosLoja = require('../utils/migrarCreditosLoja');


test('pagamento parcial mantém a comanda em aberto e registra o saldo', () => {
  const historico = [];

  const primeiro = construirPagamento({ valor: 20, formaPagamento: 'dinheiro' });
  historico.push(primeiro);

  assert.equal(historico.length, 1);
  assert.equal(saldoDevedor(100, historico), 80);
  assert.equal(totalPago(historico), 20);
  assert.equal(statusPagamentoDe(100, historico), 'parcial');
  assert.equal(temPagamentoReal(historico), true);
});


test('pagamentos parciais sucessivos zeram o saldo e quitam a comanda', () => {
  const historico = [
    construirPagamento({ valor: 30, formaPagamento: 'pix' }),
    construirPagamento({ valor: 45.5, formaPagamento: 'dinheiro' }),
  ];

  assert.equal(totalPago(historico), 75.5);
  assert.equal(saldoDevedor(75.5, historico), 0);
  assert.equal(statusPagamentoDe(75.5, historico), 'quitado');
});


test('pagamento acima do saldo é rejeitado pela regra da rota', () => {
  const historico = [construirPagamento({ valor: 30, formaPagamento: 'dinheiro' })];
  const saldoAtual = saldoDevedor(100, historico);
  const tentativa = construirPagamento({ valor: 80, formaPagamento: 'dinheiro' });

  assert.equal(saldoAtual, 70);
  assert.ok(tentativa.valor > saldoAtual, 'a rota deve recusar valor maior que o saldo em aberto');
});


test('comanda sem histórico começa totalmente em aberto', () => {
  assert.equal(saldoDevedor(150, []), 150);
  assert.equal(saldoDevedor(150, undefined), 150);
  assert.equal(totalPago([]), 0);
  assert.equal(statusPagamentoDe(150, []), 'pendente');
  assert.equal(temPagamentoReal([]), false);
});


test('crédito loja permanece a receber até entrar pagamento real', () => {
  assert.equal(formaPagamentoValida('credito_loja'), true);
  assert.equal(formaPagamentoValida('forma_nao_permitida'), false);

  const historico = [construirPagamento({ valor: 50, formaPagamento: 'credito_loja' })];
  assert.equal(temCreditoLoja(historico), true);
  assert.equal(temPagamentoReal(historico), false);
  assert.equal(totalPago(historico), 0);
  assert.equal(saldoDevedor(50, historico), 50);
  assert.equal(statusPagamentoDe(50, historico), 'pendente');
  assert.equal(emAReceber(50, historico), 50);

  historico.push(construirPagamento({ valor: 20, formaPagamento: 'dinheiro' }));
  assert.equal(totalPago(historico), 20);
  assert.equal(saldoDevedor(50, historico), 30);
  assert.equal(statusPagamentoDe(50, historico), 'parcial');
  assert.equal(emAReceber(50, historico), 30);
});

test('migração reabre crédito antigo e sincroniza o pedido vinculado', async () => {
  const comandoAntigo = {
    _id: 'comanda-1',
    pedidoId: 'pedido-1',
    valorTotal: 50,
    historicoPagamentos: [{ valor: 50, formaPagamento: 'credito_loja' }],
    valorPago: 50,
    saldoDevedor: 0,
    statusPagamento: 'quitado',
  };
  const atualizacoesComanda = [];
  const atualizacoesPedido = [];
  const Comanda = {
    find: () => ({ select: () => ({ lean: async () => [comandoAntigo] }) }),
    updateOne: async (filtro, alteracao) => { atualizacoesComanda.push({ filtro, alteracao }); return { modifiedCount: 1 }; },
  };
  const Order = {
    updateOne: async (filtro, alteracao) => { atualizacoesPedido.push({ filtro, alteracao }); return { modifiedCount: 1 }; },
  };

  const resultado = await migrarCreditosLoja({ Comanda, Order });

  assert.deepEqual(resultado, { comandasAtualizadas: 1, pedidosAtualizados: 1 });
  assert.deepEqual(atualizacoesComanda[0].alteracao.$set, { valorPago: 0, saldoDevedor: 50, statusPagamento: 'pendente' });
  assert.deepEqual(atualizacoesPedido[0].alteracao.$set, { status: 'pendente' });
});


test('forma desconhecida é recusada e nunca persistida', () => {
  assert.equal(formaPagamentoValida('forma_nao_permitida'), false);
  assert.equal(formaPagamentoValida(''), false);
  assert.equal(normalizarFormaPagamento('forma_nao_permitida'), null);
  assert.equal(normalizarFormaPagamento('CREDITO_LOJA'), null);
  assert.equal(normalizarFormaPagamento('credito_loja'), 'credito_loja');
  assert.equal(normalizarFormaPagamento('nao_definida'), null);
  const pagamentoDesconhecido = [{ valor: 40, formaPagamento: 'forma_nao_permitida' }];
  assert.deepEqual(normalizarPagamentos(pagamentoDesconhecido), []);
  assert.equal(recebidoTotal(pagamentoDesconhecido), 0);
});


test('valores são normalizados para duas casas', () => {
  const historico = [construirPagamento({ valor: '10.999', formaPagamento: 'pix' })];
  assert.equal(historico[0].valor, 11);
  assert.equal(saldoDevedor(11, historico), 0);
  assert.equal(dinheiro(10.005), 10.01);
});
