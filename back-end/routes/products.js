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
const { calcularResumoCompleto, calcularCustoUnitarioBase, calcularEstoqueMinimoBase, estoqueTotalBase, paraBase, custoPorBase, calcularCustoDaFichaTecnica } = require('../utils/estoqueInsumo');
const { normalizarDescontos } = require('../utils/descontosQuantidade');
const { UNIDADES_PERMITIDAS, normalizarUnidade, casasDecimaisValidas } = require('../utils/unidades');
const { enfileirarRecalculoPorInsumo } = require('../utils/filaCusto');

const router = express.Router();
const units = UNIDADES_PERMITIDAS;
const compraUnits = UNIDADES_PERMITIDAS;
const camposCustoCalculado = (resultado, divisor = 1) => {
  const disponivel = resultado?.fonte === 'insumo' && Number.isFinite(Number(resultado.custoTotal)) && Number(divisor) > 0;
  const custo = disponivel ? Number(resultado.custoTotal) / Number(divisor) : 0;
  return {
    custoCalculado: disponivel ? custo : null,
    custo: disponivel ? custo : 0,
    custoUnitario: disponivel ? custo : 0,
    dataUltimoCalculo: new Date(),
    fonteCalculo: resultado?.fonte || 'indisponivel',
    custoUltimoSalvo: disponivel ? custo : 0,
  };
};
const dataLocal = () => { const agora = new Date(); return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`; };
const resolverTipoProdutoVenda = (data = {}) => data.tipoProduto || (data.aFazer ? 'coz' : data.producaoPropria ? 'producao' : 'revenda');
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
const toNumberOrZero = (valor) => { const n = Number(valor); return Number.isFinite(n) && n >= 0 ? n : 0; };
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
  body('ncm').optional({ checkFalsy: true }).customSanitizer((value) => (value === null || value === undefined ? '' : String(value).replace(/\D/g, '').slice(0, 8))).custom((value) => value === '' || /^[0-9]{8}$/.test(String(value))).withMessage('NCM deve ter 8 dígitos quando informado'),
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
  body('unidade').optional().custom((value) => units.includes(normalizarUnidade(value))),
  body('quantidade').optional().custom((value, { req }) => casasDecimaisValidas(value, req.body.unidade)),
  body('rendimento').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0.01 }),
  body('unidadeConteudo').optional().custom((value) => units.includes(normalizarUnidade(value))),
  body('marcaReferencia').optional().trim(),
  body('unidadeVenda').optional().isIn(units),
  body('unidadeCompra').optional().custom((value) => compraUnits.includes(normalizarUnidade(value))),
  body('rendimentoPorUnidadeCompra').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('pesoPorUnidade').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }),
  body('unidadePeso').optional().isIn(['kg']),
  body('vendidoFracionado').optional().isBoolean(),
  body('aFazer').optional().isBoolean(),
  body('tipoProduto').optional().isIn(['revenda', 'coz', 'producao']),
  body('rendimentoPorReceita').optional().isFloat({ min: 0.001 }),
  body('permitirVendaSemInsumo').optional().isBoolean(),
  body('producaoPropria').optional().isBoolean(),
];

router.get('/', auth, auth.allowRoles('admin', 'operador', 'garcom', 'cozinha'), async (req, res) => {
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
      tipoProduto: produto.tipo === 'venda' ? (produto.tipoProduto || (produto.aFazer ? 'coz' : produto.producaoPropria ? 'producao' : 'revenda')) : null,
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

router.post('/migracoes/normalizar-registros-legados', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const produtos = await Product.find({
      $or: [
        { tipo: { $in: [null, ''] } },
        { tipoProduto: { $in: [null, ''] } },
        { aFazer: { $exists: false } },
        { producaoPropria: { $exists: false } },
        { estoqueMinimo: { $lt: 0 } },
        { estoqueMinimo: null },
      ],
    });

    let corrigidos = 0;

    for (const produto of produtos) {
      const tipoPadrao = produto.controladoComoInsumo || produto.usavelEmReceita || produto.tipo === 'insumo' ? 'insumo' : 'venda';
      produto.tipo = produto.tipo || tipoPadrao;

      if (produto.tipo === 'insumo') {
        produto.usavelEmReceita = true;
        produto.aFazer = false;
        produto.producaoPropria = false;
        produto.tipoProduto = 'revenda';
        produto.estoqueMinimo = Number(produto.estoqueMinimo || 0);
        produto.estoqueMinimoInsumos = Number(produto.estoqueMinimoInsumos || produto.estoqueMinimoEmbalagens || 0);
        produto.estoqueMinimoEmbalagens = Number(produto.estoqueMinimoEmbalagens || produto.estoqueMinimoInsumos || 0);
        if (!produto.estoqueEmbalagens && Number(produto.estoqueInsumos || 0) > 0) {
          produto.estoqueEmbalagens = Number(produto.estoqueInsumos || 0);
        }
      } else {
        const tipoProdutoAtual = produto.tipoProduto || (produto.aFazer ? 'coz' : produto.producaoPropria ? 'producao' : 'revenda');
        produto.tipoProduto = tipoProdutoAtual;
        produto.aFazer = tipoProdutoAtual === 'coz';
        produto.producaoPropria = tipoProdutoAtual === 'producao';
        produto.estoqueMinimo = Number(produto.estoqueMinimo || 0);
      }

      produto.estoqueMinimo = Number.isFinite(produto.estoqueMinimo) ? Math.max(0, produto.estoqueMinimo) : 0;
      produto.estoqueMinimoInsumos = Number.isFinite(produto.estoqueMinimoInsumos) ? Math.max(0, Number(produto.estoqueMinimoInsumos)) : 0;
      produto.estoqueMinimoEmbalagens = Number.isFinite(produto.estoqueMinimoEmbalagens) ? Math.max(0, Number(produto.estoqueMinimoEmbalagens)) : 0;

      if (produto.controladoComoInsumo !== undefined) {
        produto.controladoComoInsumo = undefined;
      }

      await produto.save();
      corrigidos += 1;
    }

    res.json({ msg: 'Registros legados normalizados com sucesso.', produtosCorrigidos: corrigidos });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
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
    const tipoProduto = tipo === 'venda' ? resolverTipoProdutoVenda(data) : null;
    if (tipo === 'venda' && (data.precoVenda == null && data.preco == null)) return res.status(400).json({ msg: 'Preço de venda é obrigatório para produtos à venda' });
    if ((tipo === 'insumo' || data.usavelEmReceita === true) && (data.precoCompra === undefined || Number(data.precoCompra) < 0)) return res.status(400).json({ msg: 'Preço de compra inválido' });
    if (data.usavelEmReceita === true && (!Number.isFinite(Number(data.conteudoPorEmbalagem)) || Number(data.conteudoPorEmbalagem) < 0)) return res.status(400).json({ msg: 'Conteúdo por embalagem inválido' });
    const exists = await Product.findOne({ codigo: { $regex: new RegExp(`^${data.codigo.trim()}$`, 'i') } });
    if (exists) return res.status(400).json({ msg: 'Já existe um produto com este código' });
    const estoque = tipoProduto === 'coz' ? 0 : toNumberOrZero(data.estoque);
    const estoqueInsumos = toNumberOrZero(data.estoqueInsumos);
    const fichaTecnica = Array.isArray(data.fichaTecnica) ? data.fichaTecnica.map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade), unidade: item.unidade })).filter((item) => item.produtoId && Number.isFinite(item.quantidade) && item.quantidade > 0 && units.includes(item.unidade)) : [];
    const custoUnitario = toNumberOrZero(data.custoUnitario ?? data.custo);
    const pesoPorUnidade = toNumberOrZero(data.pesoPorUnidade);
    const unidadeVenda = normalizarUnidade(data.unidadeVenda || data.unidade || 'un');
    const unidadeCompra = normalizarUnidade(data.unidadeCompra || data.unidade || 'kg');
    const categoria = tipo === 'insumo' ? 'Insumos' : (data.categoria || 'Outros');
    const precoVenda = toNumberOrZero(data.precoVenda ?? data.preco);
    const precoCompra = toNumberOrZero(data.precoCompra);
    const descontoPorUnidadeCompra = toNumberOrZero(data.rendimentoPorUnidadeCompra);
    const descontosPorQuantidade = descontosDoProduto(data.descontosPorQuantidade, tipo, precoVenda);
    const unidadeConteudo = normalizarUnidade(data.unidadeConteudo || unidadeCompra);
    const conteudoPorEmbalagem = toNumberOrZero(data.conteudoPorEmbalagem || data.quantidade || 1);
    const estoqueEmbalagens = tipo === 'insumo' ? toNumberOrZero(data.estoqueEmbalagens ?? estoque) : 0;
    const estoqueConteudoAberto = tipo === 'insumo' ? toNumberOrZero(data.estoqueConteudoAberto) : 0;
    const estoquePesoKg = pesoPorUnidade > 0 && unidadeVenda === 'kg'
      ? estoque * pesoPorUnidade
      : 0;
    const deveAplicarConversao = tipo === 'venda' && descontoPorUnidadeCompra > 1 && unidadeCompra !== unidadeVenda;
    const custoUnitarioBaseRevenda = precoCompra > 0 && conteudoPorEmbalagem > 0 ? precoCompra / conteudoPorEmbalagem : 0;
    const unidade = normalizarUnidade(data.unidade || unidadeCompra);
    const quantidade = toNumberOrZero(data.quantidade ?? data.conteudoPorEmbalagem ?? 1);
    const rendimento = data.rendimento == null ? (descontoPorUnidadeCompra > 0 ? descontoPorUnidadeCompra : null) : toNumberOrZero(data.rendimento);
    const product = await Product.create({
      codigo: data.codigo.trim(),
      nome: data.nome.trim(),
      ncm: String(data.ncm ?? '').replace(/\D/g, '').slice(0, 8),
      tipo,
      unidade,
      quantidade,
      rendimento,
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
      rendimentoPorUnidadeCompra: descontoPorUnidadeCompra,
      custo: custoUnitario,
      custoUnitario,
      custoUnitarioBase: tipo === 'insumo' || data.usavelEmReceita ? calcularCustoUnitarioBase(precoCompra, conteudoPorEmbalagem, unidadeConteudo) : custoUnitarioBaseRevenda,
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
      aFazer: tipoProduto === 'coz',
      permitirVendaSemInsumo: Boolean(data.permitirVendaSemInsumo),
      fichaTecnica,
      producaoPropria: tipoProduto === 'producao',
      tipoProduto,
      rendimentoPorReceita: tipoProduto === 'producao' ? Number(data.rendimentoPorReceita || 1) : 1,
      usavelEmReceita: tipo === 'insumo' || Boolean(data.usavelEmReceita),
      ativo: data.ativo !== undefined ? Boolean(data.ativo) : true,
      createdBy: req.user.id,
    });

    // Calcular custo a partir da ficha técnica se for produto de venda com ficha
    if (tipo === 'venda' && fichaTecnica.length > 0) {
      const resultadoCusto = await calcularCustoDaFichaTecnica(fichaTecnica);
      await Product.findByIdAndUpdate(product._id, {
        $set: camposCustoCalculado(resultadoCusto),
      });
      // Recarregar produto com custo atualizado
      const updatedProduct = await Product.findById(product._id);
      return res.status(201).json(updatedProduct);
    }
    if (tipo === 'insumo' && data.precoCompra !== undefined) enfileirarRecalculoPorInsumo(product._id);
    
    res.status(201).json(product);
  } catch (err) {
    const message = err.code === 11000 ? 'Código duplicado' : err.message;
    res.status(400).json({ error: message, msg: message });
  }
});

router.put('/:id', auth, auth.allowRoles('admin'), [body('codigo').optional().trim().notEmpty(), body('nome').optional().trim().notEmpty(), body('preco').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }), body('estoque').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }), body('estoqueEmbalagens').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }), body('estoqueConteudoAberto').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }), body('estoqueMinimoEmbalagens').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }), body('unidade').optional().customSanitizer(normalizarUnidade).custom((value) => units.includes(value)).withMessage('Unidade deve ser kg, L ou un'), body('quantidade').optional().custom((value, { req }) => casasDecimaisValidas(value, req.body.unidade)).withMessage('Quantidade inválida para a unidade selecionada'), body('rendimento').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0.01 }), body('unidadeConteudo').optional().customSanitizer(normalizarUnidade).custom((value) => units.includes(value)).withMessage('Unidade do conteúdo deve ser kg, L ou un'), body('estoqueMaximo').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0.001 }), body('unidadeVenda').optional().customSanitizer(normalizarUnidade).custom((value) => units.includes(value)).withMessage('Unidade de venda deve ser kg, L ou un'), body('unidadeCompra').optional().customSanitizer(normalizarUnidade).custom((value) => units.includes(value)).withMessage('Unidade de compra deve ser kg, L ou un'), body('pesoPorUnidade').customSanitizer(limparCampoOpcional).optional().isFloat({ min: 0 }), body('unidadePeso').optional().isIn(['kg']).withMessage('Unidade de peso deve ser kg'), body('vendidoFracionado').optional().isBoolean(), body('aFazer').optional().isBoolean(), body('tipoProduto').optional().isIn(['revenda', 'coz', 'producao']), body('rendimentoPorReceita').optional().isFloat({ min: 0.001 }), body('permitirVendaSemInsumo').optional().isBoolean(), body('fichaTecnica').optional().isArray()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const data = req.body;
    const produtoAtual = await Product.findById(req.params.id).select('tipo usavelEmReceita aFazer fichaTecnica tipoProduto producaoPropria estoque codigo custoCalculado custo custoUnitario precoCompra conteudoPorEmbalagem unidadeConteudo unidadeCompra unidadeVenda');
    if (!produtoAtual) return res.status(404).json({ msg: 'Produto não encontrado' });
    const tipo = resolverTipoProduto({ ...data, tipo: data.tipo ?? undefined });
    const tipoProduto = tipo === 'venda' ? resolverTipoProdutoVenda({ ...produtoAtual.toObject(), ...data }) : null;
    if (data.codigo !== undefined && String(data.codigo).trim() !== String(produtoAtual.codigo).trim()) {
      return res.status(403).json({ msg: 'Código do produto não pode ser alterado.' });
    }
    if (data.codigo) {
      const duplicate = await Product.findOne({ codigo: { $regex: new RegExp(`^${data.codigo.trim()}$`, 'i') }, _id: { $ne: req.params.id } });
      if (duplicate) return res.status(400).json({ msg: 'Já existe um produto com este código' });
    }
    const unidadeVenda = data.unidadeVenda ?? produtoAtual.unidadeVenda ?? 'un';
    const unidadeCompra = data.unidadeCompra ?? produtoAtual.unidadeCompra ?? 'kg';
    const rendimentoPorUnidadeCompra = Number(data.rendimentoPorUnidadeCompra ?? produtoAtual.rendimentoPorUnidadeCompra ?? 0);
    const deveAplicarConversao = tipo === 'venda' && rendimentoPorUnidadeCompra > 1 && unidadeCompra !== unidadeVenda;
    const fields = {};
    if (data.tipo !== undefined) fields.tipo = tipo;
    if (data.usavelEmReceita !== undefined) fields.usavelEmReceita = Boolean(data.usavelEmReceita);
    ['nome', 'categoria'].forEach((key) => { if (data[key] !== undefined) fields[key] = String(data[key]).trim(); });
    if (data.ncm !== undefined) fields.ncm = String(data.ncm ?? '').replace(/\D/g, '').slice(0, 8);
    ['unidade', 'unidadeVenda', 'unidadeCompra', 'unidadeConteudo'].forEach((key) => { if (data[key] !== undefined) fields[key] = normalizarUnidade(data[key]); });
    ['preco', 'precoCompra', 'estoque', 'estoqueInsumos', 'estoqueEmbalagens', 'estoqueConteudoAberto', 'estoqueMaximo', 'estoqueMinimoInsumos', 'estoqueMinimoEmbalagens', 'pesoPorUnidade', 'rendimentoPorUnidadeCompra', 'conteudoPorEmbalagem', 'quantidade', 'rendimento'].forEach((key) => { if (data[key] !== undefined) fields[key] = toNumberOrZero(data[key]); });
    if (data.unidade !== undefined && data.quantidade !== undefined) fields.quantidade = Number(data.quantidade);
    if (data.estoque !== undefined && tipo === 'insumo') {
      fields.estoqueInsumos = toNumberOrZero(data.estoque);
      fields.estoqueEmbalagens = toNumberOrZero(data.estoque);
      delete fields.estoque;
    }
    if (data.marcaReferencia !== undefined) fields.marcaReferencia = String(data.marcaReferencia).trim();
    if (data.unidadeConteudo !== undefined) fields.unidadeConteudo = data.unidadeConteudo;
    if (data.estoqueEmbalagens !== undefined) fields.estoqueInsumos = toNumberOrZero(data.estoqueEmbalagens);
    if (tipo === 'insumo' && (data.precoCompra !== undefined || data.conteudoPorEmbalagem !== undefined || data.unidadeConteudo !== undefined)) {
      const atual = await Product.findById(req.params.id).select('precoCompra conteudoPorEmbalagem unidadeConteudo estoqueMinimoEmbalagens unidadeConteudo').lean();
      fields.custoUnitarioBase = calcularCustoUnitarioBase(data.precoCompra ?? atual?.precoCompra, data.conteudoPorEmbalagem ?? atual?.conteudoPorEmbalagem, data.unidadeConteudo ?? atual?.unidadeConteudo);
      const unidadeConteudoAtual = data.unidadeConteudo ?? atual?.unidadeConteudo;
      const minimoAtual = fields.estoqueMinimoEmbalagens ?? atual?.estoqueMinimoEmbalagens ?? 0;
      fields.estoqueMinimoBase = calcularEstoqueMinimoBase(minimoAtual, unidadeConteudoAtual);
    } else if (tipo === 'venda' && tipoProduto === 'revenda' && (data.precoCompra !== undefined || data.conteudoPorEmbalagem !== undefined)) {
      const precoCompraAtual = toNumberOrZero(data.precoCompra ?? produtoAtual.precoCompra);
      const conteudoAtual = toNumberOrZero(data.conteudoPorEmbalagem ?? produtoAtual.conteudoPorEmbalagem);
      fields.custoUnitarioBase = precoCompraAtual > 0 && conteudoAtual > 0 ? precoCompraAtual / conteudoAtual : 0;
    } else if (tipo === 'insumo' && data.estoqueMinimoEmbalagens !== undefined) {
      const atual = await Product.findById(req.params.id).select('estoqueMinimoEmbalagens unidadeConteudo').lean();
      fields.estoqueMinimoBase = calcularEstoqueMinimoBase(fields.estoqueMinimoEmbalagens ?? 0, atual?.unidadeConteudo);
    }
    if (data.precoVenda !== undefined) fields.preco = Number(data.precoVenda);
    if (data.ativo !== undefined) fields.ativo = Boolean(data.ativo);
    if (data.unidadePeso !== undefined) fields.unidadePeso = data.unidadePeso;
    if (data.estoque !== undefined || data.pesoPorUnidade !== undefined || data.unidadeVenda !== undefined || data.unidadePeso !== undefined) {
      const atual = await Product.findById(req.params.id).select('estoque pesoPorUnidade unidadeVenda unidadePeso').lean();
      const estoque = toNumberOrZero(data.estoque ?? atual?.estoque);
      const peso = toNumberOrZero(data.pesoPorUnidade ?? atual?.pesoPorUnidade);
      const unidade = data.unidadeVenda || atual?.unidadeVenda;
      fields.estoquePesoKg = peso > 0 && ['kg', 'g'].includes(unidade) ? estoque * (unidade === 'kg' ? peso : peso / 1000) : 0;
    }
    if (data.custoUnitario !== undefined || data.custo !== undefined) {
      const receitaVinculada = await Recipe.exists({ produtoId: req.params.id, ativa: true });
      if (!receitaVinculada) {
        const custoUnitario = toNumberOrZero(data.custoUnitario ?? data.custo);
        fields.custoUnitario = custoUnitario;
        fields.custo = custoUnitario;
      }
    }
    const produtoAtualParaDesconto = await Product.findById(req.params.id).select('preco tipo').lean();
    const precoNormal = toNumberOrZero(data.precoVenda ?? data.preco ?? produtoAtualParaDesconto?.preco);
    const descontosPorQuantidade = descontosDoProduto(data.descontosPorQuantidade, tipo, precoNormal);
    if (descontosPorQuantidade !== undefined) fields.descontosPorQuantidade = descontosPorQuantidade;
    ['vendidoFracionado', 'permitirVendaSemInsumo'].forEach((key) => { if (data[key] !== undefined) fields[key] = Boolean(data[key]); });
    if (tipo === 'venda' && (data.tipoProduto !== undefined || data.aFazer !== undefined || data.producaoPropria !== undefined)) {
      fields.tipoProduto = tipoProduto;
      fields.aFazer = tipoProduto === 'coz';
      fields.producaoPropria = tipoProduto === 'producao';
      fields.estoque = tipoProduto === 'coz' ? 0 : toNumberOrZero(data.estoque ?? produtoAtual.estoque);
    }
    if (data.rendimentoPorReceita !== undefined) fields.rendimentoPorReceita = toNumberOrZero(data.rendimentoPorReceita);
    if (data.fichaTecnica !== undefined) fields.fichaTecnica = data.fichaTecnica.map((item) => ({ produtoId: item.produtoId, quantidade: toNumberOrZero(item.quantidade), unidade: item.unidade }));
    const fichaTecnicaAlterada = data.fichaTecnica !== undefined;
    if (data.estoque !== undefined && antesDasOito()) {
      fields.estoqueInicialDia = Number(data.estoque);
      fields.estoqueInicialData = dataLocal();
    }
    if (data.estoqueInsumos !== undefined && antesDasOito()) {
      fields.estoqueInsumosInicial = Number(data.estoqueInsumos);
      fields.estoqueInsumosInicialData = dataLocal();
    }

    // Calcular custo a partir da ficha técnica se alterada
    let custoRecalculado = null;
    let divergenciaAviso = null;
    if (tipo === 'venda' && fichaTecnicaAlterada) {
      const novaFicha = fields.fichaTecnica || [];
      if (novaFicha.length > 0) {
        const resultadoCusto = await calcularCustoDaFichaTecnica(novaFicha);
        const custoAnterior = Number(produtoAtual.custoCalculado || produtoAtual.custo || produtoAtual.custoUnitario || 0);
        const custoNovo = resultadoCusto.fonte === 'insumo' ? resultadoCusto.custoTotal : null;
        
        // Verificar divergência > 5%
        if (custoAnterior > 0 && custoNovo > 0) {
          const variacao = Math.abs(((custoNovo - custoAnterior) / custoAnterior) * 100);
          if (variacao > 5 && !data.confirmarDivergenciaCusto) {
            divergenciaAviso = {
              custoAnterior,
              custoNovo,
              variacao: Number(variacao.toFixed(2)),
              mensagem: `Custo divergiu ${variacao.toFixed(2)}% (era R$ ${custoAnterior.toFixed(2)}, será R$ ${custoNovo.toFixed(2)}). Confirme para salvar.`
            };
          }
        }
        
        if (!divergenciaAviso) {
          custoRecalculado = {
            ...camposCustoCalculado(resultadoCusto),
          };
        }
      }
      if (novaFicha.length === 0) custoRecalculado = camposCustoCalculado({ fonte: 'indisponivel', custoTotal: 0 });
    }

    if (divergenciaAviso) {
      return res.status(409).json({ msg: 'Divergência de custo detectada', divergencia: divergenciaAviso, requireConfirmation: true });
    }

    const product = await Product.findByIdAndUpdate(req.params.id, { $set: { ...fields, ...custoRecalculado } }, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ msg: 'Produto não encontrado' });
    if (tipo === 'insumo' && data.precoCompra !== undefined) enfileirarRecalculoPorInsumo(product._id);
    
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

// Rota para recalcular custo de todos os produtos que usam um insumo (quando preço do insumo muda)
router.post('/recalcular-custos-insumo/:insumoId', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const insumo = await Product.findById(req.params.insumoId);
    if (!insumo || insumo.tipo !== 'insumo') return res.status(404).json({ msg: 'Insumo não encontrado' });

    // Buscar todos os produtos de venda que têm este insumo na ficha técnica
    const produtosDependentes = await Product.find({
      tipo: 'venda',
      'fichaTecnica.produtoId': insumo._id,
    });

    const resultados = [];
    for (const produto of produtosDependentes) {
      const resultadoCusto = await calcularCustoDaFichaTecnica(produto.fichaTecnica);
      const custoAnterior = Number(produto.custoCalculado || produto.custo || produto.custoUnitario || 0);
      const custoNovo = resultadoCusto.custoTotal;
      const variacao = custoAnterior > 0 ? Math.abs(((custoNovo - custoAnterior) / custoAnterior) * 100) : 0;

      await Product.findByIdAndUpdate(produto._id, { $set: camposCustoCalculado(resultadoCusto) });

      resultados.push({
        produtoId: produto._id,
        produtoNome: produto.nome,
        custoAnterior,
        custoNovo: resultadoCusto.fonte === 'insumo' ? resultadoCusto.custoTotal : null,
        variacao: Number(variacao.toFixed(2)),
        fonte: resultadoCusto.fonte,
        mensagem: resultadoCusto.mensagem,
      });
    }

    res.json({ msg: 'Custos recalculados', insumo: insumo.nome, produtosAtualizados: resultados.length, detalhes: resultados });
  } catch (err) { res.status(400).json({ msg: err.message }); }
});

// Rota para recalcular custo de um produto específico
router.post('/recalcular-custo/:produtoId', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const produto = await Product.findById(req.params.produtoId);
    if (!produto) return res.status(404).json({ msg: 'Produto não encontrado' });
    if (produto.tipo !== 'venda' || !produto.fichaTecnica?.length) {
      return res.status(400).json({ msg: 'Produto não possui ficha técnica para calcular custo' });
    }

    const resultadoCusto = await calcularCustoDaFichaTecnica(produto.fichaTecnica);
    const custoAnterior = Number(produto.custoCalculado || produto.custo || produto.custoUnitario || 0);
    const custoNovo = resultadoCusto.custoTotal;

    await Product.findByIdAndUpdate(produto._id, { $set: camposCustoCalculado(resultadoCusto) });

    res.json({
      msg: 'Custo recalculado',
      produtoId: produto._id,
      produtoNome: produto.nome,
      custoAnterior,
      custoNovo: resultadoCusto.fonte === 'insumo' ? resultadoCusto.custoTotal : null,
      variacao: custoAnterior > 0 ? Number((Math.abs(((custoNovo - custoAnterior) / custoAnterior) * 100)).toFixed(2)) : 0,
      fonte: resultadoCusto.fonte,
      mensagem: resultadoCusto.mensagem,
      detalhes: resultadoCusto.detalhes,
    });
  } catch (err) { res.status(400).json({ msg: err.message }); }
});

module.exports = router;
