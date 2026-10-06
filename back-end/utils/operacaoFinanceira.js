const mongoose = require('mongoose');
const { createHash } = require('crypto');
const OperacaoFinanceira = require('../models/OperacaoFinanceira');
const FechamentoCaixa = require('../models/FechamentoCaixa');
const { dataCaixa, faixaDoDia } = require('./caixa');

const erroFinanceiro = (message, status = 400) => Object.assign(new Error(message), { status });
const ordenarPayload = (valor) => {
  if (Array.isArray(valor)) return valor.map(ordenarPayload);
  if (!valor || typeof valor !== 'object') return valor;
  return Object.fromEntries(Object.keys(valor).sort().map(chave => [chave, ordenarPayload(valor[chave])]));
};

const obterOperacao = (req, tipo, recursoId) => {
  const header = req.header('Idempotency-Key');
  const bodyKey = req.body.operacaoId;
  const operacaoId = header === undefined ? bodyKey : header;
  if (typeof operacaoId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(operacaoId)) {
    throw erroFinanceiro('Informe uma chave de operacao valida em Idempotency-Key ou operacaoId');
  }
  if (header !== undefined && bodyKey !== undefined && header !== bodyKey) throw erroFinanceiro('Chaves de operacao divergentes');
  const { operacaoId: ignorado, ...payload } = req.body;
  return {
    filtro: { usuarioId: String(req.user.id), tipo, recursoId: String(recursoId), operacaoId },
    payloadHash: createHash('sha256').update(JSON.stringify(ordenarPayload(payload))).digest('hex'),
  };
};

const resultadoAnterior = (anterior, hash) => {
  if (anterior.payloadHash !== hash) throw erroFinanceiro('Esta chave de operacao ja foi utilizada com outros dados', 409);
  return anterior.resultado;
};

// Caixa routes use the same version for their closing CAS. Touch every open
// shift affected by this receipt inside the balance/ledger transaction.
const tocarCaixas = async (ids, session) => {
  for (const id of ids) {
    const caixa = await FechamentoCaixa.findById(id).session(session);
    if (!caixa || caixa.status !== 'aberto') throw erroFinanceiro('Caixa fechado durante o recebimento. Atualize e tente novamente', 409);
    const filtro = { _id: id, status: 'aberto', ...(caixa.__v ? { __v: caixa.__v } : { $or: [{ __v: 0 }, { __v: { $exists: false } }] }) };
    const escrita = await FechamentoCaixa.updateOne(filtro, { $inc: { __v: 1 } }, { session });
    if (escrita.matchedCount !== 1) throw erroFinanceiro('Caixa alterado durante o recebimento. Atualize e tente novamente', 409);
  }
};

const executarOperacaoFinanceira = async ({ req, tipo, recursoId, executar, tocarCaixa = true }) => {
  const { filtro, payloadHash } = obterOperacao(req, tipo, recursoId);
  await OperacaoFinanceira.init();
  const anterior = await OperacaoFinanceira.findOne(filtro).lean();
  if (anterior) return resultadoAnterior(anterior, payloadHash);
  const dataRecebimento = new Date();
  const dia = dataRecebimento.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const { inicio, fim } = faixaDoDia(dataCaixa(dia));
  const caixas = tocarCaixa ? await FechamentoCaixa.find({ data: { $gte: inicio, $lt: fim }, status: 'aberto', tipoRegistro: { $ne: 'ajuste' } }).select('_id').lean() : [];
  const idsCaixas = caixas.map(caixa => caixa._id);
  const session = await mongoose.startSession();
  try {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      try {
        const replay = await OperacaoFinanceira.findOne(filtro).session(session).lean();
        if (replay) {
          await session.abortTransaction();
          return resultadoAnterior(replay, payloadHash);
        }
        await tocarCaixas(idsCaixas, session);
        const resposta = await executar(session, dataRecebimento);
        const resultado = JSON.parse(JSON.stringify(resposta));
        await OperacaoFinanceira.create([{ ...filtro, payloadHash, resultado }], { session });
        for (let commit = 0; ; commit++) {
          try { await session.commitTransaction(); break; }
          catch (error) {
            if (!error.hasErrorLabel?.('UnknownTransactionCommitResult') || commit >= 4) throw error;
          }
        }
        return resultado;
      } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        if (error.code === 11000 || error.hasErrorLabel?.('TransientTransactionError') || error.hasErrorLabel?.('UnknownTransactionCommitResult')) {
          const replay = await OperacaoFinanceira.findOne(filtro).lean();
          if (replay) return resultadoAnterior(replay, payloadHash);
          if (tentativa < 4 && !error.hasErrorLabel?.('UnknownTransactionCommitResult')) continue;
          throw erroFinanceiro('Recebimento concorrente. Tente novamente com a mesma chave de operacao', 409);
        }
        throw error;
      }
    }
  } finally { await session.endSession(); }
};

module.exports = { executarOperacaoFinanceira };
