const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const Comanda = require('../models/Comanda');
const Customer = require('../models/Customer');
const MesasSettings = require('../models/MesasSettings');
const Product = require('../models/Product');
const { calcularPrecoComDesconto, calcularPrecoGrupo, dinheiro } = require('../utils/descontosQuantidade');
const { ajustarEstoque } = require('../utils/movimentarEstoqueVenda');
const { precoPorUnidade } = require('../utils/pesoProduto');
const { produtoControlaPeso } = require('../utils/estoqueProduto');

const router = express.Router();
const atendenteQr = 'Autoatendimento QR';
const audienciaCotacaoQr = 'pedido-qr';
const camposExtrasIgnorados = new Set(['mesa', 'preco', 'nomeProduto']);
const limitarPedidosQr = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { msg: 'Muitos pedidos. Tente novamente mais tarde.' },
});
const limitarCotacoesQr = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { msg: 'Muitas atualizações de preço. Tente novamente mais tarde.' },
});

const erroValidacao = (msg) => Object.assign(new Error(msg), { status: 400 });
const respostaComanda = (comanda) => ({
  comandaId: String(comanda._id),
  numero: comanda.numero,
  status: comanda.status,
  mesa: comanda.mesa,
});
const possuiCamposNaoPermitidos = (valor, permitidos) => Object.keys(valor)
  .some((campo) => !permitidos.has(campo) && !camposExtrasIgnorados.has(campo));

const localizarMesa = async (mesaToken, session) => {
  let query = MesasSettings.findById('principal').select('mesas');
  if (session) query = query.session(session);
  const settings = await query.lean();
  return settings?.mesas?.find((mesa) => mesa.token === mesaToken) || null;
};

const validarItens = (itensSolicitados) => {
  if (!Array.isArray(itensSolicitados) || itensSolicitados.length < 1 || itensSolicitados.length > 50) {
    throw erroValidacao('Informe entre 1 e 50 itens');
  }

  const camposItem = new Set(['produtoId', 'quantidade', 'observacao']);
  return itensSolicitados.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || possuiCamposNaoPermitidos(item, camposItem)) {
      throw erroValidacao('Item inválido');
    }
    if (typeof item.produtoId !== 'string' || !mongoose.isValidObjectId(item.produtoId)
      || !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 99) {
      throw erroValidacao('Item ou quantidade inválidos');
    }
    const observacao = item.observacao === undefined ? '' : item.observacao;
    if (typeof observacao !== 'string' || observacao.length > 250) throw erroValidacao('Observação inválida');
    return { produtoId: item.produtoId, quantidade: item.quantidade, observacao: observacao.trim() };
  });
};

const resumirCotacao = (itens) => itens.map((item) => ({
  produtoId: String(item.produtoId),
  quantidade: item.quantidade,
  precoUnitario: item.precoUnitario,
  total: dinheiro(item.precoUnitario * item.quantidade),
})).sort((a, b) => a.produtoId.localeCompare(b.produtoId));

const calcularTotalCotacao = (itens) => dinheiro(itens.reduce((soma, item) => soma + item.total, 0));

const erroCotacaoDesatualizada = () => Object.assign(
  new Error('Os preços mudaram ou a cotação expirou. Atualize o total antes de confirmar o pedido.'),
  { status: 409, code: 'COTACAO_DESATUALIZADA' },
);

const validarCotacao = (token, mesaToken, itensAtuais) => {
  let cotacao;
  try {
    cotacao = jwt.verify(token, process.env.JWT_SECRET, { audience: audienciaCotacaoQr });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw erroCotacaoDesatualizada();
    }
    throw error;
  }

  const itensCotados = Array.isArray(cotacao.itens) ? resumirCotacao(cotacao.itens) : [];
  const itensRecalculados = resumirCotacao(itensAtuais);
  const totalCotado = calcularTotalCotacao(itensCotados);
  const totalRecalculado = calcularTotalCotacao(itensRecalculados);
  if (cotacao.mesaToken !== mesaToken
    || JSON.stringify(itensCotados) !== JSON.stringify(itensRecalculados)
    || cotacao.total !== totalCotado
    || totalCotado !== totalRecalculado) {
    throw erroCotacaoDesatualizada();
  }
};

const localizarPedidoIdempotente = (idempotencyKey, session) => {
  let query = Comanda.findOne({
    atendente: atendenteQr,
    $or: [
      { idempotencyKey },
      { 'pedidosQr.idempotencyKey': idempotencyKey },
    ],
  });
  if (session) query = query.session(session);
  return query.lean();
};

const hashPedidoSalvo = (comanda, idempotencyKey) => (
  comanda.pedidosQr?.find((pedido) => pedido.idempotencyKey === idempotencyKey)?.idempotencyHash
  || (comanda.idempotencyKey === idempotencyKey ? comanda.idempotencyHash : undefined)
);

const responderReplay = (res, comanda, hash, idempotencyKey) => {
  if (hashPedidoSalvo(comanda, idempotencyKey) !== hash) {
    return res.status(409).json({ msg: 'Esta chave já foi usada em outro pedido' });
  }
  return res.status(200).json(respostaComanda(comanda));
};

const validarPedido = (body, idempotencyKey) => {
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) {
    throw erroValidacao('Chave de idempotência inválida');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw erroValidacao('Pedido inválido');
  const camposBody = new Set(['mesaToken', 'clienteNome', 'clienteTelefone', 'consentimentoWhatsApp', 'itens', 'cotacaoToken']);
  if (possuiCamposNaoPermitidos(body, camposBody)) throw erroValidacao('Pedido contém campos não permitidos');

  const clienteNome = typeof body.clienteNome === 'string' ? body.clienteNome.trim() : '';
  const clienteTelefone = typeof body.clienteTelefone === 'string' ? body.clienteTelefone.replace(/\D/g, '') : '';
  if (!clienteNome || clienteNome.length > 120) throw erroValidacao('Informe um nome válido');
  if (clienteTelefone.length < 10 || clienteTelefone.length > 13) throw erroValidacao('Informe um telefone válido');
  if (body.consentimentoWhatsApp !== true) throw erroValidacao('É necessário aceitar atualizações do pedido por WhatsApp');
  if (typeof body.mesaToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.mesaToken)) {
    throw erroValidacao('Token de mesa inválido');
  }
  const itens = validarItens(body.itens);
  if (typeof body.cotacaoToken !== 'string' || !body.cotacaoToken || body.cotacaoToken.length > 4096) {
    throw erroValidacao('Atualize os preços antes de confirmar o pedido');
  }

  return {
    mesaToken: body.mesaToken,
    clienteNome,
    clienteTelefone,
    consentimentoWhatsApp: true,
    itens,
    cotacaoToken: body.cotacaoToken,
  };
};

const construirItens = (itensSolicitados, produtos) => {
  const porId = new Map(produtos.map((produto) => [String(produto._id), produto]));
  const quantidades = new Map();
  itensSolicitados.forEach((item) => {
    quantidades.set(item.produtoId, (quantidades.get(item.produtoId) || 0) + item.quantidade);
  });
  const cartItens = itensSolicitados.map((item) => ({
    produto: porId.get(item.produtoId),
    quantidade: item.quantidade,
  }));
  const itens = itensSolicitados.map((solicitado) => {
    const produto = porId.get(solicitado.produtoId);
    if (!produto) throw erroValidacao('Um ou mais produtos não estão disponíveis');
    const precoBase = precoPorUnidade(produto);
    const pricing = calcularPrecoComDesconto(produto, quantidades.get(solicitado.produtoId), precoBase);
    const grupoPricing = calcularPrecoGrupo(
      produto,
      quantidades.get(solicitado.produtoId),
      cartItens,
      pricing.precoUnitario,
    );
    const aplicarDescontoGrupo = grupoPricing?.grupoAtivo && grupoPricing.precoUnitario < pricing.precoUnitario;
    const pesoControlado = produtoControlaPeso(produto);

    return {
      produtoId: produto.id,
      codigo: produto.codigo,
      nome: produto.nome,
      precoUnitario: aplicarDescontoGrupo ? grupoPricing.precoUnitario : pricing.precoUnitario,
      precoUnitarioOriginal: pricing.precoNormal,
      descontoQuantidade: aplicarDescontoGrupo ? grupoPricing.economiaUnitario : pricing.economiaUnitario,
      economiaQuantidade: aplicarDescontoGrupo ? grupoPricing.economiaTotal : pricing.economiaTotal,
      faixaDescontoQuantidade: aplicarDescontoGrupo ? undefined : pricing.faixaAplicada?.quantidadeMinima,
      grupoDescontoAtivo: Boolean(aplicarDescontoGrupo),
      totalGrupo: grupoPricing?.totalGrupo || 0,
      faltamParaGrupo: grupoPricing?.faltamParaGrupo || 0,
      quantidade: solicitado.quantidade,
      quantidadePecas: solicitado.quantidade,
      tipoVenda: pesoControlado ? 'inteiro' : 'unidade',
      unidadeVenda: produto.unidadeVenda,
      pesoPorUnidade: produto.pesoPorUnidade,
      unidadePeso: produto.unidadePeso,
      observacao: solicitado.observacao,
      aFazer: Boolean(produto.aFazer),
      insumosConsumidos: (produto.fichaTecnica || []).map((ingrediente) => ({
        produtoId: ingrediente.produtoId,
        quantidade: ingrediente.quantidade,
        unidade: ingrediente.unidade,
      })),
    };
  });
  return itens;
};

router.get('/auto-atendimento/:mesaToken', async (req, res, next) => {
  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(req.params.mesaToken)) return res.status(404).json({ msg: 'Mesa não encontrada' });
    const mesa = await localizarMesa(req.params.mesaToken);
    if (!mesa?.ativa) return res.status(404).json({ msg: 'Mesa não encontrada' });
    const produtos = await Product.find({ tipo: 'venda', ativo: true })
      .select('_id nome categoria preco unidadeVenda pesoPorUnidade unidadePeso')
      .sort({ nome: 1, _id: 1 })
      .lean();
    return res.json({
      mesa: { numero: mesa.numero, nome: mesa.nome },
      produtos: produtos.map((produto) => ({
        produtoId: String(produto._id),
        nome: produto.nome,
        categoria: produto.categoria,
        preco: precoPorUnidade(produto),
        unidadeVenda: produto.unidadeVenda,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/auto-atendimento/:mesaToken/cotacao', limitarCotacoesQr, async (req, res, next) => {
  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(req.params.mesaToken)) return res.status(404).json({ msg: 'Mesa não encontrada' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || possuiCamposNaoPermitidos(req.body, new Set(['itens']))) {
      throw erroValidacao('Cotação inválida');
    }
    const mesa = await localizarMesa(req.params.mesaToken);
    if (!mesa?.ativa) return res.status(404).json({ msg: 'Mesa não encontrada' });

    const itensSolicitados = validarItens(req.body.itens);
    const productIds = [...new Set(itensSolicitados.map((item) => item.produtoId))];
    const produtos = await Product.find({ _id: { $in: productIds }, tipo: 'venda', ativo: true });
    if (produtos.length !== productIds.length) throw erroValidacao('Um ou mais produtos não estão disponíveis');
    const itens = construirItens(itensSolicitados, produtos);
    const itensCotados = resumirCotacao(itens);
    const total = calcularTotalCotacao(itensCotados);
    const cotacaoToken = jwt.sign(
      { mesaToken: req.params.mesaToken, itens: itensCotados, total },
      process.env.JWT_SECRET,
      { expiresIn: '10m', audience: audienciaCotacaoQr },
    );
    return res.json({ itens: itensCotados, total, cotacaoToken });
  } catch (error) {
    if (error.status && error.status < 500) return res.status(error.status).json({ msg: error.message });
    return next(error);
  }
});

router.post('/auto-atendimento', limitarPedidosQr, async (req, res, next) => {
  let session;
  let hash;
  let idempotencyKey;
  try {
    idempotencyKey = req.get('Idempotency-Key');
    const pedido = validarPedido(req.body, idempotencyKey);
    hash = crypto.createHash('sha256').update(JSON.stringify(pedido)).digest('hex');
    const anterior = await localizarPedidoIdempotente(idempotencyKey);
    if (anterior) return responderReplay(res, anterior, hash, idempotencyKey);

    session = await mongoose.startSession();
    let comanda;
    let replay = false;
    let anexado = false;
    await session.withTransaction(async () => {
      const bloqueioMesa = await MesasSettings.updateOne(
        { _id: 'principal', 'mesas.token': pedido.mesaToken, 'mesas.ativa': true },
        { $inc: { qrPedidoLockVersion: 1 } },
        { session },
      );
      if (bloqueioMesa.matchedCount !== 1) throw Object.assign(new Error('Mesa não encontrada'), { status: 404 });

      const repetido = await localizarPedidoIdempotente(idempotencyKey, session);
      if (repetido) {
        if (hashPedidoSalvo(repetido, idempotencyKey) !== hash) {
          throw Object.assign(new Error('Esta chave já foi usada em outro pedido'), { status: 409 });
        }
        comanda = repetido;
        replay = true;
        return;
      }

      const mesa = await localizarMesa(pedido.mesaToken, session);
      if (!mesa?.ativa) throw Object.assign(new Error('Mesa não encontrada'), { status: 404 });

      const productIds = [...new Set(pedido.itens.map((item) => item.produtoId))];
      const produtos = await Product.find({ _id: { $in: productIds }, tipo: 'venda', ativo: true }).session(session);
      if (produtos.length !== productIds.length) throw erroValidacao('Um ou mais produtos não estão disponíveis');
      const itens = construirItens(pedido.itens, produtos);
      validarCotacao(pedido.cotacaoToken, pedido.mesaToken, itens);
      const customer = await Customer.findOne({ telefone: pedido.clienteTelefone }).session(session);
      const cliente = customer || new Customer({ nome: pedido.clienteNome, telefone: pedido.clienteTelefone });
      if (!customer) await cliente.save({ session });

      const comandaQrAberta = await Comanda.findOne({
        origem: 'qr',
        tipoAtendimento: 'mesa',
        mesa: String(mesa.numero),
        status: 'aberta',
      }).sort({ createdAt: -1, _id: -1 }).session(session);

      try {
        await ajustarEstoque(itens, 'baixar', session);
      } catch (error) {
        if (error.message.startsWith('Estoque insuficiente para ')) {
          throw Object.assign(new Error('Estoque insuficiente para um ou mais itens'), { status: 400 });
        }
        throw error;
      }
      const pedidoQrId = new mongoose.Types.ObjectId();
      const registradoEm = new Date();
      const itensDoPedido = itens.map((item) => ({ ...item, pedidoQrId }));
      const pedidoQr = {
        _id: pedidoQrId,
        clienteNome: pedido.clienteNome,
        clienteId: cliente._id,
        criadoEm: registradoEm,
        idempotencyKey,
        idempotencyHash: hash,
        consentimentoWhatsApp: { aceito: true, registradoEm },
      };

      if (comandaQrAberta) {
        comandaQrAberta.itens.push(...itensDoPedido);
        comandaQrAberta.pedidosQr.push(pedidoQr);
        comandaQrAberta.valorTotal = Math.max(0, Math.round((
          comandaQrAberta.itens.reduce((total, item) => total + item.precoUnitario * item.quantidade, 0)
          + Number(comandaQrAberta.taxaEntrega || 0)
          - Number(comandaQrAberta.desconto || 0)
          + Number.EPSILON
        ) * 100) / 100);
        await comandaQrAberta.save({ session });
        comanda = comandaQrAberta;
        anexado = true;
      } else {
        const subtotal = Math.round((itensDoPedido.reduce((total, item) => total + item.precoUnitario * item.quantidade, 0) + Number.EPSILON) * 100) / 100;
        [comanda] = await Comanda.create([{
          atendente: atendenteQr,
          idempotencyKey,
          idempotencyHash: hash,
          clienteId: cliente._id,
          clienteNome: cliente.nome,
          clienteTelefone: pedido.clienteTelefone,
          mesa: String(mesa.numero),
          tipoAtendimento: 'mesa',
          origem: 'qr',
          consentimentoWhatsApp: { aceito: true, registradoEm },
          pedidosQr: [pedidoQr],
          itens: itensDoPedido,
          valorTotal: subtotal,
          saldoDevedor: subtotal,
          status: 'aberta',
          statusPagamento: 'pendente',
          estoqueBaixado: true,
        }], { session });
      }
    });
    return res.status(replay || anexado ? 200 : 201).json(respostaComanda(comanda));
  } catch (error) {
    if (session?.inTransaction()) await session.abortTransaction();
    if (idempotencyKey && (error.code === 11000
      || error.hasErrorLabel?.('TransientTransactionError')
      || error.hasErrorLabel?.('UnknownTransactionCommitResult'))) {
      const anterior = await localizarPedidoIdempotente(idempotencyKey);
      if (anterior) return responderReplay(res, anterior, hash, idempotencyKey);
      if (error.code === 11000) return res.status(409).json({ msg: 'Pedido duplicado ou chave já utilizada' });
    }
    if (error.code === 'COTACAO_DESATUALIZADA') {
      return res.status(409).json({ msg: error.message, code: error.code });
    }
    if (error.status && error.status < 500) return res.status(error.status).json({ msg: error.message });
    if (error.code === 11000) return res.status(409).json({ msg: 'Pedido duplicado' });
    console.error(JSON.stringify({
      evento: 'falha_pedido_qr',
      tipoErro: error.name,
      codigoErro: error.code || null,
      etiquetasErro: error.errorLabels || [],
    }));
    return next(Object.assign(new Error('Falha interna ao processar pedido QR'), { status: 500 }));
  } finally {
    if (session) await session.endSession();
  }
});

module.exports = router;
