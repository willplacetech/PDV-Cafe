const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  codigo: String,
  nome: String,
  precoUnitario: { type: Number, required: true },
  quantidade: { type: Number, required: true, min: 0.001 },
  unidadeVenda: { type: String, enum: ['un', 'kg', 'g', 'l', 'ml'], default: 'un' },
  pesoPorUnidade: { type: Number, min: 0 },
  unidadePeso: { type: String, enum: ['kg', 'g'] },
  tipoVenda: { type: String, enum: ['inteiro', 'peso', 'unidade'], default: 'unidade' },
  pesoVendidoKg: { type: Number, min: 0 },
  modificadores: { type: [String], default: [] },
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

const orderSchema = new mongoose.Schema({
  numero: { type: String, unique: true },
  itens: [itemSchema],
  subtotal: { type: Number, required: true, min: 0 },
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
  
  atendente: { type: String, required: true },
  observacao: String,
  comandaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comanda' },
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
