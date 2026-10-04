const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const StockMovement = require('../models/StockMovement');
const HistoricoCusto = require('../models/HistoricoCusto');
const { UNIDADES_PERMITIDAS, normalizarUnidade, validarQuantidadeCompra } = require('../utils/unidades');
const { paraBase, estoqueTotalBase } = require('../utils/estoqueInsumo');
const { normalizarEstoqueLegado, produtoControlaPeso } = require('../utils/estoqueProduto');

const router = express.Router();
const units = UNIDADES_PERMITIDAS;
const costingMethods = ['media_ponderada', 'ultimo_preco'];

const validate = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return true;
  res.status(400).json({ errors: errors.array() });
  return false;
};

const quantidadeBase = (quantidade, unidade) => {
  const unidadeNormalizada = normalizarUnidade(unidade);
  if (!units.includes(unidadeNormalizada)) throw new Error(`Unidade de conteúdo inválida: ${unidade}`);
  return paraBase(quantidade, unidadeNormalizada);
};

router.use(auth);
router.use(auth.allowRoles('admin'));

router.get('/', async (req, res) => {
  try {
    const compras = await Purchase.find()
      .populate('itens.produtoId', 'nome codigo unidadeConteudo conteudoPorEmbalagem')
      .populate('createdBy', 'username')
      .sort({ data: -1, createdAt: -1 })
      .limit(200);
    res.json(compras);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const compra = await Purchase.findById(req.params.id)
      .populate('itens.produtoId', 'nome codigo unidadeConteudo conteudoPorEmbalagem')
      .populate('createdBy', 'username');
    if (!compra) return res.status(404).json({ msg: 'Compra não encontrada' });
    res.json(compra);
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ msg: 'ID inválido' });
    res.status(500).json({ msg: error.message });
  }
});

router.post('/', [
  body('fornecedor').trim().notEmpty(),
  body('numeroNF').trim().notEmpty(),
  body('data').isISO8601(),
  body('metodoCusteio').isIn(costingMethods),
  body('itens').isArray({ min: 1 }),
  body('itens.*.produtoId').isMongoId(),
  body('itens.*.valorTotal').isFloat({ min: 0.000001 }),
  body('itens.*.qtdEmbalagens').isFloat({ min: 0.000001 }),
  body('itens.*.conteudoPorEmbalagem').isFloat({ min: 0.000001 }),
  body('itens.*.unidadeConteudo').isIn(units),
  body('itens').custom((itens) => Array.isArray(itens) && itens.every((item) => (
    validarQuantidadeCompra(item.qtdEmbalagens, item.conteudoPorEmbalagem, item.unidadeConteudo)
  ))).withMessage('Quantidade comprada inválida para a unidade informada'),
], async (req, res) => {
  if (!validate(req, res)) return;

  const session = await mongoose.startSession();
  try {
    let compra;
    await session.withTransaction(async () => {
      const ids = req.body.itens.map((item) => item.produtoId);
      const produtos = await Product.find({ _id: { $in: ids } }).session(session);
      const produtosPorId = new Map(produtos.map((produto) => [String(produto._id), produto]));
      const itens = [];

      for (const item of req.body.itens) {
        const produto = produtosPorId.get(String(item.produtoId));
        if (!produto) throw new Error('Produto não encontrado');
        const valorTotal = Number(item.valorTotal);
        const qtdEmbalagens = Number(item.qtdEmbalagens);
        const conteudoPorEmbalagem = Number(item.conteudoPorEmbalagem);
        const quantidadeTotal = Number((qtdEmbalagens * conteudoPorEmbalagem).toFixed(6));
        const quantidadeTotalBase = quantidadeBase(quantidadeTotal, item.unidadeConteudo);
        const custoUnitario = valorTotal / quantidadeTotalBase;
        const estoqueAtualBase = estoqueTotalBase(produto);
        const conteudoAtualBase = quantidadeBase(produto.conteudoPorEmbalagem || 0, produto.unidadeConteudo || produto.unidadeVenda || 'un');
        const conteudoNovoBase = quantidadeBase(conteudoPorEmbalagem, item.unidadeConteudo);
        const saldoExistente = estoqueAtualBase > 0 || Number(produto.estoque || 0) > 0 || Number(produto.estoqueEmbalagens || produto.estoqueInsumos || 0) > 0 || Number(produto.estoqueConteudoAberto || 0) > 0;
        if (saldoExistente && (conteudoAtualBase !== conteudoNovoBase || normalizarUnidade(produto.unidadeConteudo) !== normalizarUnidade(item.unidadeConteudo))) {
          throw new Error('A embalagem nao pode mudar enquanto existir saldo. Cadastre outro produto para a nova embalagem.');
        }
        const custoAtual = Number(produto.custoUnitarioBase || 0);
        const custoNovo = req.body.metodoCusteio === 'ultimo_preco'
          ? custoUnitario
          : (estoqueAtualBase > 0 && custoAtual > 0
            ? ((estoqueAtualBase * custoAtual) + valorTotal) / (estoqueAtualBase + quantidadeTotalBase)
            : custoUnitario);

        produto.conteudoPorEmbalagem = conteudoPorEmbalagem;
        produto.unidadeConteudo = item.unidadeConteudo;
        if (produto.tipo === 'venda') {
          if (produtoControlaPeso(produto)) normalizarEstoqueLegado(produto);
          produto.estoque = Number(produto.estoque || 0) + qtdEmbalagens;
          if (produtoControlaPeso(produto)) produto.estoquePesoKg = Number(produto.estoquePesoKg || 0) + quantidadeTotalBase / 1000;
        } else {
          produto.estoqueEmbalagens = Number(produto.estoqueEmbalagens || produto.estoqueInsumos || 0) + qtdEmbalagens;
          produto.estoqueInsumos = produto.estoqueEmbalagens;
        }
        produto.precoCompra = valorTotal / qtdEmbalagens;
        produto.custoUnitarioBase = custoNovo;
        await produto.save({ session });

        itens.push({ produtoId: produto._id, valorTotal, qtdEmbalagens, conteudoPorEmbalagem, unidadeConteudo: item.unidadeConteudo, quantidadeTotal, custoUnitario });
      }

      const valorTotalCompra = itens.reduce((total, item) => total + item.valorTotal, 0);
      [compra] = await Purchase.create([{
        fornecedor: req.body.fornecedor,
        numeroNF: req.body.numeroNF,
        data: new Date(req.body.data),
        metodoCusteio: req.body.metodoCusteio,
        itens,
        valorTotal: valorTotalCompra,
        createdBy: req.user.id,
      }], { session });

      for (const item of itens) {
        const produto = produtosPorId.get(String(item.produtoId));
        await StockMovement.create([{
          produtoId: produto._id,
          produtoNome: produto.nome,
          tipo: 'entrada',
          origem: 'externo',
          destino: produto.tipo === 'venda' ? 'venda' : 'insumos',
          quantidade: item.qtdEmbalagens,
          quantidadePecas: item.qtdEmbalagens,
          unidade: produto.unidadeVenda || 'embalagem',
          referenciaId: compra._id,
          observacao: `Compra NF ${req.body.numeroNF}`,
          createdBy: req.user.id,
        }], { session });
        await HistoricoCusto.create([{
          produtoId: produto._id,
          custoUnitario: produto.custoUnitarioBase,
          motivo: 'compra',
          data: new Date(req.body.data),
        }], { session });
      }
    });
    res.status(201).json(await compra.populate('itens.produtoId', 'nome codigo'));
  } catch (error) {
    res.status(400).json({ msg: error.message });
  } finally {
    await session.endSession();
  }
});

module.exports = router;
