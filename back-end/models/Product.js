const mongoose = require('mongoose');

const IngredientSchema = new mongoose.Schema({
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantidade: { type: Number, required: true, min: 0.001 },
  unidade: { type: String, enum: ['un', 'kg', 'g', 'l', 'ml'], required: true },
}, { _id: false });

const ProductSchema = new mongoose.Schema({
  codigo: {
    type: String,
    required: [true, 'Código é obrigatório'],
    unique: true,
    trim: true,
    index: true,
  },
  nome: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true,
    index: true,
  },
  categoria: {
    type: String,
    required: true,
    enum: ['Bebidas Quentes', 'Bebidas geladas', 'Salgados', 'Doces', 'Insumos', 'Outros'],
    default: 'Outros',
  },
  unidadeVenda: {
    type: String,
    enum: ['un', 'kg', 'g', 'l', 'ml'],
    default: 'un',
  },
  vendidoFracionado: {
    type: Boolean,
    default: false,
  },
  aFazer: {
    type: Boolean,
    default: false,
  },
  fichaTecnica: {
    type: [IngredientSchema],
    default: [],
  },
  preco: {
    type: Number,
    required: [true, 'Preço é obrigatório'],
    min: [0, 'Preço não pode ser negativo'],
  },
  custo: {
    type: Number,
    default: 0,
    min: [0, 'Custo não pode ser negativo'],
  },
  custoUnitario: {
    type: Number,
    default: 0,
    min: [0, 'Custo unitário não pode ser negativo'],
  },
  precoCompra: {
    type: Number,
    default: 0,
    min: [0, 'Preço de compra não pode ser negativo'],
  },
  unidadeCompra: {
    type: String,
    enum: ['kg', 'g', 'l', 'ml', 'un', 'dz'],
    default: 'kg',
  },
  custoUnitarioBase: {
    type: Number,
    default: 0,
    min: [0, 'Custo unitário base não pode ser negativo'],
  },
  reajusteRecomendado: {
    type: Boolean,
    default: false,
  },
  estoque: {
    type: Number,
    required: true,
    default: 0,
    min: [0, 'Estoque não pode ser negativo'],
  },
  estoqueInsumos: {
    type: Number,
    default: 0,
    min: [0, 'Estoque de insumos não pode ser negativo'],
  },
  estoqueMinimo: {
    type: Number,
    default: 0,
    min: [0, 'Estoque mínimo não pode ser negativo'],
  },
  estoqueMinimoInsumos: {
    type: Number,
    default: 0,
    min: [0, 'Estoque mínimo de insumos não pode ser negativo'],
  },
  estoqueInsumosInicial: { type: Number, min: 0 },
  estoqueInsumosInicialData: { type: String },
  producaoPropria: {
    type: Boolean,
    default: false,
  },
  controladoComoInsumo: {
    type: Boolean,
    default: false,
  },
  estoqueMaximo: {
    type: Number,
    default: 100,
    min: [0.001, 'Estoque máximo deve ser maior que zero'],
  },
  estoqueInicialDia: { type: Number, min: 0 },
  estoqueInicialData: { type: String },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Índice composto para busca
ProductSchema.index({ nome: 'text', codigo: 'text' });

module.exports = mongoose.model('Product', ProductSchema);
