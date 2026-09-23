const express = require('express');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Product = require('../models/Product');
const Recipe = require('../models/Recipe');
const HistoricoCusto = require('../models/HistoricoCusto');
const StockMovement = require('../models/StockMovement');
const { converterCustoBase, calcularVariacaoPercentual } = require('../utils/custo');
const { calcularResumoCompleto, ajustarEstoque, calcularCustoUnitarioBase, calcularCustoDaFichaTecnica } = require('../utils/estoqueInsumo');
const { enfileirarRecalculoPorInsumo } = require('../utils/filaCusto');

const router = express.Router();

const normalizeUnit = (unit) => (['kg', 'L', 'un'].includes(unit) ? unit : unit === 'l' ? 'L' : 'kg');

const recalcularReceitasAfetadas = async (produtoId) => {
  const recipes = await Recipe.find({ ingredientes: { $elemMatch: { produtoId } } }).populate('ingredientes.produtoId').populate('produtoId');
  const afetados = [];

  for (const recipe of recipes) {
    const custoAntigo = Number(recipe.custoUnitario || 0);
    const resultado = await calcularCustoDaFichaTecnica(recipe.ingredientes);
    const tipoProduto = recipe.produtoId?.tipoProduto || (recipe.produtoId?.aFazer ? 'coz' : 'producao');
    const rendimento = tipoProduto === 'coz' ? 1 : Number(recipe.rendimento || 1);
    const disponivel = resultado.fonte === 'insumo';
    const custoInsumosTotal = disponivel ? Number(resultado.custoTotal) : 0;
    const custoUnitario = disponivel ? custoInsumosTotal / rendimento : 0;

    recipe.custoInsumosTotal = custoInsumosTotal;
    recipe.custoTotal = custoInsumosTotal;
    recipe.custoUnitario = custoUnitario;
    recipe.updatedAt = new Date();
    await recipe.save();

    const produto = await Product.findById(recipe.produtoId?._id || recipe.produtoId);
    if (produto) {
      produto.custo = custoUnitario;
      produto.custoUnitario = custoUnitario;
      produto.custoCalculado = disponivel ? custoUnitario : null;
      produto.dataUltimoCalculo = new Date();
      produto.fonteCalculo = resultado.fonte;
      produto.custoUltimoSalvo = disponivel ? custoUnitario : 0;
      produto.reajusteRecomendado = false;
      await produto.save();

      await HistoricoCusto.create({
        produtoId: produto._id,
        custoUnitario: custoUnitario,
        receitaId: recipe._id,
        motivo: 'atualizacao_insumo',
        data: new Date(),
      });
    }

    if (custoAntigo > 0) {
      const variacao = calcularVariacaoPercentual(custoAntigo, custoUnitario);
      afetados.push({
        produtoId: String(recipe.produtoId?._id || recipe.produtoId),
        nome: recipe.produtoId?.nome || produto?.nome || 'Produto',
        custoAntigo,
        custoNovo: custoUnitario,
        variacaoPercentual: variacao,
      });
    }
  }

  return afetados;
};

router.use(auth);
router.use(auth.allowRoles('admin'));

router.put('/:id/preco-compra', [body('precoCompra').isFloat({ min: 0 }), body('unidadeCompra').optional().custom((value) => ['kg', 'L', 'un'].includes(value) || value === 'l')], async (req, res) => {
  try {
    const produto = await Product.findById(req.params.id);
    if (!produto) return res.status(404).json({ msg: 'Insumo não encontrado' });

    const unidadeCompra = normalizeUnit(req.body.unidadeCompra || produto.unidadeCompra || 'kg');
    const precoCompra = Number(req.body.precoCompra ?? produto.precoCompra ?? 0);
    const custoUnitarioBase = calcularCustoUnitarioBase(precoCompra, produto.conteudoPorEmbalagem, produto.unidadeConteudo) || converterCustoBase(precoCompra, unidadeCompra, 'g');

    produto.precoCompra = precoCompra;
    produto.unidadeCompra = unidadeCompra;
    produto.custoUnitarioBase = custoUnitarioBase;
    await produto.save();
    enfileirarRecalculoPorInsumo(produto._id);
    res.status(202).json({ produto, recalculoEnfileirado: true });
  } catch (error) {
    res.status(400).json({ msg: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const produto = await Product.findById(req.params.id);
    if (!produto) return res.status(404).json({ msg: 'Insumo não encontrado' });
    res.json({ ...produto.toObject(), resumo: calcularResumoCompleto(produto) });
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

router.get('/:id/historico', async (req, res) => {
  try {
    const produto = await Product.findById(req.params.id);
    if (!produto) return res.status(404).json({ msg: 'Insumo não encontrado' });
    const movimentos = await StockMovement.find({ produtoId: produto._id })
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ produto: produto.nome, movimentos });
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

router.post('/:id/movimentar', [
  body('quantidadeEmbalagens').isFloat({ min: -1000000 }),
  body('motivo').trim().notEmpty().withMessage('Informe a justificativa do ajuste de inventário'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const session = await require('mongoose').startSession();
  try {
    let resultado;
    await session.withTransaction(async () => {
      const produto = await Product.findById(req.params.id).session(session);
      if (!produto) throw new Error('Insumo não encontrado');
      if (produto.tipo !== 'insumo') throw new Error('O produto selecionado não é um insumo');
      const delta = Number(req.body.quantidadeEmbalagens);
      if (delta === 0) throw new Error('Informe uma quantidade diferente de zero');
      resultado = ajustarEstoque(produto, delta);
      await produto.save({ session });
      await StockMovement.create([{
        produtoId: produto._id,
        produtoNome: produto.nome,
        tipo: delta > 0 ? 'entrada' : 'saida',
        quantidade: Math.abs(delta),
        unidade: 'embalagem',
        quantidadePecas: Math.abs(delta),
        observacao: req.body.motivo || null,
        createdBy: req.user.id,
      }], { session });
    });
    res.json({ produtoId: req.params.id, ...resultado });
  } catch (error) {
    res.status(400).json({ msg: error.message });
  } finally {
    await session.endSession();
  }
});

module.exports = router;
