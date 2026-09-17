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
const { resolverTipoProduto } = require('../utils/produtoTipo');
const { calcularResumoCompleto, calcularCustoUnitarioBase, calcularEstoqueMinimoBase, estoqueTotalBase, paraBase, custoPorBase } = require('../utils/estoqueInsumo');
const { normalizarDescontos } = require('../utils/descontosQuantidade');

const router = express.Router();
const units = ['un', 'kg', 'g', 'mg', 'l', 'ml'];
const compraUnits = ['un', 'kg', 'g', 'L', 'ml', 'lata', 'rolo', 'caixa', 'pacote', 'dz'];
const dataLocal = () => { const agora = new Date(); return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`; };
const disponibilidadeCoz = (produto) => {
  if (!produto.aFazer) return null;
  const ingredientes = (produto.fichaTecnica || []).filter((item) => item.produtoId && Number(item.quantidade) > 0);
  const limites = ingredientes.map((item) => Math.floor(estoqueTotalBase(item.produtoId) / paraBase(item.quantidade, item.unidade)));
  const faltantes = ingredientes.filter((item, indice) => limites[indice] < 1).map((item) => item.produtoId.nome);
  const custo = ingredientes.reduce((total, item) => total + paraBase(item.quantidade, item.unidade) * custoPorBase(item.produtoId), 0);
  return { disponivel: limites.length ? Math.min(...limites) : 0, faltantes, custo };
};
const antesDasOito = () => new Date().getHours() < 8;
const limparCampoOpcional = (valor) => (valor === '' || valor === null || valor === undefined ? undefined : valor);
const descontosDoProduto = (valor, tipo, precoNormal) => {
  if (tipo !== 'venda') return [];
  if (valor === undefined) return undefined;
  if (!Array.isArray(valor)) throw new Error('Faixas de desconto inválidas');
  const descontos = normalizarDescontos(valor);
  if (descontos.length !== valor.length) throw new Error('Cada faixa deve ter quantidade e preço válidos');
  for (let indice = 0; indice < descontos.length; indice += 1) {
    const faixa = descontos[indice];
    const anterior = descontos[indice - 1];
    if (faixa.quantidadeMinima < 1 || (anterior && faixa.quantidadeMinima <= anterior.quantidadeMinima)) throw new Error('As quantidades mínimas devem ser crescentes');
    if (faixa.precoUnitario > precoNormal || (anterior && faixa.precoUnitario >= anterior.precoUnitario)) throw new Error('Cada preço promocional deve ser menor que a faixa anterior');
  }
  return descontos;
};
const validations = [
  body('codigo').trim().notEmpty(),
  body('nome').trim().notEmpty(),
  body('preco').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('precoCompra').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('custo').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('estoque').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('estoqueInsumos').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('estoqueMaximo').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0.001 }),
  body('estoqueMinimoInsumos').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('estoqueEmbalagens').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('estoqueConteudoAberto').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('estoqueMinimoEmbalagens').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('conteudoPorEmbalagem').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('unidadeConteudo').optional().isIn(['mg', 'g', 'kg', 'ml', 'l', 'un']),
  body('marcaReferencia').optional().trim(),
  body('unidadeVenda').optional().isIn(units),
  body('unidadeCompra').optional().isIn(compraUnits),
  body('rendimentoPorUnidadeCompra').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('pesoPorUnidade').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('unidadePeso').optional().isIn(['kg', 'g']),
  body('vendidoFracionado').optional().isBoolean(),
  body('aFazer').optional().isBoolean(),
  body('permitirVendaSemInsumo').optional().isBoolean(),
  body('producaoPropria').optional().isBoolean(),
];

router.get('/', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  try {
    const { search, categoria, tipo } = req.query;
    const query = {};
    if (search) query.$or = [{ nome: { $regex: search, $options: 'i' } }, { codigo: { $regex: search, $options: 'i' } }];
    if (categoria) query.categoria = categoria;
    if (tipo === 'venda' || tipo === 'insumo') query.tipo = tipo;
    const [produtos, receitas] = await Promise.all([
      Product.find(query).sort({ nome: 1 }),
      Recipe.find({ ativa: true }).select('_id produtoId').lean(),
    ]);
    const receitaPorProduto = new Map(receitas.map((receita) => [String(receita.produtoId), receita._id]));
    res.json(produtos.map((produto) => ({
      ...produto.toObject(),
      ...(produto.tipo === 'insumo' && produto.unidadeCompra ? { unidadeVenda: produto.unidadeCompra } : {}),
      ...dadosEstoqueProduto(produto),
      receitaId: receitaPorProduto.get(String(produto._id)) || null,
      temReceita: receitaPorProduto.has(String(produto._id)),
       resumoInsumo: produto.tipo === 'insumo' ? calcularResumoCompleto(produto) : null,
    })));
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.get('/pdv', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  try {
    const produtos = await Product.find({
      ativo: { $ne: false },
      $or: [
        { tipo: 'venda' },
        { tipo: { $exists: false }, controladoComoInsumo: { $ne: true } },
      ],
    }).populate('fichaTecnica.produtoId', 'nome tipo unidadeCompra unidadeConteudo conteudoPorEmbalagem estoqueEmbalagens estoqueInsumos estoqueConteudoAberto precoCompra').sort({ nome: 1 });
    res.json(produtos.map((produto) => ({
      ...produto.toObject(),
      tipo: resolverTipoProduto(produto),
      ...dadosEstoqueProduto(produto),
      cozDisponibilidade: disponibilidadeCoz(produto),
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

router.post('/migracoes/separar-tipos', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const produtos = await Product.find({ $or: [{ tipo: { $exists: false } }, { tipo: null }, { tipo: 'venda', controladoComoInsumo: true }] });
    let insumos = 0;
    let vendas = 0;
    for (const produto of produtos) {
      const tipo = produto.controladoComoInsumo ? 'insumo' : 'venda';
      produto.tipo = tipo;
      produto.categoria = tipo === 'insumo' ? 'Insumos' : (produto.categoria === 'Insumos' ? 'Outros' : produto.categoria);
      if (tipo === 'insumo') {
        produto.precoCompra = Number(produto.precoCompra || produto.preco || 0);
        produto.estoqueInsumos = Number(produto.estoqueInsumos || produto.estoque || 0);
        produto.estoque = 0;
        produto.usavelEmReceita = true;
          produto.estoqueEmbalagens = Number(produto.estoqueInsumos || 0);
        insumos += 1;
      } else {
        vendas += 1;
      }
      produto.controladoComoInsumo = undefined;
      await produto.save();
      await Product.updateOne({ _id: produto._id }, { $unset: { controladoComoInsumo: 1 } });
    }
    res.json({ msg: 'Produtos separados por tipo.', insumos, vendas });
  } catch (error) { res.status(500).json({ msg: error.message }); }
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
    res.json({ ...product.toObject(), ...dadosEstoqueProduto(product), resumoInsumo: product.tipo === 'insumo' ? calcularResumoCompleto(product) : null });
  } catch (_) { res.status(404).json({ msg: 'Produto não encontrado' }); }
});

router.post('/', auth, auth.allowRoles('admin'), validations, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array();
    return res.status(400).json({ error: details.map((item) => item.msg).join('; '), errors: details });
  }
  try {
    const data = req.body;
    const tipo = resolverTipoProduto(data);
    if (tipo === 'venda' && (data.precoVenda == null && data.preco == null)) return res.status(400).json({ msg: 'Preço de venda é obrigatório para produtos à venda' });
    if ((tipo === 'insumo' || data.usavelEmReceita === true) && (data.precoCompra === undefined || Number(data.precoCompra) <= 0)) return res.status(400).json({ msg: 'Preço de compra é obrigatório para produtos usados em receitas' });
    if (data.usavelEmReceita === true && (!Number.isFinite(Number(data.conteudoPorEmbalagem)) || Number(data.conteudoPorEmbalagem) <= 0)) return res.status(400).json({ msg: 'Informe o conteúdo por embalagem do produto híbrido' });
    const exists = await Product.findOne({ codigo: { $regex: new RegExp(`^${data.codigo.trim()}$`, 'i') } });
    if (exists) return res.status(400).json({ msg: 'Já existe um produto com este código' });
    const estoque = Number(data.estoque) || 0;
    const estoqueInsumos = Number(data.estoqueInsumos) || 0;
    const fichaTecnica = Array.isArray(data.fichaTecnica) ? data.fichaTecnica.map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade), unidade: item.unidade })).filter((item) => item.produtoId && Number.isFinite(item.quantidade) && item.quantidade > 0 && units.includes(item.unidade)) : [];
    if (Boolean(data.aFazer) && fichaTecnica.length === 0) return res.status(400).json({ msg: 'Produtos Coz precisam de uma ficha técnica com pelo menos um ingrediente' });
    const custoUnitario = Number(data.custoUnitario ?? data.custo) || 0;
    const pesoPorUnidade = Number(data.pesoPorUnidade) || 0;
    const unidadeVenda = data.unidadeVenda || 'un';
    const unidadeCompra = data.unidadeCompra || 'kg';
    const categoria = tipo === 'insumo' ? 'Insumos' : (data.categoria || 'Outros');
    const precoVenda = Number(data.precoVenda ?? data.preco ?? 0);
    const precoCompra = Number(data.precoCompra || 0);
    const descontosPorQuantidade = descontosDoProduto(data.descontosPorQuantidade, tipo, precoVenda);
    const unidadeConteudo = data.unidadeConteudo || (['kg', 'g', 'mg', 'l', 'ml', 'un'].includes(unidadeCompra) ? unidadeCompra : 'g');
    const conteudoPorEmbalagem = ['kg', 'g', 'mg', 'l', 'ml', 'un'].includes(unidadeCompra) ? 1 : Number(data.conteudoPorEmbalagem || 0);
    const estoqueEmbalagens = tipo === 'insumo' ? Number(data.estoqueEmbalagens ?? estoque) || 0 : 0;
    const estoqueConteudoAberto = tipo === 'insumo' ? Number(data.estoqueConteudoAberto) || 0 : 0;
    const estoquePesoKg = pesoPorUnidade > 0 && ['kg', 'g'].includes(unidadeVenda)
      ? estoque * (unidadeVenda === 'kg' ? pesoPorUnidade : pesoPorUnidade / 1000)
      : 0;
    const product = await Product.create({
      codigo: data.codigo.trim(),
      nome: data.nome.trim(),
      tipo,
      categoria,
      preco: tipo === 'venda' ? precoVenda : 0,
      descontosPorQuantidade: descontosPorQuantidade || [],
      usavelEmReceita: tipo === 'venda' ? Boolean(data.usavelEmReceita) : true,
      precoCompra,
      unidadeCompra,
      marcaReferencia: data.marcaReferencia || '',
      conteudoPorEmbalagem,
      unidadeConteudo,
      estoqueEmbalagens,
      estoqueConteudoAberto,
       estoqueMinimoEmbalagens: Number(data.estoqueMinimoEmbalagens ?? data.estoqueMinimoInsumos) || 0,
       estoqueMinimoBase: tipo === 'insumo' ? calcularEstoqueMinimoBase(Number(data.estoqueMinimoEmbalagens ?? data.estoqueMinimoInsumos) || 0, unidadeConteudo) : 0,
       rendimentoPorUnidadeCompra: Number(data.rendimentoPorUnidadeCompra || 0),
       custo: custoUnitario,
       custoUnitario,
      custoUnitarioBase: tipo === 'insumo' || data.usavelEmReceita ? calcularCustoUnitarioBase(precoCompra, conteudoPorEmbalagem, unidadeConteudo) : Number(data.custoUnitarioBase) || 0,
      estoque: tipo === 'venda' ? estoque : 0,
      estoquePesoKg,
      estoqueInsumos: tipo === 'insumo' ? estoqueEmbalagens : estoqueInsumos,
      estoqueInicialDia: estoque,
      estoqueInicialData: dataLocal(),
      estoqueInsumosInicial: estoqueInsumos,
      estoqueInsumosInicialData: dataLocal(),
      estoqueMinimoInsumos: Number(data.estoqueMinimoInsumos) || 0,
      unidadeVenda,
      pesoPorUnidade,
      unidadePeso: data.unidadePeso || 'kg',
      vendidoFracionado: Boolean(data.vendidoFracionado),
      aFazer: Boolean(data.aFazer),
      permitirVendaSemInsumo: Boolean(data.permitirVendaSemInsumo),
      fichaTecnica,
      producaoPropria: Boolean(data.producaoPropria),
      usavelEmReceita: tipo === 'insumo' || Boolean(data.usavelEmReceita),
      ativo: data.ativo !== undefined ? Boolean(data.ativo) : true,
      createdBy: req.user.id,
    });
    res.status(201).json(product);
  } catch (err) {
    const message = err.code === 11000 ? 'Código duplicado' : err.message;
    res.status(400).json({ error: message, msg: message });
  }
});

router.put('/:id', auth, auth.allowRoles('admin'), [body('codigo').optional().trim().notEmpty(), body('nome').optional().trim().notEmpty(), body('preco').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }), body('estoque').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }), body('estoqueEmbalagens').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }), body('estoqueConteudoAberto').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }), body('estoqueMinimoEmbalagens').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }), body('unidadeConteudo').optional().isIn(['g', 'kg', 'ml', 'l', 'un']), body('estoqueMaximo').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0.001 }), body('unidadeVenda').optional().isIn(units), body('pesoPorUnidade').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }), body('unidadePeso').optional().isIn(['kg', 'g']), body('vendidoFracionado').optional().isBoolean(), body('aFazer').optional().isBoolean(), body('permitirVendaSemInsumo').optional().isBoolean(), body('fichaTecnica').optional().isArray()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const data = req.body;
    const produtoAtual = await Product.findById(req.params.id).select('tipo usavelEmReceita aFazer fichaTecnica');
    if (!produtoAtual) return res.status(404).json({ msg: 'Produto não encontrado' });
    if ((produtoAtual.tipo === 'insumo' || produtoAtual.usavelEmReceita) && ['precoCompra', 'custo', 'custoUnitario', 'conteudoPorEmbalagem', 'unidadeConteudo'].some((campo) => data[campo] !== undefined)) {
      return res.status(403).json({ msg: 'Custo e conteúdo de insumo só podem ser alterados por uma compra' });
    }
    const tipo = resolverTipoProduto({ ...data, tipo: data.tipo ?? undefined });
    const fichaRecebida = data.fichaTecnica === undefined ? produtoAtual.fichaTecnica : data.fichaTecnica;
    if (Boolean(data.aFazer ?? produtoAtual.aFazer) && (!Array.isArray(fichaRecebida) || fichaRecebida.length === 0)) return res.status(400).json({ msg: 'Produtos Coz precisam de uma ficha técnica com pelo menos um ingrediente' });
    if (data.codigo) {
      const duplicate = await Product.findOne({ codigo: { $regex: new RegExp(`^${data.codigo.trim()}$`, 'i') }, _id: { $ne: req.params.id } });
      if (duplicate) return res.status(400).json({ msg: 'Já existe um produto com este código' });
    }
    const fields = {};
    if (data.tipo !== undefined) fields.tipo = tipo;
    if (tipo === 'insumo') fields.usavelEmReceita = true;
    if (data.usavelEmReceita !== undefined && tipo === 'venda') fields.usavelEmReceita = Boolean(data.usavelEmReceita);
    ['codigo', 'nome', 'categoria', 'unidadeVenda', 'unidadeCompra'].forEach((key) => { if (data[key] !== undefined) fields[key] = String(data[key]).trim(); });
    ['preco', 'precoCompra', 'estoque', 'estoqueInsumos', 'estoqueEmbalagens', 'estoqueConteudoAberto', 'estoqueMaximo', 'estoqueMinimoInsumos', 'estoqueMinimoEmbalagens', 'pesoPorUnidade', 'rendimentoPorUnidadeCompra', 'conteudoPorEmbalagem'].forEach((key) => { if (data[key] !== undefined) fields[key] = Number(data[key]); });
    if (data.estoque !== undefined && tipo === 'insumo') {
      fields.estoqueInsumos = Number(data.estoque);
      fields.estoqueEmbalagens = Number(data.estoque);
      delete fields.estoque;
    }
    if (data.marcaReferencia !== undefined) fields.marcaReferencia = String(data.marcaReferencia).trim();
    if (data.unidadeConteudo !== undefined) fields.unidadeConteudo = data.unidadeConteudo;
    if (data.estoqueEmbalagens !== undefined) fields.estoqueInsumos = Number(data.estoqueEmbalagens);
    if (tipo === 'insumo' && (data.precoCompra !== undefined || data.conteudoPorEmbalagem !== undefined || data.unidadeConteudo !== undefined)) {
      const atual = await Product.findById(req.params.id).select('precoCompra conteudoPorEmbalagem unidadeConteudo estoqueMinimoEmbalagens unidadeConteudo').lean();
      fields.custoUnitarioBase = calcularCustoUnitarioBase(data.precoCompra ?? atual?.precoCompra, data.conteudoPorEmbalagem ?? atual?.conteudoPorEmbalagem, data.unidadeConteudo ?? atual?.unidadeConteudo);
      const unidadeConteudoAtual = data.unidadeConteudo ?? atual?.unidadeConteudo;
      const minimoAtual = fields.estoqueMinimoEmbalagens ?? atual?.estoqueMinimoEmbalagens ?? 0;
      fields.estoqueMinimoBase = calcularEstoqueMinimoBase(minimoAtual, unidadeConteudoAtual);
    } else if (tipo === 'insumo' && data.estoqueMinimoEmbalagens !== undefined) {
      const atual = await Product.findById(req.params.id).select('estoqueMinimoEmbalagens unidadeConteudo').lean();
      fields.estoqueMinimoBase = calcularEstoqueMinimoBase(fields.estoqueMinimoEmbalagens ?? 0, atual?.unidadeConteudo);
    }
    if (data.precoVenda !== undefined) fields.preco = Number(data.precoVenda);
    if (data.ativo !== undefined) fields.ativo = Boolean(data.ativo);
    if (tipo === 'insumo' && !data.categoria) fields.categoria = 'Insumos';
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
    const produtoAtualParaDesconto = await Product.findById(req.params.id).select('preco tipo').lean();
    const precoNormal = Number(data.precoVenda ?? data.preco ?? produtoAtualParaDesconto?.preco ?? 0);
    const descontosPorQuantidade = descontosDoProduto(data.descontosPorQuantidade, tipo, precoNormal);
    if (descontosPorQuantidade !== undefined) fields.descontosPorQuantidade = descontosPorQuantidade;
    ['vendidoFracionado', 'aFazer', 'permitirVendaSemInsumo', 'producaoPropria'].forEach((key) => { if (data[key] !== undefined) fields[key] = Boolean(data[key]); });
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
    res.json({ ...product.toObject(), ...dadosEstoqueProduto(product), resumoInsumo: product.tipo === 'insumo' ? calcularResumoCompleto(product) : null });
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
