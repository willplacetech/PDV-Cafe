const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const PedidoEntrega = require('../models/PedidoEntrega');

const novoTenant = (dados = {}) => new Tenant({
  nome: 'Café da Praça',
  slug: 'cafe-da-praca',
  telefone: '11999999999',
  endereco: 'Rua das Flores, 10',
  ...dados,
});

const novoPedido = (dados = {}) => new PedidoEntrega({
  tenantId: new mongoose.Types.ObjectId(),
  fonte: 'formulario',
  origem: {
    nomeCliente: 'Cliente teste',
    telefone: '11988888888',
    endereco: { rua: 'Rua das Flores', numero: '10', bairro: 'Centro' },
  },
  valorTotal: 25,
  ...dados,
});

test('Tenant normaliza slug e define configuração inicial', () => {
  const tenant = novoTenant({ slug: ' CAFE-DA-PRACA ' });
  assert.equal(tenant.validateSync(), undefined);
  assert.equal(tenant.slug, 'cafe-da-praca');
  assert.equal(tenant.ativo, true);
  assert.equal(tenant.plano, 'teste');
  assert.equal(tenant.configuracao.tempoEstimadoPadraoMin, 30);
  assert.ok(tenant.configuracao.mensagemWhatsApp.includes('{link}'));
  assert.equal(Tenant.schema.path('slug').options.unique, true);
});

test('Tenant exige identificação e rejeita slug ou plano inválidos', () => {
  assert.ok(new Tenant().validateSync().errors.nome);
  assert.ok(novoTenant({ slug: 'cafe/../../outro' }).validateSync().errors.slug);
  assert.ok(novoTenant({ plano: 'anual' }).validateSync().errors.plano);
});

test('Tenant rejeita cobrança negativa ou infinita e estimativa inválida', () => {
  for (const taxaPorEntrega of [-1, Infinity]) {
    assert.ok(novoTenant({ taxaPorEntrega }).validateSync().errors.taxaPorEntrega);
  }
  for (const tempoEstimadoPadraoMin of [0, -1, 1.5, Infinity]) {
    const tenant = novoTenant({ configuracao: { tempoEstimadoPadraoMin } });
    assert.ok(tenant.validateSync().errors['configuracao.tempoEstimadoPadraoMin']);
  }
});

test('PedidoEntrega exige tenant e endereço de entrega', () => {
  assert.ok(novoPedido({ tenantId: undefined }).validateSync().errors.tenantId);
  const pedido = novoPedido({ origem: { nomeCliente: 'Cliente', telefone: '11988888888' } });
  assert.ok(pedido.validateSync().errors['origem.endereco']);
});

test('PedidoEntrega gera UUID v4 único, começa pendente e registra recebimento', () => {
  const pedido = novoPedido();
  const segundo = novoPedido();
  assert.equal(pedido.validateSync(), undefined);
  assert.match(pedido.tokenRastreamento, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(pedido.tokenRastreamento, segundo.tokenRastreamento);
  assert.equal(pedido.status, 'pendente');
  assert.equal(pedido.taxaEntrega, 0);
  assert.equal(pedido.entregadorId, null);
  assert.equal(pedido.tempoEstimadoMinutos, 30);
  assert.equal(pedido.statusHistorico.length, 1);
  assert.equal(pedido.statusHistorico[0].status, 'pendente');
  assert.equal(pedido.statusHistorico[0].por.tipo, 'sistema');
  assert.ok(pedido.statusHistorico[0].data instanceof Date);
  assert.equal(PedidoEntrega.schema.path('tokenRastreamento').options.unique, true);
  assert.equal(PedidoEntrega.schema.path('tokenRastreamento').options.immutable, true);
  assert.equal(PedidoEntrega.schema.path('tenantId').options.immutable, true);
});

test('PedidoEntrega valida fontes, status e token público', () => {
  assert.ok(novoPedido({ fonte: 'importacao' }).validateSync().errors.fonte);
  assert.ok(novoPedido({ status: 'pago' }).validateSync().errors.status);
  assert.ok(novoPedido({ tokenRastreamento: String(new mongoose.Types.ObjectId()) }).validateSync().errors.tokenRastreamento);
});

test('PedidoEntrega aceita itens opcionais e valida quantidade e valores finitos', () => {
  assert.equal(novoPedido({ itens: [] }).validateSync(), undefined);
  for (const valorTotal of [-1, Infinity, NaN]) {
    assert.ok(novoPedido({ valorTotal }).validateSync().errors.valorTotal);
  }
  assert.ok(novoPedido({ taxaEntrega: -1 }).validateSync().errors.taxaEntrega);
  const pedido = novoPedido({ itens: [{ descricao: 'Café', quantidade: 0, precoUnitario: 8 }] });
  assert.ok(pedido.validateSync().errors['itens.0.quantidade']);
});

test('histórico identifica autor e valida status e data', () => {
  const usuarioId = new mongoose.Types.ObjectId();
  const pedido = novoPedido({ statusHistorico: [{ status: 'pendente', por: { tipo: 'tenant', usuarioId }, data: new Date() }] });
  assert.equal(pedido.validateSync(), undefined);
  assert.equal(String(pedido.statusHistorico[0].por.usuarioId), String(usuarioId));
  assert.ok(novoPedido({ statusHistorico: [{ status: 'invalido', por: { tipo: 'sistema' } }] }).validateSync().errors['statusHistorico.0.status']);
  assert.ok(novoPedido({ statusHistorico: [{ status: 'pendente', por: { tipo: 'tenant' } }] }).validateSync().errors['statusHistorico.0.por.usuarioId']);
});

test('PedidoEntrega prepara índices por tenant e entregador e timestamps próprios', () => {
  const indices = PedidoEntrega.schema.indexes().map(([campos]) => campos);
  assert.ok(indices.some(campos => campos.tenantId === 1 && campos.status === 1 && campos.criadoEm === -1));
  assert.ok(indices.some(campos => campos.entregadorId === 1 && campos.status === 1));
  assert.equal(PedidoEntrega.schema.options.timestamps.createdAt, 'criadoEm');
  assert.equal(PedidoEntrega.schema.options.timestamps.updatedAt, 'atualizadoEm');
});
