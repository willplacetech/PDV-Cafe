const mongoose = require('mongoose');

const RecipeAuditSchema = new mongoose.Schema({
  receitaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe' },
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  produtoNome: { type: String, required: true },
  acao: { type: String, enum: ['criada', 'alterada', 'excluida'], required: true },
  detalhes: { type: String, default: '' },
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

RecipeAuditSchema.index({ produtoId: 1, createdAt: -1 });

module.exports = mongoose.model('RecipeAudit', RecipeAuditSchema);
