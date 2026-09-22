const express = require('express');
const mongoose = require('mongoose');
const Comanda = require('../models/Comanda');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const StockMovement = require('../models/StockMovement');
const auth = require('../middleware/auth');
const { obterTaxasCartao, calcularPagamento } = require('../utils/taxasCartao');
const { precoPorUnidade } = require('../utils/pesoProduto');
const { normalizarEstoqueLegado, produtoControlaPeso, dadosMovimentoEstoque } = require('../utils/estoqueProduto');
const { calcularPrecoComDesconto, calcularPrecoGrupo } = require('../utils/descontosQuantidade');
const { consumirInsumo, reporInsumo } = require('../utils/estoqueInsumo');

const router = express.Router();
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const permiteFracionar = (product) => !Number(product?.pesoPorUnidade) && (Boolean(product?.vendidoFracionado) || ['kg', 'L'].includes(product?.unidadeVenda));

const calcularStatusPagamentoComanda = (comanda) => {
  const valorTotal = Number(comanda?.valorTotal || comanda?.total || 0);
  const historicoPagamentos = Array.isArray(comanda?.historicoPagamentos) ? comanda.historicoPagamentos : [];
  const valorPago = historicoPagamentos.reduce((soma, pagamento) => soma + Number(pagamento?.valor || 0), 0);
  const saldoDevedor = Math.max(0, valorTotal - valorPago);

  let statusPagamento = 'pendente';
  if (valorTotal <= 0) statusPagamento = 'quitado';
  else if (valorPago <= 0) statusPagamento = 'pendente';
  else if (valorPago >= valorTotal) statusPagamento = 'quitado';
  else statusPagamento = 'parcial';

  return { valorTotal, valorPago, saldoDevedor, statusPagamento };
};

async function recalcularPrecosComanda(comanda, session) {
  const ids = [...new Set(comanda.itens.map((item) => String(item.produtoId)))];
  const produtos = await Product.find({ _id: { $in: ids } }).session(session);
  const porId = new Map(produtos.map((produto) => [String(produto._id), produto]));
  const quantidades = new Map();
  comanda.itens.forEach((item) => quantidades.set(String(item.produtoId), (quantidades.get(String(item.produtoId)) || 0) + Number(item.quantidade || 0)));
  const cartItens = comanda.itens.map((item) => ({ produto: porId.get(String(item.produtoId)), quantidade: Number(item.quantidade || 0) }));
  comanda.itens.forEach((item) => {
    const produto = porId.get(String(item.produtoId));
    if (!produto || item.tipoVenda === 'peso') return;
    const precoBase = precoPorUnidade(produto);
    const pricing = calcularPrecoComDesconto(produto, quantidades.get(String(item.produtoId)), precoBase);
    const grupoPricing = calcularPrecoGrupo(produto, quantidades.get(String(item.produtoId)), cartItens, pricing.precoUnitario);
    if (grupoPricing && grupoPricing.grupoAtivo && grupoPricing.precoUnitario < pricing.precoUnitario) {
      item.precoUnitario = grupoPricing.precoUnitario;
      item.precoUnitarioOriginal = grupoPricing.precoNormal;
      item.descontoQuantidade = grupoPricing.economiaUnitario;
      item.economiaQuantidade = grupoPricing.economiaTotal;
      item.faixaDescontoQuantidade = null;
      item.grupoDescontoAtivo = true;
      item.totalGrupo = grupoPricing.totalGrupo;
      item.faltamParaGrupo = 0;
    } else {
      item.precoUnitario = pricing.precoUnitario;
      item.precoUnitarioOriginal = pricing.precoNormal;
      item.descontoQuantidade = pricing.economiaUnitario;
      item.economiaQuantidade = pricing.economiaTotal;
      item.faixaDescontoQuantidade = pricing.faixaAplicada?.quantidadeMinima;
      item.grupoDescontoAtivo = false;
      item.totalGrupo = grupoPricing?.totalGrupo || 0;
      item.faltamParaGrupo = grupoPricing?.faltamParaGrupo || 0;
    }
  });
}

async function ajustarEstoque(itens, operacao, session) {
  const idsDosItens = itens.map((item) => item.produtoId);
  const produtosVenda = await Product.find({ _id: { $in: idsDosItens } }).session(session);
  const idsDosIngredientes = produtosVenda.filter((produto) => (produto.tipoProduto || (produto.aFazer ? 'coz' : 'revenda')) === 'coz').flatMap((produto) => (produto.fichaTecnica || []).map((ingrediente) => ingrediente.produtoId));
  const produtos = idsDosIngredientes.length
    ? await Product.find({ _id: { $in: [...idsDosItens, ...idsDosIngredientes] } }).session(session)
    : produtosVenda;
  const porId = new Map(produtos.map((produto) => [String(produto._id), produto]));
  const totais = new Map();
  const insumos = [];
  itens.forEach((item) => {
    const quantidade = Number(item.quantidade || 0);
    const produto = porId.get(String(item.produtoId));
    if (produto) normalizarEstoqueLegado(produto);
    const ficha = item.insumosConsumidos?.length ? item.insumosConsumidos : produto?.fichaTecnica;
    if (produto && (produto.tipoProduto || (produto.aFazer ? 'coz' : 'revenda')) === 'coz' && ficha?.length) {
      ficha.forEach((ingrediente) => {
        const ingredienteProduto = porId.get(String(ingrediente.produtoId));
        if (!ingredienteProduto) throw new Error(`Ingrediente não encontrado para ${produto.nome}`);
        insumos.push({ produto: ingredienteProduto, quantidade: Number(ingrediente.quantidade) * quantidade, unidade: ingrediente.unidade, produtoVenda: produto });
      });
    } else {
      const key = String(item.produtoId);
      const movimento = dadosMovimentoEstoque(produto, item);
      const atual = totais.get(key) || { pecas: 0, pesoKg: 0 };
      totais.set(key, { pecas: atual.pecas + movimento.pecas, pesoKg: atual.pesoKg + movimento.pesoKg });
    }
  });
  for (const produto of porId.values()) {
    if (produto.isModified('estoque') || produto.isModified('estoquePesoKg')) await produto.save({ session });
  }
  for (const [produtoId, movimento] of totais) {
    const produto = porId.get(String(produtoId));
    if (operacao === 'baixar') {
      const filtro = produtoControlaPeso(produto)
        ? { _id: produtoId, estoque: { $gte: movimento.pecas }, estoquePesoKg: { $gte: movimento.pesoKg } }
        : { _id: produtoId, estoque: { $gte: movimento.pecas } };
      const inc = produtoControlaPeso(produto)
        ? { $inc: { estoque: -movimento.pecas, estoquePesoKg: -movimento.pesoKg } }
        : { $inc: { estoque: -movimento.pecas } };
      const product = await Product.findOneAndUpdate(filtro, inc, { new: true, session });
      if (!product) throw new Error(`Estoque insuficiente para o produto ${produtoId}`);
    } else {
      const inc = produtoControlaPeso(produto)
        ? { $inc: { estoque: movimento.pecas, estoquePesoKg: movimento.pesoKg } }
        : { $inc: { estoque: movimento.pecas } };
      await Product.findByIdAndUpdate(produtoId, inc, { session });
    }
    await StockMovement.create([{
      produtoId,
      produtoNome: produto?.nome || produtoId,
      tipo: operacao === 'baixar' ? 'saida' : 'entrada',
      origem: operacao === 'baixar' ? 'venda' : null,
      destino: operacao === 'baixar' ? null : 'venda',
      quantidade: Math.max(0.001, movimento.pesoKg || movimento.pecas),
      quantidadePecas: movimento.pecas,
      pesoKg: movimento.pesoKg,
      tipoVenda: movimento.pesoKg > 0 && movimento.pecas === 0 ? 'peso' : (produtoControlaPeso(produto) ? 'inteiro' : 'unidade'),
      createdBy: null,
    }], { session });
  }
  for (const consumo of insumos) {
    const { produto, quantidade, unidade, produtoVenda } = consumo;
    if (operacao === 'baixar') {
      if (!produtoVenda.permitirVendaSemInsumo) consumirInsumo(produto, quantidade, unidade);
    } else {
      reporInsumo(produto, quantidade, unidade);
    }
    await produto.save({ session });
    if (operacao === 'baixar' && !produtoVenda.permitirVendaSemInsumo) {
      await StockMovement.create([{
        produtoId: produto._id,
        produtoNome: produto.nome,
        tipo: 'saida',
        origem: 'venda',
        destino: null,
        quantidade,
        unidade,
        observacao: `Consumo do produto Coz ${produtoVenda.nome}`,
        createdBy: null,
      }], { session });
    }
  }
}

router.get('/', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const { dataInicio, dataFim } = req.query;
    if (dataInicio || dataFim) {
      const inicio = dataInicio ? new Date(`${dataInicio}T00:00:00.000Z`) : null;
      const fim = dataFim ? new Date(`${dataFim}T23:59:59.999Z`) : null;
      if ((inicio && Number.isNaN(inicio.getTime())) || (fim && Number.isNaN(fim.getTime()))) {
        return res.status(400).json({ msg: 'Período inválido' });
      }
      filter.createdAt = {};
      if (inicio) filter.createdAt.$gte = inicio;
      if (fim) filter.createdAt.$lte = fim;
    }
    res.json(await Comanda.find(filter).sort({ createdAt: -1 }));
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.get('/cozinha', auth, auth.allowRoles('admin', 'operador', 'cozinha'), async (req, res) => {
  try {
    const comandas = await Comanda.find({ status: 'aberta', 'itens.aFazer': true }).sort({ createdAt: 1 });
    res.json(comandas.map((comanda) => ({ ...comanda.toObject(), itens: comanda.itens.filter((item) => item.aFazer) })));
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.post('/', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const requestItens = Array.isArray(req.body.itens) ? req.body.itens : [];
    const quantidadesPorProduto = new Map();
    requestItens.forEach((item) => {
      quantidadesPorProduto.set(String(item.produtoId), (quantidadesPorProduto.get(String(item.produtoId)) || 0) + Number(item.quantidade || 0));
    });
    const productIds = [...new Set(requestItens.map((item) => item.produtoId))];
    const produtos = await Product.find({ _id: { $in: productIds } }).session(session);
    const porId = new Map(produtos.map((produto) => [String(produto._id), produto]));
    const cartItens = [];
    const itens = [];
    for (const item of requestItens) {
      const product = porId.get(String(item.produtoId));
      const vendaPorPeso = produtoControlaPeso(product) && item.tipoVenda === 'peso';
      const pesoVendidoKg = vendaPorPeso ? Number(item.pesoVendidoKg) : 0;
      const quantidade = vendaPorPeso ? 1 : Number(item.quantidade);
      if (!product || !Number.isFinite(quantidade) || quantidade < 0.001) throw new Error('Item inválido');
      if (vendaPorPeso && (!Number.isFinite(pesoVendidoKg) || pesoVendidoKg <= 0)) throw new Error('Informe o peso vendido');
      if (!permiteFracionar(product) && !Number.isInteger(quantidade)) throw new Error(`O produto "${product.nome}" é vendido somente por unidade`);
      const modificadores = Array.isArray(item.modificadores)
        ? item.modificadores.filter((value) => typeof value === 'string').slice(0, 10)
        : [];
      const precoNormal = vendaPorPeso ? money(pesoVendidoKg * Number(product.preco || 0)) : precoPorUnidade(product);
      const pricing = vendaPorPeso ? { precoUnitario: precoNormal, precoNormal, economiaUnitario: 0, economiaTotal: 0, faixaAplicada: null } : calcularPrecoComDesconto(product, quantidadesPorProduto.get(String(product._id)), precoNormal);
      cartItens.push({ produto: product, quantidade });
      itens.push({ produtoId: product.id, codigo: product.codigo, nome: product.nome, precoUnitario: pricing.precoUnitario, precoUnitarioOriginal: pricing.precoNormal, descontoQuantidade: pricing.economiaUnitario, economiaQuantidade: pricing.economiaTotal, faixaDescontoQuantidade: pricing.faixaAplicada?.quantidadeMinima, quantidade, quantidadePecas: vendaPorPeso ? 0 : quantidade, pesoVendidoKg: vendaPorPeso ? pesoVendidoKg : undefined, tipoVenda: vendaPorPeso ? 'peso' : (produtoControlaPeso(product) ? 'inteiro' : 'unidade'), unidadeVenda: product.unidadeVenda, pesoPorUnidade: product.pesoPorUnidade, unidadePeso: product.unidadePeso, modificadores, aFazer: Boolean(product.aFazer), insumosConsumidos: (product.fichaTecnica || []).map((ingrediente) => ({ produtoId: ingrediente.produtoId, quantidade: ingrediente.quantidade, unidade: ingrediente.unidade })) });
    }
    cartItens.forEach((cartItem, idx) => {
      const product = cartItem.produto;
      const item = itens[idx];
      if (item.tipoVenda === 'peso' || item.tipoVenda === 'inteiro') return;
      const grupoPricing = calcularPrecoGrupo(product, quantidadesPorProduto.get(String(product._id)), cartItens, item.precoUnitario);
      if (grupoPricing && grupoPricing.grupoAtivo && grupoPricing.precoUnitario < item.precoUnitario) {
        item.precoUnitario = grupoPricing.precoUnitario;
        item.precoUnitarioOriginal = grupoPricing.precoNormal;
        item.descontoQuantidade = grupoPricing.economiaUnitario;
        item.economiaQuantidade = grupoPricing.economiaTotal;
        item.faixaDescontoQuantidade = null;
        item.grupoDescontoAtivo = true;
        item.totalGrupo = grupoPricing.totalGrupo;
        item.faltamParaGrupo = 0;
      } else if (grupoPricing) {
        item.grupoDescontoAtivo = false;
        item.totalGrupo = grupoPricing.totalGrupo;
        item.faltamParaGrupo = grupoPricing.faltamParaGrupo;
      }
    });
    await ajustarEstoque(itens, 'baixar', session);
    const tipoAtendimento = req.body.tipoAtendimento === 'balcao' ? 'balcao' : 'mesa';
    const valorTotal = money(itens.reduce((sum, item) => sum + item.precoUnitario * item.quantidade, 0));
    const [comanda] = await Comanda.create([{ clienteId: req.body.clienteId || undefined, clienteNome: req.body.clienteNome || 'Cliente não identificado', observacao: req.body.observacao, mesa: req.body.mesa, tipoAtendimento, statusBalcao: tipoAtendimento === 'balcao' ? 'aguardando' : undefined, itens, valorTotal, saldoDevedor: valorTotal, statusPagamento: 'pendente', estoqueBaixado: itens.length > 0, atendente: req.user.username }], { session });
    await session.commitTransaction();
    res.status(201).json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/balcao/status', auth, auth.allowRoles('admin', 'operador', 'cozinha'), async (req, res) => {
  try {
    const statuses = ['aguardando', 'preparando', 'pronto', 'pago', 'entregue'];
    if (!statuses.includes(req.body.status)) return res.status(400).json({ msg: 'Status de balcão inválido' });
    const comanda = await Comanda.findOneAndUpdate({ _id: req.params.id, tipoAtendimento: 'balcao', status: 'aberta' }, { $set: { statusBalcao: req.body.status } }, { new: true });
    if (!comanda) return res.status(404).json({ msg: 'Pedido de balcão não encontrado ou já fechado' });
    res.json(comanda);
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.post('/:id/itens', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    const product = await Product.findById(req.body.produtoId).session(session);
    const vendaPorPeso = produtoControlaPeso(product) && req.body.tipoVenda === 'peso';
    const pesoVendidoKg = vendaPorPeso ? Number(req.body.pesoVendidoKg) : 0;
    const quantidade = vendaPorPeso ? 1 : Number(req.body.quantidade);
    if (!comanda || comanda.status !== 'aberta') return res.status(400).json({ msg: 'Comanda não está aberta' });
    if (!product || !Number.isFinite(quantidade) || quantidade < 0.001) return res.status(400).json({ msg: 'Item inválido' });
    if (vendaPorPeso && (!Number.isFinite(pesoVendidoKg) || pesoVendidoKg <= 0)) return res.status(400).json({ msg: 'Informe o peso vendido' });
    if (!permiteFracionar(product) && !Number.isInteger(quantidade)) return res.status(400).json({ msg: 'Este produto é vendido por unidade' });
    const modificadores = Array.isArray(req.body.modificadores)
      ? req.body.modificadores.filter((item) => typeof item === 'string').slice(0, 10)
      : [];
    await ajustarEstoque([{ produtoId: product.id, quantidade }], 'baixar', session);
    comanda.itens.push({ produtoId: product.id, codigo: product.codigo, nome: product.nome, precoUnitario: vendaPorPeso ? money(pesoVendidoKg * Number(product.preco || 0)) : precoPorUnidade(product), quantidade, quantidadePecas: vendaPorPeso ? 0 : quantidade, pesoVendidoKg: vendaPorPeso ? pesoVendidoKg : undefined, tipoVenda: vendaPorPeso ? 'peso' : (produtoControlaPeso(product) ? 'inteiro' : 'unidade'), unidadeVenda: product.unidadeVenda, pesoPorUnidade: product.pesoPorUnidade, unidadePeso: product.unidadePeso, modificadores, aFazer: Boolean(product.aFazer), insumosConsumidos: (product.fichaTecnica || []).map((ingrediente) => ({ produtoId: ingrediente.produtoId, quantidade: ingrediente.quantidade, unidade: ingrediente.unidade })) });
    await recalcularPrecosComanda(comanda, session);
    comanda.valorTotal = money(comanda.itens.reduce((sum, item) => sum + Number(item.precoUnitario || 0) * Number(item.quantidade || 0), 0));
    comanda.saldoDevedor = Math.max(0, comanda.valorTotal - Number(comanda.valorPago || 0));
    comanda.estoqueBaixado = true;
    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/itens/:itemId', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    const quantidade = Number(req.body.quantidade);
    if (!comanda || comanda.status !== 'aberta') return res.status(400).json({ msg: 'Comanda não está aberta' });
    const item = comanda.itens.id(req.params.itemId);
    if (!item) return res.status(404).json({ msg: 'Item não encontrado' });
    if (!Number.isFinite(quantidade) || quantidade < 0.001) return res.status(400).json({ msg: 'Quantidade inválida' });
    const product = await Product.findById(item.produtoId).session(session);
    if (product && !permiteFracionar(product) && !Number.isInteger(quantidade)) return res.status(400).json({ msg: 'Este produto é vendido por unidade' });
    const diferenca = quantidade - Number(item.quantidade || 0);
    if (diferenca > 0) await ajustarEstoque([{ produtoId: item.produtoId, quantidade: diferenca }], 'baixar', session);
    if (diferenca < 0) await ajustarEstoque([{ produtoId: item.produtoId, quantidade: Math.abs(diferenca) }], 'devolver', session);
    item.quantidade = quantidade;
    await recalcularPrecosComanda(comanda, session);
    comanda.valorTotal = money(comanda.itens.reduce((sum, linha) => sum + Number(linha.precoUnitario || 0) * Number(linha.quantidade || 0), 0));
    comanda.saldoDevedor = Math.max(0, comanda.valorTotal - Number(comanda.valorPago || 0));
    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.delete('/:id/itens/:itemId', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || comanda.status !== 'aberta') return res.status(400).json({ msg: 'Comanda não está aberta' });
    const item = comanda.itens.id(req.params.itemId);
    if (!item) return res.status(404).json({ msg: 'Item não encontrado' });
    if (comanda.estoqueBaixado) await ajustarEstoque([{ produtoId: item.produtoId, quantidade: item.quantidade }], 'devolver', session);
    comanda.itens.pull(req.params.itemId);
    await recalcularPrecosComanda(comanda, session);
    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.post('/:id/mover', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comandaOrigem = await Comanda.findById(req.params.id).session(session);
    if (!comandaOrigem || comandaOrigem.status !== 'aberta') {
      return res.status(400).json({ msg: 'Comanda não está aberta' });
    }

    const itemIds = Array.isArray(req.body.itemIds) ? req.body.itemIds.map(String) : [];
    if (!itemIds.length) return res.status(400).json({ msg: 'Selecione ao menos um item' });

    const itensSelecionados = comandaOrigem.itens.filter((item) => itemIds.includes(String(item._id)));
    if (itensSelecionados.length !== itemIds.length) {
      return res.status(400).json({ msg: 'Alguns itens selecionados não pertencem a esta comanda' });
    }

    const itensMovidos = itensSelecionados.map((item) => ({
      produtoId: item.produtoId,
      codigo: item.codigo,
      nome: item.nome,
      precoUnitario: item.precoUnitario,
      quantidade: item.quantidade,
      unidadeVenda: item.unidadeVenda,
      pesoPorUnidade: item.pesoPorUnidade,
      unidadePeso: item.unidadePeso,
      modificadores: [...(item.modificadores || [])],
      aFazer: Boolean(item.aFazer),
      insumosConsumidos: (item.insumosConsumidos || []).map((ingrediente) => (ingrediente.toObject ? ingrediente.toObject() : { produtoId: ingrediente.produtoId, quantidade: ingrediente.quantidade, unidade: ingrediente.unidade })),
    }));

    if (comandaOrigem.estoqueBaixado) {
      await ajustarEstoque(itensMovidos, 'devolver', session);
    }

    comandaOrigem.itens = comandaOrigem.itens.filter((item) => !itemIds.includes(String(item._id)));
    comandaOrigem.estoqueBaixado = comandaOrigem.itens.length > 0;
    await comandaOrigem.save({ session });

    const novaComanda = new Comanda({
      clienteId: comandaOrigem.clienteId,
      clienteNome: req.body.clienteNome || comandaOrigem.clienteNome || 'Cliente não identificado',
      observacao: req.body.observacao || comandaOrigem.observacao,
      itens: itensMovidos,
      estoqueBaixado: true,
      atendente: req.user.username,
      status: 'aberta',
    });

    await ajustarEstoque(itensMovidos, 'baixar', session);
    await novaComanda.save({ session });

    await session.commitTransaction();
    res.json({ novaComanda, comandaOrigem });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/cancelar', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || comanda.status !== 'aberta') return res.status(400).json({ msg: 'Comanda não está aberta' });
    if (comanda.estoqueBaixado) await ajustarEstoque(comanda.itens, 'devolver', session);
    comanda.status = 'cancelada';
    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/receber-parcial', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || comanda.status !== 'aberta') throw new Error('Comanda não está aberta');

    const valorRecebido = Number(req.body.valorRecebido || 0);
    const formaPagamento = String(req.body.formaPagamento || 'dinheiro');
    if (!Number.isFinite(valorRecebido) || valorRecebido <= 0) throw new Error('Informe um valor válido para receber');
    if (!['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'credito_loja', 'fiado'].includes(formaPagamento)) {
      throw new Error('Forma de pagamento inválida');
    }

    const valorTotal = Number(comanda.valorTotal || 0);
    const totalCobrado = valorTotal > 0 ? valorTotal : money(comanda.itens.reduce((soma, item) => soma + Number(item.precoUnitario || 0) * Number(item.quantidade || 0), 0));
    comanda.valorTotal = comanda.valorTotal || totalCobrado;
    const historico = Array.isArray(comanda.historicoPagamentos) ? comanda.historicoPagamentos : [];
    historico.push({ valor: valorRecebido, formaPagamento, data: new Date(), usuario: req.user?.username || 'sistema' });
    comanda.historicoPagamentos = historico;

    const atualizacao = calcularStatusPagamentoComanda(comanda);
    comanda.valorPago = atualizacao.valorPago;
    comanda.saldoDevedor = atualizacao.saldoDevedor;
    comanda.statusPagamento = atualizacao.statusPagamento;

    await comanda.save({ session });
    await session.commitTransaction();
    res.json(comanda);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.patch('/:id/cliente', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    const telefone = String(req.body.telefone || '').replace(/\D/g, '');
    const nome = String(req.body.nome || '').trim();
    if (!comanda || !telefone) throw new Error('Dados do cliente inválidos');

    let customer = comanda.clienteId ? await Customer.findById(comanda.clienteId).session(session) : null;
    customer = customer || await Customer.findOne({ telefone }).session(session);
    if (customer) {
      if (nome) customer.nome = nome;
      else if (comanda.clienteNome && comanda.clienteNome !== 'Cliente não identificado') customer.nome = comanda.clienteNome;
      customer.telefone = telefone;
      await customer.save({ session });
    } else {
      customer = new Customer({ nome: nome || comanda.clienteNome || 'Cliente não identificado', telefone, createdBy: req.user.id });
      await customer.save({ session });
    }

    comanda.clienteId = customer.id;
    if (nome) comanda.clienteNome = nome;
    await comanda.save({ session });
    const order = comanda.pedidoId ? await Order.findByIdAndUpdate(comanda.pedidoId, { clienteId: customer.id, clienteNome: customer.nome, clienteTelefone: telefone }, { new: true, session }) : null;
    await session.commitTransaction();
    res.json({ customer, order });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

router.post('/:id/fechar', auth, auth.allowRoles('admin', 'operador'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const comanda = await Comanda.findById(req.params.id).session(session);
    if (!comanda || comanda.status !== 'aberta' || !comanda.itens.length) throw new Error('Comanda sem itens ou já fechada');
    await recalcularPrecosComanda(comanda, session);
    const utilizacaoInterna = Boolean(req.body.utilizacaoInterna);
    const metodoPagamento = req.body.metodoPagamento;
    if (!utilizacaoInterna && !['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'credito_loja'].includes(metodoPagamento)) {
      throw new Error('Selecione uma forma de pagamento');
    }
    if (!comanda.estoqueBaixado) await ajustarEstoque(comanda.itens, 'baixar', session);
    const subtotal = money(comanda.itens.reduce((sum, item) => sum + item.precoUnitario * item.quantidade, 0));
    const discount = money(req.body.desconto || 0);
    if (discount < 0 || discount > subtotal) throw new Error('Desconto inválido');
    const total = utilizacaoInterna ? 0 : money(subtotal - discount);
    const pagamentoFinal = utilizacaoInterna ? 'credito_loja' : metodoPagamento;
    const creditoLoja = pagamentoFinal === 'credito_loja';
    const telefone = String(req.body.telefone || '').replace(/\D/g, '');
    const nome = String(req.body.nome || '').trim();
    let customer = comanda.clienteId ? await Customer.findById(comanda.clienteId).session(session) : null;
    if (telefone) {
      customer = customer || await Customer.findOne({ telefone }).session(session);
      if (customer) {
        if (nome) customer.nome = nome;
        else if (comanda.clienteNome && comanda.clienteNome !== 'Cliente não identificado') customer.nome = comanda.clienteNome;
        customer.telefone = telefone;
        await customer.save({ session });
      } else {
        customer = new Customer({ nome: nome || comanda.clienteNome || 'Cliente não identificado', telefone, createdBy: req.user.id });
        await customer.save({ session });
      }
    }
    const taxasCartao = await obterTaxasCartao();
    const order = new Order({
      itens: comanda.itens,
      tipoAtendimento: comanda.tipoAtendimento || 'mesa',
      subtotal,
      desconto: discount,
      utilizacaoInterna,
      total,
      clienteId: customer?.id || comanda.clienteId,
      clienteNome: customer?.nome || comanda.clienteNome,
      clienteTelefone: customer?.telefone || telefone,
      atendente: req.user.username,
      comandaId: comanda.id,
      status: utilizacaoInterna || creditoLoja ? (utilizacaoInterna ? 'pago' : 'pendente') : 'pago',
      pagamentos: utilizacaoInterna
        ? [{ tipo: 'credito_loja', valorRecebido: 0, dataPagamento: new Date(), quitado: true, observacao: 'Utilização interna' }]
        : creditoLoja
          ? []
          : [{ tipo: pagamentoFinal, valorRecebido: total, ...calcularPagamento(pagamentoFinal, total, taxasCartao), dataPagamento: new Date(), quitado: true }],
    });
    await order.save({ session });
    if (customer && !utilizacaoInterna) {
      await Customer.findByIdAndUpdate(customer.id, { $inc: { cafesFidelidade: 1 } }, { session });
      comanda.clienteId = customer.id;
      if (nome) comanda.clienteNome = nome;
    }
    comanda.status = 'fechada';
    comanda.pedidoId = order.id;
    comanda.desconto = discount;
    comanda.valorTotal = total;
    comanda.utilizacaoInterna = utilizacaoInterna;
    comanda.valorPago = total;
    comanda.saldoDevedor = 0;
    comanda.statusPagamento = 'quitado';
    comanda.historicoPagamentos = [{ valor: total, formaPagamento: utilizacaoInterna ? 'credito_loja' : metodoPagamento, data: new Date(), usuario: req.user.username || 'sistema' }];
    await comanda.save({ session });
    await session.commitTransaction();
    res.json({ comanda, pedido: order });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ msg: err.message });
  } finally { await session.endSession(); }
});

module.exports = router;
module.exports.calcularStatusPagamentoComanda = calcularStatusPagamentoComanda;
