const crypto = require('crypto');
const express = require('express');
const Reserva = require('../models/Reserva');
const auth = require('../middleware/auth');

const router = express.Router();
const STATUS_PERMITIDOS = new Set(['pendente', 'confirmada', 'check_in', 'cancelada', 'no_show']);

const normalizarTelefone = (telefone) => String(telefone || '').replace(/\D/g, '');
const dataValida = (data) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [ano, mes, dia] = data.split('-').map(Number);
  const date = new Date(Date.UTC(ano, mes - 1, dia));
  return date.getUTCFullYear() === ano && date.getUTCMonth() === mes - 1 && date.getUTCDate() === dia;
};
const validarReserva = (input = {}) => {
  const data = String(input.data || '').trim();
  const horario = String(input.horario || '').trim();
  const nome = String(input.nome || '').trim();
  const telefone = normalizarTelefone(input.telefone);
  const pessoas = Number(input.pessoas);
  const observacao = input.observacao === undefined ? undefined : String(input.observacao).trim();
  if (!dataValida(data)) return { ok: false, msg: 'Data inválida. Use o formato AAAA-MM-DD.' };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)) return { ok: false, msg: 'Horário inválido. Use o formato HH:MM.' };
  if (!Number.isSafeInteger(pessoas) || pessoas < 1 || pessoas > 100) return { ok: false, msg: 'A quantidade de pessoas deve estar entre 1 e 100.' };
  if (nome.length < 2 || nome.length > 120) return { ok: false, msg: 'Nome deve ter entre 2 e 120 caracteres.' };
  if (telefone.length < 8 || telefone.length > 30) return { ok: false, msg: 'Telefone inválido.' };
  if (observacao && observacao.length > 500) return { ok: false, msg: 'Observação muito longa.' };
  return { ok: true, value: { data, horario, pessoas, nome, telefone, observacao } };
};
const gerarCodigo = () => crypto.randomBytes(5).toString('hex').toUpperCase();

router.post('/', async (req, res, next) => {
  const validacao = validarReserva(req.body);
  if (!validacao.ok) return res.status(400).json({ msg: validacao.msg });
  try {
    let reserva;
    for (let tentativa = 0; tentativa < 3 && !reserva; tentativa += 1) {
      try { reserva = await Reserva.create({ ...validacao.value, codigo: gerarCodigo() }); }
      catch (error) { if (error?.code !== 11000 || tentativa === 2) throw error; }
    }
    return res.status(201).json({ reserva });
  } catch (error) { return next(error); }
});

router.get('/agenda', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res, next) => {
  const data = String(req.query.data || '').trim();
  if (data && !dataValida(data)) return res.status(400).json({ msg: 'Data inválida.' });
  try {
    const reservas = await Reserva.find(data ? { data } : {}).sort({ data: 1, horario: 1, createdAt: 1 }).lean();
    return res.json({ reservas });
  } catch (error) { return next(error); }
});

router.patch('/:codigo/status', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res, next) => {
  const status = String(req.body?.status || '').trim();
  if (!STATUS_PERMITIDOS.has(status)) return res.status(400).json({ msg: 'Status de reserva inválido.' });
  try {
    const atualizacao = { status };
    if (status === 'confirmada') atualizacao.confirmadaEm = new Date();
    if (status === 'cancelada') atualizacao.canceladaEm = new Date();
    const reserva = await Reserva.findOneAndUpdate({ codigo: String(req.params.codigo).trim().toUpperCase() }, atualizacao, { new: true, runValidators: true }).lean();
    if (!reserva) return res.status(404).json({ msg: 'Reserva não encontrada.' });
    return res.json({ reserva });
  } catch (error) { return next(error); }
});

router.get('/:codigo', async (req, res, next) => {
  try {
    const reserva = await Reserva.findOne({ codigo: String(req.params.codigo).trim().toUpperCase() }).lean();
    if (!reserva) return res.status(404).json({ msg: 'Reserva não encontrada.' });
    return res.json({ reserva });
  } catch (error) { return next(error); }
});

router.delete('/:codigo', async (req, res, next) => {
  try {
    const reserva = await Reserva.findOne({ codigo: String(req.params.codigo).trim().toUpperCase() });
    if (!reserva) return res.status(404).json({ msg: 'Reserva não encontrada.' });
    if (['cancelada', 'check_in', 'no_show'].includes(reserva.status)) return res.status(409).json({ msg: 'Esta reserva não pode mais ser cancelada.' });
    reserva.status = 'cancelada';
    reserva.canceladaEm = new Date();
    await reserva.save();
    return res.json({ reserva });
  } catch (error) { return next(error); }
});

module.exports = router;
module.exports.validarReserva = validarReserva;
module.exports.normalizarTelefone = normalizarTelefone;
