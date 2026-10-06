const mongoose = require('mongoose');

const operacaoSchema = new mongoose.Schema({
  usuarioId: { type: String, required: true },
  tipo: { type: String, required: true },
  recursoId: { type: String, required: true },
  operacaoId: { type: String, required: true, maxlength: 128 },
  payloadHash: { type: String, required: true },
  resultado: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

operacaoSchema.index({ usuarioId: 1, tipo: 1, recursoId: 1, operacaoId: 1 }, { unique: true });

module.exports = mongoose.model('OperacaoFinanceira', operacaoSchema);
