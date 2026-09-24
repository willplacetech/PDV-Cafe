const mongoose = require('mongoose');

const ProductionItemSchema = new mongoose.Schema({
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  nome: { type: String, required: true },
  quantidade: { type: Number, required: true, min: 0.000001 },
  unidade: { type: String, required: true },
}, { _id: false });

const ProductionSchema = new mongoose.Schema({
  receitaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', required: true },
  receitaNome: { type: String, required: true },
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  produtoNome: { type: String, required: true },
  quantidade: { type: Number, required: true, min: 0.000001 },
  rendimentoTotal: { type: Number, required: true, min: 0.000001 },
  unidadeRendimento: { type: String, required: true },
  insumos: { type: [ProductionItemSchema], required: true },
  observacao: { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Production', ProductionSchema);