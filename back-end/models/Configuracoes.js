const mongoose = require('mongoose');

const configuracoesSchema = new mongoose.Schema({
  _id: { type: String, default: 'principal' }, // Singleton pattern
  exigirAutorizacaoGerente: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Configuracoes', configuracoesSchema);
