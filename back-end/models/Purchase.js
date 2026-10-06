const mongoose = require('mongoose');
const { UNIDADES_PERMITIDAS, normalizarUnidade, validarQuantidadeCompra } = require('../utils/unidades');

const PurchaseItemSchema = new mongoose.Schema({
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  preco: { type: Number, min: [0.000001, 'Preço deve ser maior que zero'] },
  quantidade: { type: Number, min: [0.001, 'Quantidade deve ser maior ou igual a 0,001'] },
  unidade: { type: String, enum: UNIDADES_PERMITIDAS, set: normalizarUnidade },
  rendimento: { type: Number, min: [0.01, 'Rendimento deve ser maior ou igual a 0,01'], default: null },
  valorTotal: { type: Number, required: true, min: [0.000001, 'Valor total deve ser maior que zero'] },
  qtdEmbalagens: {
    type: Number,
    required: true,
    min: [0.000001, 'Quantidade comprada deve ser maior que zero'],
    validate: {
      validator(value) {
        return validarQuantidadeCompra(value, this.conteudoPorEmbalagem, this.unidadeConteudo);
      },
      message: 'Quantidade comprada inválida para a unidade informada',
    },
  },
  conteudoPorEmbalagem: { type: Number, required: true, min: [0.000001, 'Conteúdo por embalagem deve ser maior que zero'] },
  unidadeConteudo: { type: String, enum: UNIDADES_PERMITIDAS, required: true, set: normalizarUnidade },
  quantidadeTotal: { type: Number, required: true, min: [0.000001, 'Quantidade total deve ser maior que zero'] },
  custoUnitario: { type: Number, required: true, min: [0.000001, 'Custo unitário deve ser maior que zero'] },
}, { _id: false });

const PurchaseSchema = new mongoose.Schema({
  fornecedor: { type: String, required: true, trim: true },
  numeroNF: { type: String, required: true, trim: true },
  data: { type: Date, required: true },
  metodoCusteio: { type: String, enum: ['media_ponderada', 'ultimo_preco'], required: true },
  itens: { type: [PurchaseItemSchema], required: true, validate: [(items) => items.length > 0, 'A compra deve ter pelo menos um item'] },
  valorTotal: { type: Number, required: true, min: [0.000001, 'Valor total da compra deve ser maior que zero'] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

PurchaseSchema.index({ data: -1 });
PurchaseSchema.index({ numeroNF: 1 });

module.exports = mongoose.model('Purchase', PurchaseSchema);
