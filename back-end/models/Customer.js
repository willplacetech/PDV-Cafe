const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true,
  },
  telefone: {
    type: String,
    trim: true,
  },
  endereco: {
    type: String,
    trim: true,
  },
  aniversario: {
    type: String,
    trim: true,
  },
  cpf: {
    type: String,
    trim: true,
  },
  cafesFidelidade: { type: Number, default: 0, min: 0 },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

CustomerSchema.index({ nome: 'text', telefone: 'text' });
CustomerSchema.index({ telefone: 1 }, { unique: true, partialFilterExpression: { telefone: { $gt: '' } } });

module.exports = mongoose.model('Customer', CustomerSchema);