const express = require('express');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Comanda = require('../models/Comanda');
const { corrigirBolos, corrigirProdutosBolo } = require('../utils/corrigirBolos');
const HistoricoCusto = require('../models/HistoricoCusto');
const Recipe = require('../models/Recipe');
const { pesoPorUnidadeEmKg } = require('../utils/pesoProduto');
const { dadosEstoqueProduto, normalizarEstoqueLegado, produtoControlaPeso } = require('../utils/estoqueProduto');

const router = express.Router();
const units = ['un', 'kg', 'g', 'l', 'ml'];
const dataLocal = () => { const agora = new Date(); return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`; };
const antesDasOito = () => new Date().getHours() < 8;
const validations = [body('codigo').trim().notEmpty(), body('nome').trim().notEmpty(), body('preco').isFloat({ min: 0 }), body('custo').optional().isFloat({ min: 0 }), body('estoque').optional().isFloat({ min: 0 }), body('estoqueInsumos').optional().isFloat({ min: 0 }), body('estoqueMaximo').optional().isFloat({ min: 0.001 }), body('estoqueMinimoInsumos').optional().isFloat({ min: 0 }), body('unidadeVenda').optional().isIn(units), body('pesoPorUnidade').optional().isFloat({ min: 0 }), body('unidadePeso').optional().isIn(['kg', 'g']), body('vendidoFracionado').optional().isBoolean(), body('aFazer').optional().isBoolean(), body('producaoPropria').optional().isBoolean(), body('controladoComoInsumo').optional().isBoolean()];

router.get('/', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  try {
    const { search, categoria } = req.query;
    const query = {};
    if (search) query.$or = [{ nome: { $regex: search, $options: 'i' } }, { codigo: { $regex: search, $options: 'i' } }];
    if (categoria) query.categoria = categoria;
    const [produtos, receitas] = await Promise.all([
      Product.find(query).sort({ nome: 1 }),
      Recipe.find({ ativa: true }).select('_id produtoId').lean(),
    ]);
    const receitaPorProduto = new Map(receitas.map((receita) => [String(receita.produtoId), receita._id]));
    res.json(produtos.map((produto) => ({
      ...produto.toObject(),
      ...dadosEstoqueProduto(produto),
      receitaId: receitaPorProduto.get(String(produto._id)) || null,
      temReceita: receitaPorProduto.has(String(produto._id)),
    })));
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.get('/mais-vendidos', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  try {
    const limite = Math.min(Math.max(Number(req.query.limite) || 8, 1), 20);
    const ranking = await Order.aggregate([
      { $match: { status: { $ne: 'cancelado' } } },
      { $unwind: '$itens' },
      { $project: { produtoId: '$itens.produtoId', quantidade: { $cond: [{ $in: ['$itens.unidadeVenda', ['g', 'ml']] }, { $divide: ['$itens.quantidade', 1000] }, '$itens.quantidade'] } } },
      { $group: { _id: '$produtoId', quantidade: { $sum: '$quantidade' } } },
      { $sort: { quantidade: -1 } },
      { $limit: limite },
    ]);
    res.json(ranking.map((item) => ({ produtoId: item._id, quantidade: item.quantidade })));
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.post('/migracoes/corrigir-bolos-gramas', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const [pedidos, comandas, produtos] = await Promise.all([corrigirBolos(Order), corrigirBolos(Comanda), corrigirProdutosBolo(Product)]);
    res.json({ msg: 'Catálogo e histórico de bolos corrigidos.', itensCorrigidos: pedidos + comandas, produtosCorrigidos: produtos });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.post('/migracoes/normalizar-estoque-peso', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const produtos = await Product.find({ pesoPorUnidade: { $gt: 0 }, unidadeVenda: { $in: ['kg', 'g'] }, estoque: { $gt: 1000 } });
    let corrigidos = 0;
    for (const produto of produtos) {
      normalizarEstoqueLegado(produto);
      await produto.save();
      corrigidos += 1;
    }
    res.json({ msg: 'Estoques pesáveis normalizados.', produtosCorrigidos: corrigidos });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.get('/sem-custo', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 90);
    const produtosVendidos = await Order.aggregate([
      { $match: { status: { $ne: 'cancelado' }, createdAt: { $gte: dataLimite } } },
      { $unwind: '$itens' },
      { $group: { _id: '$itens.produtoId', quantidade: { $sum: '$itens.quantidade' } } },
    ]);
    const ids = produtosVendidos.filter((item) => item._id).map((item) => item._id);
    const produtos = await Product.find({ _id: { $in: ids }, custoUnitario: { $lte: 0 } }).select('nome codigo preco custoUnitario');
    res.json(produtos);
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

router.put('/:id/aplicar-preco', auth, auth.allowRoles('admin'), [body('preco').isFloat({ min: 0 })], async (req, res) => {
  try {
    const produto = await Product.findByIdAndUpdate(req.params.id, { $set: { preco: Number(req.body.preco), reajusteRecomendado: false } }, { new: true, runValidators: true });
    if (!produto) return res.status(404).json({ msg: 'Produto não encontrado' });
    res.json(produto);
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.get('/:id/historico-custo', auth, auth.allowRoles('admin'), async (req, res) => {
  try { res.json(await HistoricoCusto.find({ produtoId: req.params.id }).sort({ data: -1 }).limit(6).lean()); }
  catch (error) { res.status(500).json({ msg: error.message }); }
});

router.get('/reajuste-recomendado', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const produtos = await Product.find({ reajusteRecomendado: true }).select('nome codigo preco custoUnitario reajusteRecomendado');
    const lista = produtos.map((produto) => {
      const custo = Number(produto.custoUnitario || 0);
      const venda = Number(produto.preco || 0);
      const margem = venda > 0 ? ((venda - custo) / venda) * 100 : 0;
      return {
        _id: produto._id,
        nome: produto.nome,
        codigo: produto.codigo,
        custoAtual: custo,
        precoAtual: venda,
        margemAtual: margem,
      };
    });
    res.json(lista);
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

router.get('/:id/historico-custo', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const HistoricoCusto = require('../models/HistoricoCusto');
    const historico = await HistoricoCusto.find({ produtoId: req.params.id }).sort({ data: -1 });
    res.json(historico);
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

router.put('/:id/aplicar-preco', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const { precoVenda } = req.body;
    const produto = await Product.findById(req.params.id);
    if (!produto) return res.status(404).json({ msg: 'Produto não encontrado' });
    produto.preco = Number(precoVenda);
    await produto.save();
    res.json(produto);
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.get('/:id', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Produto não encontrado' });
    res.json({ ...product.toObject(), ...dadosEstoqueProduto(product) });
  } catch (_) { res.status(404).json({ msg: 'Produto não encontrado' }); }
});

router.post('/', auth, auth.allowRoles('admin'), validations, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const data = req.body;
    const exists = await Product.findOne({ codigo: { $regex: new RegExp(`^${data.codigo.trim()}$`, 'i') } });
    if (exists) return res.status(400).json({ msg: 'Já existe um produto com este código' });
    const estoque = Number(data.estoque) || 0;
    const estoqueInsumos = Number(data.estoqueInsumos) || 0;
    const fichaTecnica = Array.isArray(data.fichaTecnica) ? data.fichaTecnica.map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade), unidade: item.unidade })).filter((item) => item.produtoId && Number.isFinite(item.quantidade) && item.quantidade > 0 && units.includes(item.unidade)) : [];
    const custoUnitario = Number(data.custoUnitario ?? data.custo) || 0;
    const pesoPorUnidade = Number(data.pesoPorUnidade) || 0;
    const unidadeVenda = data.unidadeVenda || 'un';
    const estoquePesoKg = pesoPorUnidade > 0 && ['kg', 'g'].includes(unidadeVenda)
      ? estoque * (unidadeVenda === 'kg' ? pesoPorUnidade : pesoPorUnidade / 1000)
      : 0;
    const product = await Product.create({ codigo: data.codigo.trim(), nome: data.nome.trim(), categoria: data.categoria || 'Outros', preco: Number(data.preco), custo: custoUnitario, custoUnitario, estoque, estoquePesoKg, estoqueInsumos, estoqueInicialDia: estoque, estoqueInicialData: dataLocal(), estoqueInsumosInicial: estoqueInsumos, estoqueInsumosInicialData: dataLocal(), estoqueMinimoInsumos: Number(data.estoqueMinimoInsumos) || 0, unidadeVenda, pesoPorUnidade, unidadePeso: data.unidadePeso || 'kg', vendidoFracionado: Boolean(data.vendidoFracionado), aFazer: Boolean(data.aFazer), fichaTecnica, producaoPropria: Boolean(data.producaoPropria), controladoComoInsumo: Boolean(data.controladoComoInsumo), createdBy: req.user.id });
    res.status(201).json(product);
  } catch (err) { res.status(400).json({ msg: err.code === 11000 ? 'Código duplicado' : err.message }); }
});

router.put('/:id', auth, auth.allowRoles('admin'), [body('codigo').optional().trim().notEmpty(), body('nome').optional().trim().notEmpty(), body('preco').optional().isFloat({ min: 0 }), body('estoque').optional().isFloat({ min: 0 }), body('estoqueMaximo').optional().isFloat({ min: 0.001 }), body('unidadeVenda').optional().isIn(units), body('pesoPorUnidade').optional().isFloat({ min: 0 }), body('unidadePeso').optional().isIn(['kg', 'g']), body('vendidoFracionado').optional().isBoolean(), body('aFazer').optional().isBoolean(), body('fichaTecnica').optional().isArray()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const data = req.body;
    if (data.codigo) {
      const duplicate = await Product.findOne({ codigo: { $regex: new RegExp(`^${data.codigo.trim()}$`, 'i') }, _id: { $ne: req.params.id } });
      if (duplicate) return res.status(400).json({ msg: 'Já existe um produto com este código' });
    }
    const fields = {};
    ['codigo', 'nome', 'categoria', 'unidadeVenda'].forEach((key) => { if (data[key] !== undefined) fields[key] = String(data[key]).trim(); });
    ['preco', 'estoque', 'estoqueInsumos', 'estoqueMaximo', 'estoqueMinimoInsumos', 'pesoPorUnidade'].forEach((key) => { if (data[key] !== undefined) fields[key] = Number(data[key]); });
    if (data.unidadePeso !== undefined) fields.unidadePeso = data.unidadePeso;
    if (data.estoque !== undefined || data.pesoPorUnidade !== undefined || data.unidadeVenda !== undefined || data.unidadePeso !== undefined) {
      const atual = await Product.findById(req.params.id).select('estoque pesoPorUnidade unidadeVenda unidadePeso').lean();
      const estoque = Number(data.estoque ?? atual?.estoque ?? 0);
      const peso = Number(data.pesoPorUnidade ?? atual?.pesoPorUnidade ?? 0);
      const unidade = data.unidadeVenda || atual?.unidadeVenda;
      fields.estoquePesoKg = peso > 0 && ['kg', 'g'].includes(unidade) ? estoque * (unidade === 'kg' ? peso : peso / 1000) : 0;
    }
    if (data.custoUnitario !== undefined || data.custo !== undefined) {
      const receitaVinculada = await Recipe.exists({ produtoId: req.params.id, ativa: true });
      if (!receitaVinculada) {
        const custoUnitario = Number(data.custoUnitario ?? data.custo);
        fields.custoUnitario = custoUnitario;
        fields.custo = custoUnitario;
      }
    }
    ['vendidoFracionado', 'aFazer', 'producaoPropria', 'controladoComoInsumo'].forEach((key) => { if (data[key] !== undefined) fields[key] = Boolean(data[key]); });
    if (data.fichaTecnica !== undefined) fields.fichaTecnica = data.fichaTecnica.map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade), unidade: item.unidade }));
    if (data.estoque !== undefined && antesDasOito()) {
      fields.estoqueInicialDia = Number(data.estoque);
      fields.estoqueInicialData = dataLocal();
    }
    if (data.estoqueInsumos !== undefined && antesDasOito()) {
      fields.estoqueInsumosInicial = Number(data.estoqueInsumos);
      fields.estoqueInsumosInicialData = dataLocal();
    }
    const product = await Product.findByIdAndUpdate(req.params.id, { $set: fields }, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ msg: 'Produto não encontrado' });
    res.json({ ...product.toObject(), ...dadosEstoqueProduto(product) });
  } catch (err) { res.status(400).json({ msg: err.message }); }
});

router.delete('/:id', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Produto não encontrado' });
    res.json({ msg: 'Produto removido com sucesso' });
  } catch (err) { res.status(400).json({ msg: err.message }); }
});

module.exports = router;
