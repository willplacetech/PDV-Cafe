const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Product = require('../models/Product');
const Recipe = require('../models/Recipe');
const RecipeAudit = require('../models/RecipeAudit');
const Production = require('../models/Production');
const StockMovement = require('../models/StockMovement');
const { dadosEstoqueProduto } = require('../utils/estoqueProduto');
const { paraBase, calcularResumoCompleto, consumirInsumo, estoqueTotalBase, unidadeBase, calcularCustoDaFichaTecnica } = require('../utils/estoqueInsumo');
const { parsePagination, createPaginationResponse } = require('../utils/pagination');

const router = express.Router();
const locations = ['venda', 'insumos'];
const units = ['kg', 'L', 'un'];
const balanceField = (location) => location === 'insumos' ? 'estoqueInsumos' : 'estoque';
const unidadeDoInsumo = (produto = {}) => produto.tipo === 'venda' && produto.usavelEmReceita ? (produto.unidadeVenda || 'un') : (['un', 'kg', 'L'].includes(produto.unidadeCompra) ? produto.unidadeCompra : (produto.unidadeConteudo || 'kg'));
const tipoDePreparacao = (produto = {}) => (produto.aFazer ? 'coz' : produto.producaoPropria ? 'producao' : produto.tipoProduto || 'revenda');
const saidasDaReceita = (recipe) => Array.isArray(recipe.produtosSaida) && recipe.produtosSaida.length
  ? recipe.produtosSaida
  : [{ produtoId: recipe.produtoId, quantidade: recipe.rendimento, unidade: recipe.unidadeRendimento }];
const idDoProduto = (produto) => String(produto?._id || produto);
const consumirIngrediente = (produto, quantidade, unidade) => {
  if (!(produto.tipo === 'venda' && produto.usavelEmReceita)) return consumirInsumo(produto, quantidade, unidade);
  const conteudoPorUnidade = paraBase(Number(produto.conteudoPorEmbalagem || 1), produto.unidadeConteudo || produto.unidadeVenda || 'un');
  const quantidadeBase = paraBase(quantidade, unidade);
  const unidadesConsumidas = quantidadeBase / conteudoPorUnidade;
  if (!Number.isFinite(unidadesConsumidas) || unidadesConsumidas <= 0) throw new Error(`Quantidade inválida para o produto ${produto.nome}`);
  if (Number(produto.estoque || 0) < unidadesConsumidas) throw new Error(`Estoque insuficiente de ${produto.nome}`);
  produto.estoque = Number((Number(produto.estoque) - unidadesConsumidas).toFixed(6));
  return { quantidadeConvertida: unidadesConsumidas, mensagem: `${quantidade} ${unidade} equivalem a ${Number(unidadesConsumidas.toFixed(4))} ${produto.unidadeVenda || 'un'} - desconto aplicado` };
};

const sincronizarCustoReceita = async (recipeId) => {
  const recipe = await Recipe.findById(recipeId).populate('ingredientes.produtoId').populate('produtosSaida.produtoId').populate('produtoId');
  if (!recipe) return;
  const saidas = saidasDaReceita(recipe);
  const rendimentoTotal = saidas.reduce((total, saida) => total + Number(saida.quantidade || 0), 0);
  const resultado = await calcularCustoDaFichaTecnica(recipe.ingredientes);
  const disponivel = resultado.fonte === 'insumo';
  const custoTotal = disponivel ? Number(resultado.custoTotal) : 0;
  const custoUnitario = disponivel && rendimentoTotal > 0 ? custoTotal / rendimentoTotal : 0;
  await Recipe.findByIdAndUpdate(recipe._id, { $set: { custoInsumosTotal: custoTotal, custoTotal, custoUnitario } });
  await Promise.all(saidas.map((saida) => Product.findByIdAndUpdate(saida.produtoId?._id || saida.produtoId, { $set: {
    custoCalculado: disponivel ? custoUnitario : null,
    custo: custoUnitario,
    custoUnitario,
    rendimentoPorReceita: Number(saida.quantidade),
    dataUltimoCalculo: new Date(),
    fonteCalculo: resultado.fonte,
    custoUltimoSalvo: disponivel ? custoUnitario : 0,
    fichaTecnica: recipe.ingredientes.map((item) => ({ produtoId: item.produtoId._id || item.produtoId, quantidade: Number(item.quantidade) / Math.max(0.000001, rendimentoTotal), unidade: item.unidade })),
  } })));
};

router.use(auth);
router.use(auth.allowRoles('admin', 'gerente', 'cozinha'));
const onlyManager = auth.allowRoles('admin');

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
};

const resolverSaidas = async (produtosSaida, produtoId, rendimento, unidade) => {
  const candidatas = Array.isArray(produtosSaida) && produtosSaida.length
    ? produtosSaida
    : [{ produtoId, quantidade: rendimento, unidade }];
  if (candidatas.some((item) => !item.produtoId || !Number.isFinite(Number(item.quantidade)) || Number(item.quantidade) <= 0 || !units.includes(item.unidade))) {
    throw new Error('Produto final, quantidade ou unidade inválidos');
  }
  const ids = candidatas.map((item) => String(item.produtoId));
  if (new Set(ids).size !== ids.length) throw new Error('Cada produto final deve aparecer apenas uma vez');
  if (new Set(candidatas.map((item) => item.unidade)).size !== 1) throw new Error('Todos os produtos finais devem usar a mesma unidade');
  const produtos = await Product.find({ _id: { $in: ids } });
  const porId = new Map(produtos.map((produto) => [String(produto._id), produto]));
  const saidas = candidatas.map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade), unidade: item.unidade }));
  const produtosEncontrados = saidas.map((item) => porId.get(String(item.produtoId)));
  if (produtosEncontrados.some((produto) => !produto)) throw new Error('Um ou mais produtos finais não foram encontrados');
  const tipos = produtosEncontrados.map(tipoDePreparacao);
  if (tipos.some((tipo) => !['coz', 'producao'].includes(tipo))) throw new Error('Produtos finais precisam ser do tipo Preparação');
  if (tipos.some((tipo) => tipo !== tipos[0])) throw new Error('Todos os produtos finais devem usar o mesmo modo de preparo');
  return { saidas, produtos: produtosEncontrados, tipoProduto: tipos[0] };
};

router.get('/recipes', async (req, res) => {
  try {
    const recipes = await Recipe.find().populate('produtoId', 'nome codigo tipoProduto unidadeVenda producaoPropria aFazer estoque').populate('produtosSaida.produtoId', 'nome codigo tipoProduto unidadeVenda producaoPropria aFazer estoque').populate('ingredientes.produtoId', 'nome codigo tipo usavelEmReceita precoCompra custoUnitarioBase unidadeVenda unidadeConteudo conteudoPorEmbalagem estoque estoqueInsumos estoqueEmbalagens estoqueConteudoAberto').populate('updatedBy', 'username').sort({ nome: 1 });
    res.json(recipes.map((recipe) => {
      const produtoTipo = tipoDePreparacao(recipe.produtoId);
      const saidas = saidasDaReceita(recipe);
      const rendimentoTotal = saidas.reduce((total, saida) => total + Number(saida.quantidade || 0), 0);
      const ingredientes = recipe.ingredientes.map((item) => {
        const resumo = item.produtoId ? calcularResumoCompleto(item.produtoId) : null;
        const custoUnitarioBase = Number(resumo?.custoUnitarioBase || 0);
        const quantidadeBase = paraBase(item.quantidade, item.unidade);
        return {
          ...item.toObject(),
          custoUnitarioBase: custoUnitarioBase > 0 ? custoUnitarioBase : null,
          custoItem: custoUnitarioBase > 0 ? quantidadeBase * custoUnitarioBase : null,
          custoDisponivel: custoUnitarioBase > 0,
        };
      });
      const limites = recipe.ingredientes.map((item) => {
        const estoque = estoqueTotalBase(item.produtoId);
        const consumo = paraBase(item.quantidade, item.unidade);
        return consumo > 0 ? estoque / consumo : 0;
      });
      const producoesPossiveis = limites.length ? Math.floor(Math.min(...limites)) : 0;
      const custoPorUnidade = Number(recipe.custoUnitario || 0);
      return { ...recipe.toObject(), ingredientes, tipoFicha: produtoTipo, disponibilidade: { quantidade: producoesPossiveis * rendimentoTotal, limitante: recipe.ingredientes[limites.findIndex((limite) => limite === Math.min(...limites))]?.produtoId?.nome || null }, custoPorUnidade };
    }));
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

router.post('/recipes', onlyManager, [
  body('nome').trim().notEmpty(),
  body('produtoId').isMongoId(),
  body('rendimento').isFloat({ min: 0.001 }),
  body('unidadeRendimento').isIn(units),
  body('produtosSaida').optional().isArray({ min: 1 }),
  body('produtosSaida.*.produtoId').optional().isMongoId(),
  body('produtosSaida.*.quantidade').optional().isFloat({ min: 0.001 }),
  body('produtosSaida.*.unidade').optional().isIn(units),
  body('ingredientes').isArray({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  try {
    const { nome, produtoId, rendimento, unidadeRendimento, ingredientes } = req.body;
    const resolved = await resolverSaidas(req.body.produtosSaida, produtoId, rendimento, unidadeRendimento);
    const produto = resolved.produtos[0];
    const saidas = resolved.saidas;
    if (await Recipe.exists({ $or: [{ produtoId: { $in: saidas.map((saida) => saida.produtoId) } }, { produtosSaida: { $elemMatch: { produtoId: { $in: saidas.map((saida) => saida.produtoId) } } } }], ativa: true })) {
      return res.status(400).json({ msg: 'Um dos produtos finais já possui uma ficha técnica ativa' });
    }
    const ids = ingredientes.map((item) => item.produtoId);
    const produtosIngredientes = await Product.find({ _id: { $in: ids } });
    const byId = new Map(produtosIngredientes.map((produtoItem) => [String(produtoItem._id), produtoItem]));
    const itens = ingredientes.map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade), unidade: item.unidade || unidadeDoInsumo(byId.get(String(item.produtoId))) }));
    if (itens.some((item) => !byId.has(String(item.produtoId)) || !Number.isFinite(item.quantidade) || item.quantidade <= 0 || !units.includes(item.unidade))) return res.status(400).json({ msg: 'Ingrediente inválido' });
    if (itens.some((item) => { const produtoItem = byId.get(String(item.produtoId)); return produtoItem.tipo !== 'insumo' && !produtoItem.usavelEmReceita; })) return res.status(400).json({ msg: 'A receita só pode usar insumos ou produtos híbridos' });
    const primaryOutput = saidas[0];
    const recipe = await Recipe.create({ nome: nome.trim(), produtoId: primaryOutput.produtoId, rendimento: primaryOutput.quantidade, unidadeRendimento: primaryOutput.unidade, produtosSaida: saidas, ingredientes: itens, createdBy: req.user.id, updatedBy: req.user.id });
    await Promise.all(resolved.produtos.map((outputProduct, index) => Product.findByIdAndUpdate(outputProduct._id, { $set: {
      tipoProduto: resolved.tipoProduto,
      aFazer: resolved.tipoProduto === 'coz',
      producaoPropria: resolved.tipoProduto === 'producao',
      rendimentoPorReceita: saidas[index].quantidade,
    } })));
    await RecipeAudit.create({ receitaId: recipe._id, produtoId: produto._id, produtoNome: produto.nome, acao: 'criada', detalhes: 'Ficha técnica criada', usuarioId: req.user.id });
    await sincronizarCustoReceita(recipe._id);
    res.status(201).json(await Recipe.findById(recipe._id).populate('produtoId', 'nome codigo unidadeVenda producaoPropria aFazer tipoProduto').populate('produtosSaida.produtoId', 'nome codigo unidadeVenda producaoPropria aFazer tipoProduto'));
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.put('/recipes/:id', onlyManager, [
  body('nome').optional().trim().notEmpty(),
  body('produtoId').optional().isMongoId(),
  body('rendimento').optional().isFloat({ min: 0.001 }),
  body('unidadeRendimento').optional().isIn(units),
  body('produtosSaida').optional().isArray({ min: 1 }),
  body('produtosSaida.*.produtoId').optional().isMongoId(),
  body('produtosSaida.*.quantidade').optional().isFloat({ min: 0.001 }),
  body('produtosSaida.*.unidade').optional().isIn(units),
  body('ingredientes').optional().isArray({ min: 1 }),
  body('ativa').optional().isBoolean(),
], async (req, res) => {
  if (!validate(req, res)) return;
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ msg: 'Receita não encontrada' });
    const saidasAtuais = saidasDaReceita(recipe).map((saida) => ({ produtoId: idDoProduto(saida.produtoId), quantidade: Number(saida.quantidade), unidade: saida.unidade }));
    const saidasInformadas = req.body.produtosSaida || (req.body.produtoId || req.body.rendimento !== undefined || req.body.unidadeRendimento
      ? [{ produtoId: req.body.produtoId || recipe.produtoId, quantidade: req.body.rendimento ?? recipe.rendimento, unidade: req.body.unidadeRendimento || recipe.unidadeRendimento }]
      : saidasAtuais);
    const primaryInput = saidasInformadas[0];
    const resolved = await resolverSaidas(saidasInformadas, primaryInput.produtoId, primaryInput.quantidade, primaryInput.unidade);
    const primaryProduct = resolved.produtos[0];
    const idsSaida = resolved.saidas.map((saida) => saida.produtoId);
    const fichaConflitante = await Recipe.exists({ _id: { $ne: recipe._id }, ativa: true, $or: [{ produtoId: { $in: idsSaida } }, { produtosSaida: { $elemMatch: { produtoId: { $in: idsSaida } } } }] });
    if (fichaConflitante) return res.status(400).json({ msg: 'Um dos produtos finais já possui outra ficha técnica ativa' });
    const fields = {};
    if (req.body.nome !== undefined) fields.nome = req.body.nome;
    fields.produtoId = primaryInput.produtoId;
    fields.rendimento = Number(primaryInput.quantidade);
    fields.unidadeRendimento = primaryInput.unidade;
    fields.produtosSaida = resolved.saidas;
    if (req.body.ativa !== undefined) fields.ativa = Boolean(req.body.ativa);
    if (req.body.ingredientes) {
      const ingredientIds = req.body.ingredientes.map((item) => item.produtoId);
      const ingredientProducts = await Product.find({ _id: { $in: ingredientIds } }).select('tipo usavelEmReceita unidadeConteudo unidadeVenda');
      const ingredientUsable = new Map(ingredientProducts.map((produto) => [String(produto._id), produto.usavelEmReceita || produto.tipo === 'insumo']));
      if (req.body.ingredientes.some((item) => !ingredientUsable.get(String(item.produtoId)))) return res.status(400).json({ msg: 'A receita só pode usar insumos ou produtos híbridos' });
      const ingredientById = new Map(ingredientProducts.map((produto) => [String(produto._id), produto]));
      fields.ingredientes = req.body.ingredientes.map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade), unidade: item.unidade || unidadeDoInsumo(ingredientById.get(String(item.produtoId))) }));
    }
    if (fields.ingredientes && !req.body.confirmarDivergenciaCusto) {
      const resultadoCusto = await calcularCustoDaFichaTecnica(fields.ingredientes);
      const divisor = resolved.saidas.reduce((total, saida) => total + saida.quantidade, 0);
      const custoNovo = resultadoCusto.fonte === 'insumo' ? Number(resultadoCusto.custoTotal) / divisor : null;
      const custoAnteriorProduto = await Product.findById(primaryProduct._id).select('custoCalculado custo custoUnitario');
      const custoAnterior = Number(custoAnteriorProduto?.custoCalculado || custoAnteriorProduto?.custo || custoAnteriorProduto?.custoUnitario || 0);
      if (custoAnterior > 0 && custoNovo !== null) {
        const variacao = Math.abs(((custoNovo - custoAnterior) / custoAnterior) * 100);
        if (variacao > 5) {
          return res.status(409).json({ msg: 'Divergência de custo detectada', requireConfirmation: true, divergencia: { custoAnterior, custoNovo, variacao: Number(variacao.toFixed(2)), mensagem: `Custo divergiu ${variacao.toFixed(2)}% (era R$ ${custoAnterior.toFixed(2)}, será R$ ${custoNovo.toFixed(2)}). Confirme para salvar.` } });
        }
      }
    }
    fields.updatedBy = req.user.id;
    fields.updatedAt = new Date();
    const updated = await Recipe.findByIdAndUpdate(req.params.id, { $set: fields }, { new: true, runValidators: true }).populate('produtoId', 'nome codigo unidadeVenda producaoPropria aFazer tipoProduto').populate('produtosSaida.produtoId', 'nome codigo unidadeVenda producaoPropria aFazer tipoProduto');
    const outputIds = new Set(idsSaida.map(String));
    const removidos = saidasAtuais.map((saida) => saida.produtoId).filter((id) => !outputIds.has(String(id)));
    if (removidos.length) await Product.updateMany({ _id: { $in: removidos } }, { $set: { fichaTecnica: [] } });
    await Promise.all(resolved.produtos.map((outputProduct, index) => Product.findByIdAndUpdate(outputProduct._id, { $set: {
      tipoProduto: resolved.tipoProduto,
      aFazer: resolved.tipoProduto === 'coz',
      producaoPropria: resolved.tipoProduto === 'producao',
      rendimentoPorReceita: resolved.saidas[index].quantidade,
    } })));
    await RecipeAudit.create({ receitaId: updated._id, produtoId: updated.produtoId._id, produtoNome: updated.produtoId.nome, acao: 'alterada', detalhes: 'Ingredientes ou dados da ficha alterados', usuarioId: req.user.id });
    if (updated.ativa) await sincronizarCustoReceita(updated._id);
    res.json(await Recipe.findById(updated._id).populate('produtoId', 'nome codigo unidadeVenda producaoPropria aFazer tipoProduto').populate('produtosSaida.produtoId', 'nome codigo unidadeVenda producaoPropria aFazer tipoProduto'));
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.delete('/recipes/:id', onlyManager, async (req, res) => {
  try {
    const used = await Production.exists({ receitaId: req.params.id });
    if (used) return res.status(400).json({ msg: 'Receita já utilizada não pode ser excluída; desative-a.' });
    const recipe = await Recipe.findByIdAndDelete(req.params.id);
    if (!recipe) return res.status(404).json({ msg: 'Receita não encontrada' });
    const produtosSaida = saidasDaReceita(recipe);
    const produto = await Product.findById(recipe.produtoId).select('nome aFazer');
    await Product.updateMany({ _id: { $in: produtosSaida.map((saida) => saida.produtoId?._id || saida.produtoId) } }, { $set: { fichaTecnica: [] } });
    await RecipeAudit.create({ receitaId: recipe._id, produtoId: recipe.produtoId, produtoNome: produto?.nome || recipe.nome, acao: 'excluida', detalhes: 'Ficha técnica excluída; produto mantido', usuarioId: req.user.id });
    res.json({ msg: 'Receita removida com sucesso' });
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.get('/recipe-audits/:produtoId', async (req, res) => {
  try { res.json(await RecipeAudit.find({ produtoId: req.params.produtoId }).populate('usuarioId', 'username').sort({ createdAt: -1 }).limit(50)); }
  catch (error) { res.status(500).json({ msg: error.message }); }
});

router.get('/stock', async (req, res) => {
  try {
    const location = locations.includes(req.query.location) ? req.query.location : 'insumos';
    const field = balanceField(location);
    const pagination = parsePagination(req.query);
    const filter = { tipo: location === 'insumos' ? 'insumo' : 'venda', $or: [{ [field]: { $gt: 0 } }, { [field]: 0 }] };
    const total = pagination.requested ? await Product.countDocuments(filter) : null;
    let productsQuery = Product.find(filter).sort({ nome: 1, _id: 1 });
    if (pagination.requested) {
      const totalPaginas = Math.ceil(total / pagination.limite);
      const pagina = Math.min(pagination.pagina, Math.max(1, totalPaginas));
      productsQuery = productsQuery.skip((pagina - 1) * pagination.limite).limit(pagination.limite);
    }
    const products = await productsQuery;
    const dados = products.map((product) => {
      const resumo = location === 'insumos' ? calcularResumoCompleto(product) : null;
      return { ...product.toObject(), ...dadosEstoqueProduto(product), local: location, saldo: location === 'venda' ? dadosEstoqueProduto(product).estoque : resumo.embalagensFechadas, totalDisponivel: resumo?.total || 0, totalKgDisponivel: resumo?.totalKg, unidadeDisponivel: resumo?.unidadeConteudo, conteudoAberto: resumo?.conteudoAberto || 0, minimo: Number(location === 'insumos' ? (resumo?.estoqueMinimo || product.estoqueMinimoEmbalagens || product.estoqueMinimoInsumos || 0) : product.estoqueMinimo || 0) };
    });
    res.json(pagination.requested ? createPaginationResponse(dados, total, pagination) : dados);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ msg: error.message });
    res.status(500).json({ msg: error.message });
  }
});

router.get('/movements', async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const total = pagination.requested ? await StockMovement.countDocuments() : null;
    let movementsQuery = StockMovement.find().sort({ createdAt: -1, _id: -1 }).populate('createdBy', 'username');
    if (pagination.requested) {
      const totalPaginas = Math.ceil(total / pagination.limite);
      const pagina = Math.min(pagination.pagina, Math.max(1, totalPaginas));
      movementsQuery = movementsQuery.skip((pagina - 1) * pagination.limite).limit(pagination.limite);
    } else {
      movementsQuery = movementsQuery.limit(100);
    }
    const movements = await movementsQuery.lean();
    res.json(pagination.requested ? createPaginationResponse(movements, total, pagination) : movements);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ msg: error.message });
    res.status(500).json({ msg: error.message });
  }
});

router.post('/transfer', onlyManager, [body('produtoId').isMongoId(), body('origem').isIn(locations), body('destino').isIn(locations), body('quantidade').isFloat({ min: 0.001 })], async (req, res) => {
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
      [movement] = await StockMovement.create([{ produtoId: product._id, produtoNome: product.nome, tipo: 'transferencia', origem: req.body.origem, destino: req.body.destino, quantidade: quantity, observacao: req.body.observacao, createdBy: req.user.id }], { session, ordered: true });
    });
    res.status(201).json(movement);
  } catch (error) { res.status(400).json({ msg: error.message }); } finally { await session.endSession(); }
});

router.post('/produce', onlyManager, [body('receitas').isArray({ min: 1 }), body('receitas.*.receitaId').isMongoId(), body('receitas.*.quantidade').isFloat({ min: 0.001 })], async (req, res) => {
  if (!validate(req, res)) return;
  const session = await mongoose.startSession();
  try {
    const producoes = [];
    const todasConversoes = [];
    await session.withTransaction(async () => {
      for (const item of req.body.receitas) {
        const { receitaId, quantidade } = item;
        const recipe = await Recipe.findOne({ _id: receitaId, ativa: true }).populate('produtoId').populate('produtosSaida.produtoId').populate('ingredientes.produtoId').session(session);
        if (!recipe) throw new Error(`Receita não encontrada ou inativa: ${receitaId}`);
        const saidas = saidasDaReceita(recipe);
        if (saidas.some((saida) => tipoDePreparacao(saida.produtoId) !== 'producao')) throw new Error(`Somente fichas no modo por lote podem ser lançadas em produção: ${recipe.nome}`);
        const batches = Number(quantidade);
        const consumption = recipe.ingredientes.map((ingrediente) => ({ product: ingrediente.produtoId, quantity: Number(ingrediente.quantidade) * batches, unit: ingrediente.unidade }));
        const snapshots = [];
        for (const consumo of consumption) {
          const product = await Product.findById(consumo.product._id).session(session);
          if (!product) throw new Error(`Insumo não encontrado: ${consumo.product.nome}`);
          const resultado = consumirIngrediente(product, consumo.quantity, consumo.unit);
          todasConversoes.push(resultado.mensagem);
          await product.save({ session });
          snapshots.push({ produtoId: consumo.product._id, nome: consumo.product.nome, quantidade: consumo.quantity, unidade: consumo.unit });
        }
        const produtosProduzidos = saidas.map((saida) => ({
          produtoId: saida.produtoId._id || saida.produtoId,
          nome: saida.produtoId.nome || recipe.produtoId.nome,
          quantidade: Number(saida.quantidade) * batches,
          unidade: saida.unidade,
        }));
        await Promise.all(produtosProduzidos.map((saida) => Product.findByIdAndUpdate(saida.produtoId, { $inc: { estoque: saida.quantidade } }, { session })));
        const primaryOutput = produtosProduzidos[0];
        const [production] = await Production.create([{ receitaId: recipe._id, receitaNome: recipe.nome, produtoId: primaryOutput.produtoId, produtoNome: primaryOutput.nome, quantidade: batches, rendimentoTotal: primaryOutput.quantidade, unidadeRendimento: primaryOutput.unidade, produtos: produtosProduzidos, insumos: snapshots, observacao: req.body.observacao, createdBy: req.user.id }], { session, ordered: true });
        await StockMovement.create(snapshots.map((snapshot) => ({ produtoId: snapshot.produtoId, produtoNome: snapshot.nome, tipo: 'saida', origem: 'insumos', destino: null, quantidade: snapshot.quantidade, unidade: snapshot.unidade, referenciaId: production._id, observacao: `Consumo da receita ${recipe.nome}`, createdBy: req.user.id })), { session, ordered: true });
        await StockMovement.create(produtosProduzidos.map((saida) => ({ produtoId: saida.produtoId, produtoNome: saida.nome, tipo: 'producao', origem: null, destino: 'venda', quantidade: saida.quantidade, unidade: saida.unidade, referenciaId: production._id, observacao: `Produção da receita ${recipe.nome}`, createdBy: req.user.id })), { session, ordered: true });
        producoes.push(production);
      }
    });
    res.status(201).json({ producoes, conversoes: todasConversoes });
  } catch (error) { res.status(400).json({ msg: error.message }); } finally { await session.endSession(); }
});

router.get('/dashboard', async (req, res) => {
  try {
    const [products, recipes, recentProductions, lowStock] = await Promise.all([
      Product.find({ $or: [{ tipo: 'insumo' }, { tipo: 'venda', usavelEmReceita: true }] }).select('nome codigo tipo usavelEmReceita estoque estoqueInsumos estoqueEmbalagens estoqueConteudoAberto estoqueMinimoInsumos estoqueMinimoEmbalagens unidadeCompra unidadeConteudo conteudoPorEmbalagem unidadeVenda'),
      Recipe.find({ ativa: true }).populate('produtoId', 'nome estoque unidadeVenda tipoProduto aFazer producaoPropria').populate('produtosSaida.produtoId', 'nome estoque unidadeVenda tipoProduto aFazer producaoPropria').populate('ingredientes.produtoId', 'nome estoqueInsumos estoqueEmbalagens estoqueConteudoAberto unidadeConteudo conteudoPorEmbalagem'),
      Production.find().sort({ createdAt: -1 }).limit(10),
      Product.find({ ativo: { $ne: false }, $or: [{ tipo: 'insumo', $expr: { $lte: ['$estoqueEmbalagens', { $ifNull: ['$estoqueMinimoEmbalagens', '$estoqueMinimoInsumos'] }] } }, { tipo: 'venda', usavelEmReceita: true, tipoProduto: { $ne: 'coz' }, aFazer: { $ne: true }, categoria: { $ne: 'Pratos na Hora' }, $expr: { $lte: ['$estoque', { $ifNull: ['$estoqueMinimo', 0] }] } }] }).select('nome codigo tipo usavelEmReceita estoque estoqueInsumos estoqueEmbalagens estoqueConteudoAberto estoqueMinimoInsumos estoqueMinimoEmbalagens unidadeCompra unidadeConteudo conteudoPorEmbalagem unidadeVenda'),
    ]);
    const formatNumber = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const possible = recipes.map((recipe) => {
      const tipoProduto = tipoDePreparacao(recipe.produtoId);
      const saidas = saidasDaReceita(recipe);
      const produtosSaida = saidas.map((saida) => ({
        nome: saida.produtoId?.nome || 'Produto removido',
        estoque: Number(saida.produtoId?.estoque || 0),
        quantidadePorFicha: Number(saida.quantidade || 0),
        unidade: saida.unidade,
      }));
      const nomesSaida = produtosSaida.map((saida) => saida.nome).join(' + ');
      if (tipoProduto === 'producao') {
        const estoqueAtual = Number(recipe.produtoId?.estoque || 0);
        return {
          receitaId: recipe._id,
          receitaNome: recipe.nome,
          produtoNome: nomesSaida,
          produtosSaida,
          tipoProduto,
          producoesPossiveis: estoqueAtual,
          rendimentoPorProducao: recipe.rendimento,
          unidade: recipe.unidadeRendimento,
          estoqueProduto: estoqueAtual,
          unidadesProntas: estoqueAtual,
          calculo: `Estoque atual: ${formatNumber(estoqueAtual)} ${recipe.unidadeRendimento}. Faça nova fornada quando necessário.`,
        };
      }
      const ingredienteLimite = recipe.ingredientes
        .filter((item) => item.produtoId && Number(item.quantidade || 0) > 0)
        .map((item) => {
          const estoque = estoqueTotalBase(item.produtoId);
          const consumo = Number(item.quantidade || 0);
          const consumoBase = paraBase(consumo, item.unidade);
          const producoes = consumoBase > 0 ? estoque / consumoBase : 0;
          return { nome: item.produtoId?.nome, estoque, consumo, producoes };
        })
        .sort((a, b) => a.producoes - b.producoes)[0];
      const producoesPossiveis = ingredienteLimite ? Number((ingredienteLimite.producoes).toFixed(3)) : 0;
      const rendimentoTotal = saidas.reduce((total, saida) => total + Number(saida.quantidade || 0), 0);
      const unidadesProntas = Number((producoesPossiveis * rendimentoTotal).toFixed(3));
      const calculo = ingredienteLimite && producoesPossiveis > 0
        ? `${formatNumber(ingredienteLimite.estoque)} em unidade base ÷ ${formatNumber(ingredienteLimite.consumo)} por receita = ${formatNumber(producoesPossiveis)} produções → ${formatNumber(unidadesProntas)} unidades prontas`
        : 'Insumos insuficientes';
      return {
        receitaId: recipe._id,
        receitaNome: recipe.nome,
        produtoNome: nomesSaida,
        produtosSaida,
        tipoProduto,
        producoesPossiveis,
        rendimentoPorProducao: recipe.rendimento,
        unidade: recipe.unidadeRendimento,
        estoquePorReceita: ingredienteLimite?.estoque ?? 0,
        consumoPorReceita: ingredienteLimite?.consumo ?? 0,
        unidadesProntas,
        calculo,
      };
    });
    res.json({ estoqueInsumos: products, baixoEstoque: lowStock, receitasPossiveis: possible, producoesRecentes: recentProductions });
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

module.exports = router;