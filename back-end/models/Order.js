const mongoose = require('mongoose');
const { UNIDADES_PERMITIDAS, normalizarUnidade } = require('../utils/unidades');

const itemSchema = new mongoose.Schema({
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  codigo: String,
  nome: String,
  precoUnitario: { type: Number, required: true },
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
});

const pagamentoSchema = new mongoose.Schema({
  tipo: { 
    type: String, 
    enum: ['dinheiro', 'pix', 'credito_loja', 'cartao_credito', 'cartao_debito'],
    default: 'credito_loja'
  },
  valorRecebido: { type: Number, default: 0 },
  taxaPercentual: { type: Number, default: 0, min: 0 },
  taxaValor: { type: Number, default: 0, min: 0 },
  valorLiquido: { type: Number, default: 0, min: 0 },
  dataPagamento: Date,
  quitado: { type: Boolean, default: false },
  observacao: String,
  comandaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comanda' },
  fiscal: {
    status: { type: String, enum: ['nao_emitido', 'pendente', 'emitido', 'erro'], default: 'nao_emitido' },
    documento: String,
    chave: String,
    mensagem: String,
    emitidoEm: Date,
  }
});

const nfceSchema = new mongoose.Schema({
  status: { type: String, enum: ['nao_emitida', 'processando', 'autorizada', 'rejeitada', 'cancelada'], default: 'nao_emitida' },
  numero: String,
  serie: String,
  chaveAcesso: String,
  protocolo: String,
  xml: String,
  danfePdf: String,
  mensagemSeErro: String,
  dataEmissao: Date,
  dataTentativaEmissao: Date,
}, { _id: false });

const orderSchema = new mongoose.Schema({
  numero: { type: String, unique: true },
  idTemporario: { type: String, trim: true, unique: true, sparse: true },
  itens: [itemSchema],
  subtotal: { type: Number, required: true, min: 0 },
  taxaEntrega: { type: Number, default: 0, min: 0, validate: Number.isFinite },
  desconto: { type: Number, default: 0, min: 0 },
  utilizacaoInterna: { type: Boolean, default: false },
  total: { type: Number, required: true, min: 0 },
  
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  clienteNome: String,
  clienteTelefone: String,
  
  status: {
    type: String,
    enum: ['pendente', 'pago', 'parcial', 'cancelado'],
    default: 'pendente'
  },
  
  pagamentos: [pagamentoSchema],
  nfce: { type: nfceSchema, default: () => ({}) },
  
  atendente: { type: String, required: true },
  observacao: String,
  comandaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comanda' },
  transferenciasComanda: [{
    origem: { type: mongoose.Schema.Types.Mixed, required: true },
    destinoComandaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comanda', required: true },
    data: { type: Date, required: true },
    usuario: { type: String, required: true },
  }],
  tipoAtendimento: { type: String, enum: ['mesa', 'balcao'], default: 'mesa', index: true },
}, { timestamps: true });

// Gerar número do pedido automaticamente
orderSchema.pre('save', async function(next) {
  if (!this.numero) {
    const ultimo = await this.constructor.findOne({}, {}, { sort: { numero: -1 } });
    const proximo = ultimo ? parseInt(ultimo.numero) + 1 : 1;
    this.numero = String(proximo).padStart(6, '0');
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
