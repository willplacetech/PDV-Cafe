const mongoose = require('mongoose');

const configuracaoSchema = new mongoose.Schema({
  tempoEstimadoPadraoMin: { type: Number, default: 30, min: 1, validate: Number.isInteger },
  mensagemWhatsApp: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: 'Olá! Acompanhe sua entrega: {link}',
  },
}, { _id: false });

const tenantSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true, maxlength: 160 },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    maxlength: 120,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  },
  cnpj: { type: String, trim: true, maxlength: 18 },
  telefone: { type: String, required: true, trim: true, maxlength: 30 },
  endereco: { type: String, required: true, trim: true, maxlength: 500 },
  ativo: { type: Boolean, default: true },
  plano: { type: String, enum: ['teste', 'mensal'], default: 'teste' },
  dataVencimento: Date,
  taxaPorEntrega: { type: Number, min: 0, validate: Number.isFinite },
  configuracao: { type: configuracaoSchema, required: true, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.model('Tenant', tenantSchema);
