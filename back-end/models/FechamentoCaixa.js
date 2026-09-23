const mongoose = require('mongoose');

const movimentoSchema = new mongoose.Schema({
  valor: { type: Number, required: true, min: 0.01 },
  responsavel: { type: String, required: true, trim: true },
  motivo: { type: String, required: true, trim: true },
  data: { type: Date, default: Date.now },
}, { _id: true });

const itemContagemSchema = new mongoose.Schema({
  valor: { type: Number, required: true, min: 0 },
  quantidade: { type: Number, required: true, min: 0 },
}, { _id: false });

const fechamentoCaixaSchema = new mongoose.Schema({
  data: { type: Date, required: true, index: true },
  usuarioAbertura: { type: String, required: true },
  usuarioFechamento: String,
  turno: { type: String, required: true, trim: true, default: 'principal' },
  tipoRegistro: { type: String, enum: ['fechamento', 'ajuste'], default: 'fechamento' },
  fechamentoOriginalId: { type: mongoose.Schema.Types.ObjectId, ref: 'FechamentoCaixa' },
  ajusteValor: { type: Number, default: 0 },
  ajusteMotivo: { type: String, default: '' },
  sistema: {
    saldoAnterior: { type: Number, default: 0 },
    entradasDinheiro: { type: Number, default: 0 },
    sangrias: { type: [movimentoSchema], default: [] },
    suplementacoes: { type: [movimentoSchema], default: [] },
    saldoEsperado: { type: Number, default: 0 },
  },
  contagemFisica: {
    cedulas: { type: [itemContagemSchema], default: [] },
    moedas: { type: [itemContagemSchema], default: [] },
    totalCedulas: { type: Number, default: 0 },
    totalMoedas: { type: Number, default: 0 },
    totalDinheiro: { type: Number, default: 0 },
  },
  conferencia: {
    diferenca: { type: Number, default: 0 },
    situacao: { type: String, enum: ['conferido', 'faltante', 'sobrando'], default: 'conferido' },
    observacao: { type: String, default: '' },
    conferidoEm: Date,
  },
  outrosMeios: {
    pix: { type: Number, default: 0 },
    credito: { type: Number, default: 0 },
    debito: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  status: { type: String, enum: ['aberto', 'fechado'], default: 'aberto', index: true },
}, { timestamps: true });

fechamentoCaixaSchema.index({ data: 1, turno: 1, status: 1 });

module.exports = mongoose.model('FechamentoCaixa', fechamentoCaixaSchema);
