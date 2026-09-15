const mongoose = require('mongoose');

const paymentSettingsSchema = new mongoose.Schema({
  chave: { type: String, unique: true, default: 'principal' },
  cartao_credito: { type: Number, min: 0, default: 0 },
  cartao_debito: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('PaymentSettings', paymentSettingsSchema);
