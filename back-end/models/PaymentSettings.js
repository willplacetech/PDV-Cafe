const mongoose = require('mongoose');

const paymentSettingsSchema = new mongoose.Schema({
  chave: { type: String, unique: true, default: 'principal' },
  cartao_credito: { type: Number, min: 0, default: 0 },
  cartao_debito: { type: Number, min: 0, default: 0 },
  formasPadraoNomes: [{
    tipo: { type: String, enum: ['cartao_credito', 'cartao_debito'], required: true },
    nome: { type: String, required: true, maxlength: 80 },
    nomeNormalizado: { type: String, required: true },
  }],
  formasDesativadas: { type: [{ type: String, enum: ['cartao_credito', 'cartao_debito'] }], default: [] },
  formasPersonalizadas: [{
    tipo: { type: String, required: true },
    nome: { type: String, required: true, maxlength: 80 },
    nomeNormalizado: { type: String, required: true },
    taxaPercentual: { type: Number, min: 0, max: 100, required: true },
  }],
}, { timestamps: true });

module.exports = mongoose.model('PaymentSettings', paymentSettingsSchema);
