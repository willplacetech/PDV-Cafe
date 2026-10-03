const mongoose = require('mongoose');
const { UNIDADES_PERMITIDAS, normalizarUnidade, casasDecimaisValidas } = require('../utils/unidades');

const IngredientSchema = new mongoose.Schema({
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantidade: { type: Number, required: true, min: 0.000001 },
  unidade: { type: String, enum: UNIDADES_PERMITIDAS, required: true, set: normalizarUnidade },
}, { _id: false });

const QuantityDiscountSchema = new mongoose.Schema({
  quantidadeMinima: { type: Number, required: true, min: 1 },
  precoUnitario: { type: Number, required: true, min: 0 },
  ativo: { type: Boolean, default: true },
}, { _id: false });

const GrupoDescontoSchema = new mongoose.Schema({
  nome: { type: String, trim: true },
  quantidadeMinima: { type: Number, min: 1 },
  precoPromocional: { type: Number, min: 0 },
  ativo: { type: Boolean, default: true },
}, { _id: false });

const ProductSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['venda', 'insumo'],
    default: 'venda',
    index: true,
  },
  tipoProduto: {
    type: String,
    enum: ['revenda', 'coz', 'producao'],
    default: 'revenda',
    index: true,
  },
  rendimentoPorReceita: {
    type: Number,
    min: [0.001, 'Rendimento por receita deve ser maior que zero'],
    default: 1,
  },
  codigo: {
    type: String,
    required: [true, 'Código é obrigatório'],
    unique: true,
    trim: true,
    index: true,
  },
  ncm: {
    type: String,
    trim: true,
    default: '',
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
    enum: ['Bebidas Quentes', 'Bebidas geladas', 'Salgados', 'Doces', 'Congelados', 'Sorvetes', 'Pratos na Hora', 'Insumos', 'Outros'],
    default: 'Outros',
  },
  unidade: { type: String, enum: UNIDADES_PERMITIDAS, required: true, default: 'un', set: normalizarUnidade },
  quantidade: {
    type: Number,
    min: [0.001, 'Quantidade deve ser maior ou igual a 0,001'],
    validate: { validator(value) { return casasDecimaisValidas(value, this.unidade); }, message: 'Formato inválido' },
    default: 1,
  },
  rendimento: { type: Number, min: [0.01, 'Rendimento deve ser maior ou igual a 0,01'], default: null },
  unidadeVenda: {
    type: String,
    enum: UNIDADES_PERMITIDAS,
    default: 'un',
    set: normalizarUnidade,
  },
  unidadeCompra: {
    type: String,
    enum: UNIDADES_PERMITIDAS,
    default: 'un',
    set: normalizarUnidade,
  },
  marcaReferencia: {
    type: String,
    trim: true,
    default: '',
  },
  conteudoPorEmbalagem: {
    type: Number,
    min: [0, 'Conteúdo por embalagem não pode ser negativo'],
    default: 0,
  },
  unidadeConteudo: {
    type: String,
    enum: UNIDADES_PERMITIDAS,
    default: 'un',
    set: normalizarUnidade,
  },
  estoqueEmbalagens: {
    type: Number,
    min: [0, 'Estoque de embalagens não pode ser negativo'],
    default: 0,
  },
  estoqueConteudoAberto: {
    type: Number,
    min: [0, 'Conteúdo aberto não pode ser negativo'],
    default: 0,
  },
  estoqueMinimoEmbalagens: {
    type: Number,
    min: [0, 'Estoque mínimo não pode ser negativo'],
    default: 0,
  },
  rendimentoPorUnidadeCompra: {
    type: Number,
    default: 0,
    min: [0, 'Rendimento por unidade de compra não pode ser negativo'],
  },
  pesoPorUnidade: {
    type: Number,
    min: [0, 'Peso por unidade não pode ser negativo'],
    default: 0,
  },
  unidadePeso: {
    type: String,
    enum: ['kg'],
    default: 'kg',
  },
  vendidoFracionado: {
    type: Boolean,
    default: false,
  },
  aFazer: {
    type: Boolean,
    default: false,
  },
  permitirVendaSemInsumo: {
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
  descontosPorQuantidade: {
    type: [QuantityDiscountSchema],
    default: [],
  },
  grupoDesconto: {
    type: GrupoDescontoSchema,
    default: undefined,
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
    default: function defaultPrecoCompra() {
      return this.tipo === 'venda' && !this.controladoComoInsumo ? 0 : undefined;
    },
    required: [function precoCompraObrigatorio() {
      return this.tipo === 'insumo' || this.controladoComoInsumo === true;
    }, 'Preço de compra é obrigatório para insumos'],
    min: [0, 'Preço de compra não pode ser negativo'],
  },
  custoUnitarioBase: {
    type: Number,
    default: 0,
    min: [0, 'Custo unitário base não pode ser negativo'],
  },
  custoCalculado: {
    type: Number,
    default: null,
    min: [0, 'Custo calculado não pode ser negativo'],
  },
  dataUltimoCalculo: {
    type: Date,
    default: null,
  },
  fonteCalculo: {
    type: String,
    enum: ['insumo', 'manual', 'indisponivel'],
    default: 'indisponivel',
  },
  custoUltimoSalvo: {
    type: Number,
    default: 0,
    min: [0, 'Custo último salvo não pode ser negativo'],
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
  estoquePesoNormalizado: { type: Boolean },
  estoquePesoKg: {
    type: Number,
    default: 0,
    min: [0, 'Estoque em peso não pode ser negativo'],
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
   estoqueMinimoBase: {
     type: Number,
     default: 0,
     min: [0, 'Estoque mínimo base não pode ser negativo'],
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
  usavelEmReceita: {
    type: Boolean,
    default: false,
  },
  ativo: {
    type: Boolean,
    default: true,
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
