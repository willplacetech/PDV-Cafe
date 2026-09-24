const mongoose = require('mongoose');

const StockMovementSchema = new mongoose.Schema({
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  produtoNome: { type: String, required: true },
  tipo: { type: String, enum: ['entrada', 'saida', 'producao', 'transferencia', 'ajuste'], required: true },
  origem: { type: String, enum: ['venda', 'insumos', 'externo', null], default: null },
  destino: { type: String, enum: ['venda', 'insumos', 'externo', null], default: null },
  quantidade: { type: Number, required: true, min: 0.000001 },
  quantidadePecas: { type: Number, min: 0 },
  pesoKg: { type: Number, min: 0 },
  tipoVenda: { type: String, enum: ['inteiro', 'peso', 'unidade'] },
  unidade: { type: String, trim: true },
  referenciaId: { type: mongoose.Schema.Types.ObjectId },
  observacao: { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

StockMovementSchema.index({ createdAt: -1 });
StockMovementSchema.index({ produtoId: 1, createdAt: -1 });

module.exports = mongoose.model('StockMovement', StockMovementSchema);