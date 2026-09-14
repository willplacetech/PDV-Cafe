const express = require('express');
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const Recipe = require('../models/Recipe');
const Product = require('../models/Product');
const HistoricoCusto = require('../models/HistoricoCusto');
const { calcularCustoReceita, calcularMargem } = require('../utils/custo');

const router = express.Router();

const precosSugeridos = (custoUnitario) => ({
  markup2x: custoUnitario * 2,
  markup2_5x: custoUnitario * 2.5,
  markup3x: custoUnitario * 3,
  margem50: custoUnitario / (1 - 0.5),
  margem60: custoUnitario / (1 - 0.6),
  margem70: custoUnitario / (1 - 0.7),
});

router.use(auth);
router.use(auth.allowRoles('admin'));

router.post('/:id/calcular-custo', [
  body('custoEmbalagem').optional().isFloat({ min: 0 }),
  body('custoIndireto').optional().isFloat({ min: 0 }),
  body('maoDeObra').optional().isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id).populate('ingredientes.produtoId').populate('produtoId');
    if (!recipe) return res.status(404).json({ msg: 'Receita não encontrada' });

    const custoEmbalagem = Number(req.body.custoEmbalagem ?? recipe.custoEmbalagem ?? 0);
    const custoIndireto = Number(req.body.custoIndireto ?? recipe.custoIndireto ?? 0);
    const maoDeObra = Number(req.body.maoDeObra ?? recipe.maoDeObra ?? 0);

    const ingredientes = (recipe.ingredientes || []).map((item) => ({
      quantidade: Number(item.quantidade || 0),
      unidade: item.unidade,
      custoUnitarioBase: Number(item.produtoId?.custoUnitarioBase || 0),
    }));

    const resultado = calcularCustoReceita(ingredientes, custoEmbalagem, custoIndireto, maoDeObra, Number(recipe.rendimento || 1));
    recipe.custoInsumosTotal = resultado.custoInsumosTotal;
    recipe.custoEmbalagem = custoEmbalagem;
    recipe.custoIndireto = custoIndireto;
    recipe.maoDeObra = maoDeObra;
    recipe.custoTotal = resultado.custoTotal;
    recipe.custoUnitario = resultado.custoUnitario;
    await recipe.save();

    const produto = await Product.findById(recipe.produtoId);
    if (produto) {
      produto.custo = resultado.custoUnitario;
      produto.custoUnitario = resultado.custoUnitario;
      produto.reajusteRecomendado = false;
      await produto.save();
    }

    await HistoricoCusto.create({
      produtoId: recipe.produtoId,
      custoUnitario: resultado.custoUnitario,
      receitaId: recipe._id,
      motivo: 'alteracao_receita',
      data: new Date(),
    });

    const sugeridos = precosSugeridos(resultado.custoUnitario);
    const margemAtual = produto?.preco ? calcularMargem(resultado.custoUnitario, Number(produto.preco || 0)) : 0;

    res.json({
      ...resultado,
      custoEmbalagem,
      custoIndireto,
      maoDeObra,
      margemAtual,
      precoSugeridoMarkup3x: sugeridos.markup3x,
      precoSugeridoMargem60: sugeridos.margem60,
      sugeridos,
      produto,
    });
  } catch (error) {
    res.status(400).json({ msg: error.message });
  }
});

router.get('/:id/historico-custo', async (req, res) => {
  try {
    const history = await HistoricoCusto.find({ produtoId: req.params.id }).sort({ data: 1 }).lean();
    res.json(history);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

module.exports = router;
