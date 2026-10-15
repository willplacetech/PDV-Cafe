const mongoose = require('mongoose');

const auditoriaSchema = new mongoose.Schema({
  usuarioSolicitante: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  usuarioAutorizou: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acao: { type: String, required: true },
  detalhes: { type: String },
  ip: { type: String },
  sucesso: { type: Boolean, required: true },
  motivoFalha: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model('Auditoria', auditoriaSchema);
