const express = require('express');
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const Product = require('../models/Product');
const Recipe = require('../models/Recipe');
const HistoricoCusto = require('../models/HistoricoCusto');
const { converterCustoBase, quantidadeNaBase, calcularVariacaoPercentual } = require('../utils/custo');

const router = express.Router();

const normalizeUnit = (unit) => (['kg', 'g', 'l', 'ml', 'un', 'dz'].includes(unit) ? unit : 'kg');

const recalcularReceitasAfetadas = async (produtoId) => {
  const recipes = await Recipe.find({ ingredientes: { $elemMatch: { produtoId } } }).populate('ingredientes.produtoId').populate('produtoId');
  const afetados = [];

  for (const recipe of recipes) {
    const custoAntigo = Number(recipe.custoUnitario || 0);
    const ingredientes = recipe.ingredientes.map((item) => ({
      quantidade: Number(item.quantidade || 0),
      unidade: item.unidade,
      custoUnitarioBase: Number(item.produtoId?.custoUnitarioBase || 0),
    }));

    const custoInsumosTotal = ingredientes.reduce((soma, item) => soma + quantidadeNaBase(item.quantidade, item.unidade) * item.custoUnitarioBase, 0);
    const custoTotal = custoInsumosTotal + Number(recipe.custoEmbalagem || 0) + Number(recipe.custoIndireto || 0) + Number(recipe.maoDeObra || 0);
    const custoUnitario = recipe.rendimento > 0 ? custoTotal / Number(recipe.rendimento) : 0;

    recipe.custoInsumosTotal = custoInsumosTotal;
    recipe.custoTotal = custoTotal;
    recipe.custoUnitario = custoUnitario;
    recipe.updatedAt = new Date();
    await recipe.save();

    const produto = await Product.findById(recipe.produtoId?._id || recipe.produtoId);
    if (produto) {
      produto.custo = custoUnitario;
      produto.custoUnitario = custoUnitario;
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

router.put('/:id/preco-compra', [body('precoCompra').isFloat({ min: 0 }), body('unidadeCompra').optional().isIn(['kg', 'g', 'l', 'ml', 'un', 'dz'])], async (req, res) => {
  try {
    const produto = await Product.findById(req.params.id);
    if (!produto) return res.status(404).json({ msg: 'Insumo não encontrado' });

    const unidadeCompra = normalizeUnit(req.body.unidadeCompra || produto.unidadeCompra || 'kg');
    const precoCompra = Number(req.body.precoCompra ?? produto.precoCompra ?? 0);
    const custoUnitarioBase = converterCustoBase(precoCompra, unidadeCompra, 'g');

    produto.precoCompra = precoCompra;
    produto.unidadeCompra = unidadeCompra;
    produto.custoUnitarioBase = custoUnitarioBase;
    await produto.save();

    const afetados = await recalcularReceitasAfetadas(produto._id);
    const comReajuste = afetados.filter((item) => Math.abs(Number(item.variacaoPercentual || 0)) > 5);
    for (const item of comReajuste) {
      const p = await Product.findById(item.produtoId);
      if (p) {
        p.reajusteRecomendado = true;
        await p.save();
      }
    }

    res.json({ produto, afetados, reajusteRecomendado: comReajuste.length > 0 });
  } catch (error) {
    res.status(400).json({ msg: error.message });
  }
});

module.exports = router;
