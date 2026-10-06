const mongoose = require('mongoose');
const { UNIDADES_PERMITIDAS, normalizarUnidade } = require('../utils/unidades');
const { FORMAS_PAGAMENTO, calcularStatusPagamento } = require('../utils/pagamento');

const itemSchema = new mongoose.Schema({
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  codigo: String,
  nome: { type: String, required: true },
  precoUnitario: { type: Number, required: true, min: 0 },
  custoUnitarioHistorico: { type: Number, min: 0 },
  controleEstoque: { type: String, enum: ['produto', 'insumos', 'nenhum'] },
  movimentoEstoque: {
    type: new mongoose.Schema({ pecas: { type: Number, min: 0 }, pesoKg: { type: Number, min: 0 } }, { _id: false }),
    default: undefined,
  },
  precoUnitarioOriginal: { type: Number, min: 0 },
  descontoQuantidade: { type: Number, min: 0, default: 0 },
  economiaQuantidade: { type: Number, min: 0, default: 0 },
  faixaDescontoQuantidade: { type: Number, min: 1 },
  grupoDescontoAtivo: { type: Boolean, default: false },
  totalGrupo: { type: Number, min: 0 },
  faltamParaGrupo: { type: Number, min: 0 },
  quantidade: { type: Number, required: true, min: 0.000001 },
  unidadeVenda: { type: String, enum: UNIDADES_PERMITIDAS, default: 'un', set: normalizarUnidade },
  pesoPorUnidade: { type: Number, min: 0 },
  unidadePeso: { type: String, enum: ['kg'] },
  tipoVenda: { type: String, enum: ['inteiro', 'peso', 'unidade'], default: 'unidade' },
  pesoVendidoKg: { type: Number, min: 0 },
  quantidadePecas: { type: Number, min: 0 },
  modificadores: { type: [String], default: [] },
  aFazer: { type: Boolean, default: false },
  insumosConsumidos: [{
    produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantidade: { type: Number, min: 0.000001 },
    unidade: { type: String, enum: UNIDADES_PERMITIDAS, set: normalizarUnidade },
  }],
}, { _id: true });

const comandaSchema = new mongoose.Schema({
  numero: { type: String, unique: true },
  idTemporario: { type: String, trim: true, unique: true, sparse: true },
  idempotencyKey: { type: String, maxlength: 128 },
  idempotencyHash: String,
  clienteNome: { type: String, trim: true, default: 'Cliente nao identificado' },
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  observacao: { type: String, trim: true },
  tipoAtendimento: { type: String, enum: ['mesa', 'balcao'], default: 'mesa', index: true },
  statusBalcao: { type: String, enum: ['aguardando', 'preparando', 'pronto', 'pago', 'entregue'], default: 'aguardando' },
  mesa: { type: String, trim: true },
  itens: { type: [itemSchema], default: [] },
  taxaEntrega: { type: Number, default: 0, min: 0, validate: Number.isFinite },
  desconto: { type: Number, default: 0, min: 0 },
  valorTotal: { type: Number, default: 0, min: 0 },
  valorPago: { type: Number, default: 0, min: 0 },
  saldoDevedor: { type: Number, default: 0, min: 0 },
  statusPagamento: { type: String, enum: ['pendente', 'parcial', 'quitado', 'cancelado'], default: 'pendente' },
  historicoPagamentos: [{
    valor: { type: Number, required: true, min: 0 },
    formaPagamento: { type: String, enum: FORMAS_PAGAMENTO, default: 'dinheiro' },
    taxaPercentual: { type: Number, default: 0, min: 0 },
    taxaValor: { type: Number, default: 0, min: 0 },
    valorLiquido: { type: Number, default: 0, min: 0 },
    data: { type: Date, default: Date.now },
    observacao: { type: String, default: '' },
    usuario: String,
  }],
  utilizacaoInterna: { type: Boolean, default: false },
  estoqueBaixado: { type: Boolean, default: false },
  status: { type: String, enum: ['aberta', 'fechada', 'cancelada'], default: 'aberta', index: true },
  atendente: { type: String, required: true },
  entrega: {
    type: new mongoose.Schema({
      usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', immutable: true },
      telefone: String,
      endereco: mongoose.Schema.Types.Mixed,
      taxaEntrega: Number,
      pedidoEntregaId: { type: mongoose.Schema.Types.ObjectId, ref: 'PedidoEntrega' },
      status: { type: String, enum: ['pendente', 'processado', 'erro'], default: 'pendente' },
      tentativas: { type: Number, default: 0 },
      ultimoErro: String,
      proximaTentativa: Date,
    }, { _id: false }),
    default: undefined,
  },
  pedidoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
}, { timestamps: true });

comandaSchema.index({ atendente: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

comandaSchema.pre('save', async function(next) {
  if (!this.numero) {
    const ultima = await this.constructor.findOne({}, {}, { sort: { numero: -1 } });
    this.numero = String(ultima ? Number(ultima.numero) + 1 : 1).padStart(4, '0');
  }

  const { valorTotal, valorPago, saldoDevedor, statusPagamento } = calcularStatusPagamento({
    valorTotal: this.valorTotal,
    historicoPagamentos: this.historicoPagamentos,
  });
  this.valorPago = valorPago;
  this.saldoDevedor = saldoDevedor;
  this.statusPagamento = this.status === 'cancelada' ? 'cancelado' : statusPagamento;

  next();
});

module.exports = mongoose.model('Comanda', comandaSchema);
