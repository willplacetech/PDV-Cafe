const express = require('express');
const auth = require('../middleware/auth');
const Product = require('../models/Product');
const { listarEstoqueBaixo } = require('../utils/estoqueBaixo');
const { produtoControlaPeso, estoquePesoAtualKg } = require('../utils/estoqueProduto');

const router = express.Router();

router.use(auth, auth.allowRoles('admin', 'gerente'));

router.get('/baixo', async (req, res) => {
  const limiteInformado = req.query.limite === undefined ? 5 : Number(req.query.limite);
  if (!Number.isInteger(limiteInformado) || limiteInformado < 1 || limiteInformado > 100) {
    return res.status(400).json({ msg: 'Limite deve ser um inteiro entre 1 e 100' });
  }

  try {
    const produtos = await Product.find({ ativo: { $ne: false } })
      .select('_id nome tipo tipoProduto categoria aFazer estoque estoquePesoKg estoquePesoNormalizado pesoPorUnidade estoqueMinimo estoqueMinimoBase estoqueMinimoEmbalagens estoqueEmbalagens estoqueInsumos estoqueConteudoAberto conteudoPorEmbalagem unidade unidadeCompra unidadeConteudo unidadeVenda')
      .lean();
    const estoqueBaixo = listarEstoqueBaixo(produtos);
    res.set('X-Total-Count', String(estoqueBaixo.length));
    return res.json(estoqueBaixo.slice(0, limiteInformado).map(({ produto, qtdAtual, minimo, unidade }) => ({
      id: produto._id,
      nome: produto.nome,
      qtdAtual,
      minimo,
      unidade,
      tipo: produto.tipo,
      estoqueReposicao: Number(produto.tipo === 'insumo'
        ? produto.estoqueEmbalagens ?? produto.estoqueInsumos ?? produto.estoque ?? 0
        : produtoControlaPeso(produto) ? estoquePesoAtualKg(produto) : produto.estoque || 0),
      unidadeReposicao: produto.tipo === 'insumo' ? 'embalagem(ns)' : (produtoControlaPeso(produto) ? 'kg' : produto.unidadeVenda || 'un'),
      tipoReposicao: produto.tipo === 'insumo' ? 'embalagem' : (produtoControlaPeso(produto) ? 'peso' : 'estoque'),
    })));
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
});

module.exports = router;
