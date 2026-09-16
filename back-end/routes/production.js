const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Product = require('../models/Product');
const Recipe = require('../models/Recipe');
const Production = require('../models/Production');
const StockMovement = require('../models/StockMovement');
const { calcularCustoReceita } = require('../utils/custo');
const { dadosEstoqueProduto } = require('../utils/estoqueProduto');

const router = express.Router();
const locations = ['venda', 'insumos'];
const units = ['un', 'kg', 'g', 'l', 'ml'];
const balanceField = (location) => location === 'insumos' ? 'estoqueInsumos' : 'estoque';

const sincronizarCustoReceita = async (recipeId) => {
  const recipe = await Recipe.findById(recipeId).populate('ingredientes.produtoId');
  if (!recipe) return;
  const ingredientes = recipe.ingredientes.map((item) => ({
    quantidade: Number(item.quantidade || 0),
    unidade: item.unidade,
    custoUnitarioBase: Number(item.produtoId?.custoUnitarioBase || 0),
  }));
  const resultado = calcularCustoReceita(ingredientes, recipe.custoEmbalagem, recipe.custoIndireto, recipe.maoDeObra, Number(recipe.rendimento || 1));
  await Recipe.findByIdAndUpdate(recipe._id, { $set: { custoInsumosTotal: resultado.custoInsumosTotal, custoTotal: resultado.custoTotal, custoUnitario: resultado.custoUnitario } });
  await Product.findByIdAndUpdate(recipe.produtoId, { $set: { custo: resultado.custoUnitario, custoUnitario: resultado.custoUnitario } });
};

router.use(auth);
router.use(auth.allowRoles('admin'));

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
};

router.get('/recipes', async (req, res) => {
  try {
    const recipes = await Recipe.find().populate('produtoId', 'nome codigo unidadeVenda producaoPropria').populate('ingredientes.produtoId', 'nome codigo unidadeVenda estoqueInsumos').sort({ nome: 1 });
    res.json(recipes);
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

router.post('/recipes', [
  body('nome').trim().notEmpty(),
  body('produtoId').isMongoId(),
  body('rendimento').isFloat({ min: 0.001 }),
  body('unidadeRendimento').isIn(units),
  body('ingredientes').isArray({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  try {
    const { nome, produtoId, rendimento, unidadeRendimento, ingredientes } = req.body;
    const produto = await Product.findById(produtoId);
    if (!produto) return res.status(404).json({ msg: 'Produto produzido não encontrado' });
    const ids = ingredientes.map((item) => item.produtoId);
    const produtos = await Product.find({ _id: { $in: ids } });
    const byId = new Map(produtos.map((produtoItem) => [String(produtoItem._id), produtoItem]));
    const itens = ingredientes.map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade), unidade: item.unidade || byId.get(String(item.produtoId))?.unidadeVenda || 'un' }));
    if (itens.some((item) => !byId.has(String(item.produtoId)) || !Number.isFinite(item.quantidade) || item.quantidade <= 0 || !units.includes(item.unidade))) return res.status(400).json({ msg: 'Ingrediente inválido' });
    const recipe = await Recipe.create({ nome: nome.trim(), produtoId, rendimento: Number(rendimento), unidadeRendimento, ingredientes: itens, createdBy: req.user.id });
    await Product.findByIdAndUpdate(produtoId, { $set: { producaoPropria: true } });
    await sincronizarCustoReceita(recipe._id);
    res.status(201).json(await recipe.populate('produtoId', 'nome codigo unidadeVenda producaoPropria'));
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.put('/recipes/:id', [
  body('nome').optional().trim().notEmpty(),
  body('produtoId').optional().isMongoId(),
  body('rendimento').optional().isFloat({ min: 0.001 }),
  body('unidadeRendimento').optional().isIn(units),
  body('ingredientes').optional().isArray({ min: 1 }),
  body('ativa').optional().isBoolean(),
], async (req, res) => {
  if (!validate(req, res)) return;
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ msg: 'Receita não encontrada' });
    const fields = {};
    ['nome', 'produtoId', 'unidadeRendimento'].forEach((key) => { if (req.body[key] !== undefined) fields[key] = req.body[key]; });
    ['rendimento', 'ativa'].forEach((key) => { if (req.body[key] !== undefined) fields[key] = key === 'rendimento' ? Number(req.body[key]) : Boolean(req.body[key]); });
    if (req.body.ingredientes) fields.ingredientes = req.body.ingredientes.map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade), unidade: item.unidade }));
    const updated = await Recipe.findByIdAndUpdate(req.params.id, { $set: fields }, { new: true, runValidators: true }).populate('produtoId', 'nome codigo unidadeVenda producaoPropria');
    await Product.findByIdAndUpdate(updated.produtoId._id, { $set: { producaoPropria: updated.ativa } });
    if (updated.ativa) await sincronizarCustoReceita(updated._id);
    res.json(updated);
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.delete('/recipes/:id', async (req, res) => {
  try {
    const used = await Production.exists({ receitaId: req.params.id });
    if (used) return res.status(400).json({ msg: 'Receita já utilizada não pode ser excluída; desative-a.' });
    const recipe = await Recipe.findByIdAndDelete(req.params.id);
    if (!recipe) return res.status(404).json({ msg: 'Receita não encontrada' });
    await Product.findByIdAndUpdate(recipe.produtoId, { $set: { producaoPropria: false } });
    res.json({ msg: 'Receita removida com sucesso' });
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.get('/stock', async (req, res) => {
  try {
    const location = locations.includes(req.query.location) ? req.query.location : 'insumos';
    const field = balanceField(location);
    const products = await Product.find({ $or: [{ [field]: { $gt: 0 } }, { controladoComoInsumo: location === 'insumos' }] }).sort({ nome: 1 });
    res.json(products.map((product) => ({ ...product.toObject(), ...dadosEstoqueProduto(product), local: location, saldo: location === 'venda' ? dadosEstoqueProduto(product).estoque : Number(product[field] || 0), minimo: Number(location === 'insumos' ? product.estoqueMinimoInsumos : product.estoqueMinimo || 0) })));
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

router.get('/movements', async (req, res) => {
  try { res.json(await StockMovement.find().sort({ createdAt: -1 }).limit(100)); } catch (error) { res.status(500).json({ msg: error.message }); }
});

router.post('/transfer', [body('produtoId').isMongoId(), body('origem').isIn(locations), body('destino').isIn(locations), body('quantidade').isFloat({ min: 0.001 })], async (req, res) => {
  if (!validate(req, res)) return;
  if (req.body.origem === req.body.destino) return res.status(400).json({ msg: 'Origem e destino devem ser diferentes' });
  const session = await mongoose.startSession();
  try {
    let movement;
    await session.withTransaction(async () => {
      const quantity = Number(req.body.quantidade);
      const product = await Product.findById(req.body.produtoId).session(session);
      if (!product) throw new Error('Produto não encontrado');
      const sourceField = balanceField(req.body.origem);
      const destinationField = balanceField(req.body.destino);
      const updated = await Product.findOneAndUpdate({ _id: product._id, [sourceField]: { $gte: quantity } }, { $inc: { [sourceField]: -quantity, [destinationField]: quantity } }, { new: true, session });
      if (!updated) throw new Error(`Estoque insuficiente de ${product.nome} no estoque de ${req.body.origem}`);
      [movement] = await StockMovement.create([{ produtoId: product._id, produtoNome: product.nome, tipo: 'transferencia', origem: req.body.origem, destino: req.body.destino, quantidade: quantity, observacao: req.body.observacao, createdBy: req.user.id }], { session });
    });
    res.status(201).json(movement);
  } catch (error) { res.status(400).json({ msg: error.message }); } finally { await session.endSession(); }
});

router.post('/produce', [body('receitaId').isMongoId(), body('quantidade').isFloat({ min: 0.001 })], async (req, res) => {
  if (!validate(req, res)) return;
  const session = await mongoose.startSession();
  try {
    let production;
    await session.withTransaction(async () => {
      const recipe = await Recipe.findOne({ _id: req.body.receitaId, ativa: true }).populate('produtoId').populate('ingredientes.produtoId').session(session);
      if (!recipe) throw new Error('Receita não encontrada ou inativa');
      const batches = Number(req.body.quantidade);
      const consumption = recipe.ingredientes.map((item) => ({ product: item.produtoId, quantity: Number(item.quantidade) * batches, unit: item.unidade }));
      const snapshots = [];
      for (const item of consumption) {
        const updated = await Product.findOneAndUpdate({ _id: item.product._id, estoqueInsumos: { $gte: item.quantity } }, { $inc: { estoqueInsumos: -item.quantity } }, { new: true, session });
        if (!updated) throw new Error(`Insumo insuficiente: ${item.product.nome}`);
        snapshots.push({ produtoId: item.product._id, nome: item.product.nome, quantidade: item.quantity, unidade: item.unit });
        await StockMovement.create([{ produtoId: item.product._id, produtoNome: item.product.nome, tipo: 'saida', origem: 'insumos', destino: null, quantidade: item.quantity, observacao: `Consumo da receita ${recipe.nome}`, createdBy: req.user.id }], { session });
      }
      const output = recipe.rendimento * batches;
      await Product.findByIdAndUpdate(recipe.produtoId._id, { $inc: { estoque: output } }, { session });
      [production] = await Production.create([{ receitaId: recipe._id, receitaNome: recipe.nome, produtoId: recipe.produtoId._id, produtoNome: recipe.produtoId.nome, quantidade: batches, rendimentoTotal: output, unidadeRendimento: recipe.unidadeRendimento, insumos: snapshots, observacao: req.body.observacao, createdBy: req.user.id }], { session });
      await StockMovement.create([{ produtoId: recipe.produtoId._id, produtoNome: recipe.produtoId.nome, tipo: 'producao', origem: null, destino: 'venda', quantidade: output, referenciaId: production._id, observacao: `Produção da receita ${recipe.nome}`, createdBy: req.user.id }], { session });
    });
    res.status(201).json(production);
  } catch (error) { res.status(400).json({ msg: error.message }); } finally { await session.endSession(); }
});

router.get('/dashboard', async (req, res) => {
  try {
    const [products, recipes, recentProductions, lowStock] = await Promise.all([
      Product.find({ controladoComoInsumo: true }).select('nome codigo estoqueInsumos estoqueMinimoInsumos unidadeVenda'),
      Recipe.find({ ativa: true }).populate('produtoId', 'nome estoque unidadeVenda').populate('ingredientes.produtoId', 'nome estoqueInsumos'),
      Production.find().sort({ createdAt: -1 }).limit(10),
      Product.find({ controladoComoInsumo: true, $expr: { $lte: ['$estoqueInsumos', '$estoqueMinimoInsumos'] } }).select('nome codigo estoqueInsumos estoqueMinimoInsumos unidadeVenda'),
    ]);
    const possible = recipes.map((recipe) => {
      const quantities = recipe.ingredientes.map((item) => Number(item.produtoId?.estoqueInsumos || 0) / Number(item.quantidade || 1));
      const batches = quantities.length ? Math.floor(Math.min(...quantities) / Number(recipe.rendimento > 0 ? 1 : 1) * 1000) / 1000 : 0;
      return { receitaId: recipe._id, receitaNome: recipe.nome, produtoNome: recipe.produtoId?.nome, producoesPossiveis: batches, rendimentoPorProducao: recipe.rendimento, unidade: recipe.unidadeRendimento };
    });
    res.json({ estoqueInsumos: products, baixoEstoque: lowStock, receitasPossiveis: possible, producoesRecentes: recentProductions });
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

module.exports = router;