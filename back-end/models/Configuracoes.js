const mongoose = require('mongoose');

const brandingSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 40 },
  shortName: { type: String, trim: true, maxlength: 12 },
  tagline: { type: String, trim: true, maxlength: 80 },
  logoUrl: { type: String, trim: true, maxlength: 500 },
  themeColor: { type: String, trim: true, maxlength: 32 },
  backgroundColor: { type: String, trim: true, maxlength: 32 },
}, { _id: false });

const configuracoesSchema = new mongoose.Schema({
  _id: { type: String, default: 'principal' },
  exigirAutorizacaoGerente: { type: Boolean, default: true },
  branding: { type: brandingSchema, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.model('Configuracoes', configuracoesSchema);
