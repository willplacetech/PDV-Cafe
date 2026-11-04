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

auditoriaSchema.virtual('data').get(function () { return this.createdAt; });
auditoriaSchema.set('toJSON', { virtuals: true });
auditoriaSchema.index({ createdAt: -1, _id: -1 });
auditoriaSchema.index({ acao: 1, createdAt: -1 });
auditoriaSchema.index({ usuarioSolicitante: 1, createdAt: -1 });
auditoriaSchema.index({ usuarioAutorizou: 1, createdAt: -1 });

require('../utils/tenantSchema')(auditoriaSchema);

module.exports = mongoose.model('Auditoria', auditoriaSchema);
