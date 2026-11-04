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

const COR_HEX = /^#[0-9a-f]{6}$/i;
const LOGO_URL_SEGURA = /^(?:https:\/\/|\/(?!\/))/i;

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
  pdvIntegrado: { type: Boolean, default: false },
  plano: { type: String, enum: ['teste', 'mensal'], default: 'teste' },
  planoRecursos: { type: String, enum: ['essencial', 'pro', 'delivery'], default: 'essencial' },
  logoUrl: {
    type: String,
    trim: true,
    maxlength: 2048,
    validate: { validator: valor => !valor || LOGO_URL_SEGURA.test(valor), message: 'Logo deve usar URL HTTPS ou caminho local.' },
  },
  corPrimaria: { type: String, trim: true, default: '#2563eb', match: COR_HEX },
  corSecundaria: { type: String, trim: true, default: '#0f172a', match: COR_HEX },
  appName: { type: String, trim: true, maxlength: 80 },
  dataVencimento: Date,
  taxaPorEntrega: { type: Number, min: 0, validate: Number.isFinite },
  taxaEntregaPadrao: { type: Number, min: 0, validate: Number.isFinite },
  configuracao: { type: configuracaoSchema, required: true, default: () => ({}) },
}, { timestamps: true });

tenantSchema.index({ pdvIntegrado: 1 }, { unique: true, partialFilterExpression: { pdvIntegrado: true } });

module.exports = mongoose.model('Tenant', tenantSchema);
