const mongoose = require('mongoose');

const RecipeItemSchema = new mongoose.Schema({
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantidade: { type: Number, required: true, min: 0.001 },
  unidade: { type: String, enum: ['un', 'kg', 'g', 'l', 'ml'], required: true },
}, { _id: false });

const RecipeSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  rendimento: { type: Number, required: true, min: 0.001 },
  unidadeRendimento: { type: String, enum: ['un', 'kg', 'g', 'l', 'ml'], required: true },
  ingredientes: { type: [RecipeItemSchema], required: true, validate: (items) => items.length > 0 },
  ativo: { type: Boolean, default: true },
  custoInsumosTotal: { type: Number, default: 0, min: 0 },
  custoEmbalagem: { type: Number, default: 0, min: 0 },
  custoIndireto: { type: Number, default: 0, min: 0 },
  maoDeObra: { type: Number, default: 0, min: 0 },
  custoTotal: { type: Number, default: 0, min: 0 },
  custoUnitario: { type: Number, default: 0, min: 0 },
  ativa: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Recipe', RecipeSchema);