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
  chaveAbertura: { type: String },
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
    valorContado: { type: Number, min: 0 },
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
    taxaCredito: { type: Number, default: 0 },
    liquidoCredito: { type: Number, default: 0 },
    debito: { type: Number, default: 0 },
    taxaDebito: { type: Number, default: 0 },
    liquidoDebito: { type: Number, default: 0 },
    creditoLoja: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    totalLiquido: { type: Number, default: 0 },
  },
  status: { type: String, enum: ['aberto', 'fechado'], default: 'aberto', index: true },
}, { timestamps: true });

fechamentoCaixaSchema.index({ data: 1, turno: 1, status: 1 });
// Only new openings carry this key. Existing history can contain duplicates,
// and adjustment records must not compete with their original fechamento.
fechamentoCaixaSchema.index({ chaveAbertura: 1 }, {
  unique: true,
  partialFilterExpression: { tipoRegistro: 'fechamento', chaveAbertura: { $type: 'string' } },
});

module.exports = mongoose.model('FechamentoCaixa', fechamentoCaixaSchema);
