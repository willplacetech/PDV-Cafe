const mongoose = require('mongoose');

const enderecoEntregaSchema = new mongoose.Schema({
  rua: { type: String, trim: true, maxlength: 300 },
  numero: { type: String, trim: true, maxlength: 30 },
  bairro: { type: String, trim: true, maxlength: 120 },
  complemento: { type: String, trim: true, maxlength: 200 },
  referencia: { type: String, trim: true, maxlength: 200 },
}, { _id: false });

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
  enderecoEntrega: { type: enderecoEntregaSchema, default: undefined },
  aniversario: {
    type: String,
    trim: true,
  },
  cpf: {
    type: String,
    trim: true,
  },
  cafesFidelidade: { type: Number, default: 0, min: 0 },
  clienteInterno: { type: Boolean, default: false },
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
CustomerSchema.index({ clienteInterno: 1 }, { unique: true, partialFilterExpression: { clienteInterno: true } });
CustomerSchema.index({ telefone: 1 }, { unique: true, partialFilterExpression: { telefone: { $gt: '' } } });

module.exports = mongoose.model('Customer', CustomerSchema);
