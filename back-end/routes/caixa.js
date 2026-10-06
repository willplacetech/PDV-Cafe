const express = require('express');
const auth = require('../middleware/auth');
const FechamentoCaixa = require('../models/FechamentoCaixa');
const {
  DENOMINACOES_CEDULAS,
  DENOMINACOES_MOEDAS,
  dataCaixa,
  faixaDoDia,
  money,
  calcularContagem,
  normalizarValorContado,
  calcularConferencia,
  buscarBaseSistema,
  prepararSistema,
} = require('../utils/caixa');

const router = express.Router();
router.use(auth);
router.use(auth.allowRoles('admin', 'operador'));

const normalizarItens = (items, denominacoes, obrigatorio = false) => {
  if (!Array.isArray(items)) throw new Error('Preencha a contagem física');
  const valores = new Map(items.map((item) => [Number(item.valor), Number(item.quantidade)]));
  if (obrigatorio && denominacoes.some((valor) => !Number.isFinite(valores.get(valor)) || valores.get(valor) < 0 || !Number.isInteger(valores.get(valor)))) {
    throw new Error('Preencha a quantidade de todas as cédulas e moedas');
  }
  return denominacoes.map((valor) => ({ valor, quantidade: Number.isFinite(valores.get(valor)) ? valores.get(valor) : 0 }));
};

const normalizarContagem = (body, obrigatorio = false) => {
  if (body.valorContado !== undefined) {
    const valorContado = normalizarValorContado(body.valorContado);
    return { valorContado, cedulas: [], moedas: [], totalCedulas: 0, totalMoedas: 0, totalDinheiro: valorContado };
  }
  const cedulas = normalizarItens(body.cedulas, DENOMINACOES_CEDULAS, obrigatorio);
  const moedas = normalizarItens(body.moedas, DENOMINACOES_MOEDAS, obrigatorio);
  const totais = calcularContagem(cedulas, moedas);
  return { valorContado: totais.totalDinheiro, cedulas, moedas, ...totais };
};

const normalizarDataCaixa = (valor) => dataCaixa(dataCaixa(valor).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));

// Include the read version in every write so a stale snapshot cannot alter a
// closed caixa or overwrite another operation. Legacy documents may lack __v.
const filtroCaixaAberto = (fechamento) => ({
  _id: fechamento._id,
  status: 'aberto',
  ...(fechamento.__v ? { __v: fechamento.__v } : { $or: [{ __v: 0 }, { __v: { $exists: false } }] }),
});

const gravarCaixaAberto = (fechamento, campos) => FechamentoCaixa.findOneAndUpdate(
  filtroCaixaAberto(fechamento),
  { $set: campos, $inc: { __v: 1 } },
  { new: true, runValidators: true },
);

const conflitoCaixa = (res) => res.status(409).json({ msg: 'Caixa alterado ou fechado durante a operação. Atualize e tente novamente' });

const carregarCaixa = async (data, turno) => {
  const { inicio, fim } = faixaDoDia(data);
  const fechamentoAberto = await FechamentoCaixa.findOne({ data: { $gte: inicio, $lt: fim }, turno, status: 'aberto', tipoRegistro: { $ne: 'ajuste' } });
  const fechamentoFechado = fechamentoAberto ? null : await FechamentoCaixa.findOne({ data: { $gte: inicio, $lt: fim }, turno, status: 'fechado', tipoRegistro: { $ne: 'ajuste' } }).sort({ createdAt: -1 });
  const fechamento = fechamentoAberto || fechamentoFechado;
  if (fechamento?.status === 'fechado') return { fechamento, sistema: fechamento.sistema, outrosMeios: fechamento.outrosMeios };
  const base = await buscarBaseSistema(inicio, turno);
  const sistema = prepararSistema(base, fechamento);
  if (fechamento) {
    fechamento.sistema = sistema;
    fechamento.outrosMeios = base.outrosMeios;
  }
  return { fechamento, sistema, outrosMeios: base.outrosMeios };
};

router.get('/atual', async (req, res) => {
  try {
    const data = normalizarDataCaixa(req.query.data);
    const turno = String(req.query.turno || 'principal').trim();
    const atual = await carregarCaixa(data, turno);
    res.json({ data, turno, ...atual });
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

router.post('/abrir', async (req, res) => {
  try {
    await FechamentoCaixa.init();
    const data = normalizarDataCaixa(req.body.data);
    const turno = String(req.body.turno || 'principal').trim();
    const atual = await carregarCaixa(data, turno);
    if (atual.fechamento) return res.json(atual.fechamento);
    const fechamento = await FechamentoCaixa.create({ data, turno, chaveAbertura: JSON.stringify([data.toISOString(), turno]), usuarioAbertura: req.user.username, sistema: atual.sistema, outrosMeios: atual.outrosMeios });
    res.status(201).json(fechamento);
  } catch (error) {
    if (error.code === 11000) return conflitoCaixa(res);
    res.status(400).json({ msg: error.message });
  }
});

router.post('/:id/movimentos', async (req, res) => {
  try {
    const fechamento = await FechamentoCaixa.findById(req.params.id);
    if (!fechamento) return res.status(404).json({ msg: 'Fechamento não encontrado' });
    if (fechamento.status === 'fechado') return res.status(409).json({ msg: 'Fechamento fechado e bloqueado para edição' });
    const tipo = req.body.tipo === 'suplementacao' ? 'suplementacoes' : (req.body.tipo === 'sangria' ? 'sangrias' : null);
    const valor = Number(req.body.valor);
    const responsavel = String(req.body.responsavel || req.user.username || '').trim();
    const motivo = String(req.body.motivo || '').trim();
    if (!tipo || !Number.isFinite(valor) || valor <= 0 || !responsavel || !motivo) return res.status(400).json({ msg: 'Sangria/suplementação exige valor, responsável e motivo' });
    fechamento.sistema[tipo].push({ valor: money(valor), responsavel, motivo, data: new Date() });
    const base = await buscarBaseSistema(fechamento.data, fechamento.turno);
    fechamento.sistema = prepararSistema(base, fechamento);
    const atualizado = await gravarCaixaAberto(fechamento, { sistema: fechamento.sistema.toObject() });
    if (!atualizado) return conflitoCaixa(res);
    res.status(201).json(atualizado);
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.post('/:id/contagem-parcial', async (req, res) => {
  try {
    const fechamento = await FechamentoCaixa.findById(req.params.id);
    if (!fechamento) return res.status(404).json({ msg: 'Fechamento não encontrado' });
    if (fechamento.status === 'fechado') return res.status(409).json({ msg: 'Fechamento fechado e bloqueado para edição' });
    const contagemFisica = normalizarContagem(req.body);
    const atualizado = await gravarCaixaAberto(fechamento, { contagemFisica });
    if (!atualizado) return conflitoCaixa(res);
    res.json(atualizado);
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.post('/:id/fechar', async (req, res) => {
  try {
    const fechamento = await FechamentoCaixa.findById(req.params.id);
    if (!fechamento) return res.status(404).json({ msg: 'Fechamento não encontrado' });
    if (fechamento.status === 'fechado') return res.status(409).json({ msg: 'Fechamento já fechado e bloqueado para edição' });
    const contagemFisica = normalizarContagem(req.body, true);
    const base = await buscarBaseSistema(fechamento.data, fechamento.turno);
    const sistema = prepararSistema(base, fechamento);
    const conferencia = calcularConferencia(contagemFisica.totalDinheiro, sistema.saldoEsperado);
    const observacao = String(req.body.observacao || '').trim();
    if (Math.abs(conferencia.diferenca) > 5 && !observacao) return res.status(400).json({ msg: 'Diferença acima de R$ 5,00 exige justificativa' });
    const atualizado = await gravarCaixaAberto(fechamento, {
      sistema,
      outrosMeios: base.outrosMeios,
      contagemFisica,
      conferencia: { ...conferencia, observacao, conferidoEm: new Date() },
      usuarioFechamento: req.user.username,
      status: 'fechado',
    });
    if (!atualizado) return conflitoCaixa(res);
    res.json(atualizado);
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.post('/:id/ajuste', auth.allowRoles('admin'), async (req, res) => {
  try {
    const original = await FechamentoCaixa.findById(req.params.id);
    if (!original) return res.status(404).json({ msg: 'Fechamento não encontrado' });
    if (original.status !== 'fechado') return res.status(400).json({ msg: 'Somente fechamentos concluídos podem receber ajuste' });
    const valor = Number(req.body.valor);
    const motivo = String(req.body.motivo || '').trim();
    if (!Number.isFinite(valor) || !motivo) return res.status(400).json({ msg: 'Ajuste exige valor e motivo' });
    const ajuste = await FechamentoCaixa.create({
      data: original.data,
      turno: original.turno,
      usuarioAbertura: req.user.username,
      usuarioFechamento: req.user.username,
      tipoRegistro: 'ajuste',
      fechamentoOriginalId: original._id,
      ajusteValor: money(valor),
      ajusteMotivo: motivo,
      sistema: original.sistema,
      contagemFisica: original.contagemFisica,
      conferencia: { ...original.conferencia.toObject?.() || original.conferencia, observacao: `${original.conferencia.observacao || ''} Ajuste: ${motivo}`.trim(), conferidoEm: new Date() },
      outrosMeios: original.outrosMeios,
      status: 'fechado',
    });
    res.status(201).json(ajuste);
  } catch (error) { res.status(400).json({ msg: error.message }); }
});

router.get('/historico', async (req, res) => {
  try {
    const historico = await FechamentoCaixa.find({ status: 'fechado' }).sort({ data: -1, createdAt: -1 }).limit(100).lean();
    res.json(historico);
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

module.exports = router;
