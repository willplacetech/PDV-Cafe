const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');

const STATUS_ENTREGA = ['pendente', 'despachado', 'a_caminho', 'entregue', 'cancelado'];

const enderecoSchema = new mongoose.Schema({
  rua: { type: String, required: true, trim: true, maxlength: 200 },
  numero: { type: String, required: true, trim: true, maxlength: 30 },
  complemento: { type: String, trim: true, maxlength: 200 },
  bairro: { type: String, required: true, trim: true, maxlength: 120 },
  referencia: { type: String, trim: true, maxlength: 300 },
}, { _id: false });

const origemSchema = new mongoose.Schema({
  nomeCliente: { type: String, required: true, trim: true, maxlength: 160 },
  telefone: { type: String, required: true, trim: true, maxlength: 30 },
  endereco: { type: enderecoSchema, required: true },
}, { _id: false });

const itemSchema = new mongoose.Schema({
  descricao: { type: String, required: true, trim: true, maxlength: 300 },
  quantidade: { type: Number, required: true, min: 0.000001, validate: Number.isFinite },
  precoUnitario: { type: Number, required: true, min: 0, validate: Number.isFinite },
}, { _id: false });

const autorSchema = new mongoose.Schema({
  tipo: { type: String, required: true, enum: ['tenant', 'entregador', 'sistema'] },
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    required() { return this.tipo !== 'sistema'; },
  },
}, { _id: false });

const historicoSchema = new mongoose.Schema({
  status: { type: String, required: true, enum: STATUS_ENTREGA },
  por: { type: autorSchema, required: true },
  data: { type: Date, required: true, default: Date.now },
}, { _id: false });

const pedidoEntregaSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  fonte: { type: String, required: true, enum: ['pdv', 'formulario', 'api', 'whatsapp'] },
  origem: { type: origemSchema, required: true },
  itens: { type: [itemSchema], default: [] },
  valorTotal: { type: Number, required: true, min: 0, validate: Number.isFinite },
  taxaEntrega: { type: Number, default: 0, min: 0, validate: Number.isFinite },
  status: { type: String, enum: STATUS_ENTREGA, required: true, default: 'pendente' },
  statusHistorico: {
    type: [historicoSchema],
    default: () => [{ status: 'pendente', por: { tipo: 'sistema' } }],
    validate: [(historico) => historico.length > 0, 'O pedido precisa ter histórico de status'],
  },
  tokenRastreamento: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    default: () => randomUUID(),
    match: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  },
  entregadorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entregador', default: null },
  referenciaIntegracao: { type: String, maxlength: 128 },
  motivoCancelamento: { type: String, trim: true, maxlength: 500 },
  whatsappPendente: { type: Boolean, default: false },
  tempoEstimadoMinutos: { type: Number, default: 30, min: 1, validate: Number.isInteger },
}, { timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } });

pedidoEntregaSchema.index({ tenantId: 1, status: 1, criadoEm: -1 });
pedidoEntregaSchema.index({ tenantId: 1, criadoEm: -1 });
pedidoEntregaSchema.index({ entregadorId: 1, status: 1, criadoEm: 1 });

pedidoEntregaSchema.index({ tenantId: 1, referenciaIntegracao: 1 }, { unique: true, partialFilterExpression: { referenciaIntegracao: { $type: 'string' } } });

module.exports = mongoose.model('PedidoEntrega', pedidoEntregaSchema);
