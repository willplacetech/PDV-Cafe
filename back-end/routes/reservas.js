const crypto = require('crypto');
const express = require('express');
const Reserva = require('../models/Reserva');
const Comanda = require('../models/Comanda');
const auth = require('../middleware/auth');
const MesasSettings = require('../models/MesasSettings');
const { garantirTokensMesas } = require('../utils/mesaTokens');

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
const normalizarCodigo = codigo => String(codigo || '').trim().toUpperCase();

const buscarMesa = async (mesaToken) => {
  const settings = await MesasSettings.findById('principal');
  if (!settings) return null;
  await garantirTokensMesas(settings);
  return settings.mesas.find(mesa => mesa.ativa && mesa.token === mesaToken) || null;
};

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

router.post('/:codigo/check-in', async (req, res, next) => {
  const codigo = normalizarCodigo(req.params.codigo);
  const mesaToken = String(req.body?.mesaToken || '').trim();
  if (!mesaToken) return res.status(400).json({ msg: 'Informe o token da mesa.' });
  try {
    const mesa = await buscarMesa(mesaToken);
    if (!mesa) return res.status(404).json({ msg: 'Mesa não encontrada ou inativa.' });
    const reserva = await Reserva.findOne({ codigo });
    if (!reserva) return res.status(404).json({ msg: 'Reserva não encontrada.' });
    if (['cancelada', 'no_show'].includes(reserva.status)) return res.status(409).json({ msg: 'Esta reserva não pode realizar check-in.' });
    if (reserva.status === 'check_in') {
      if (String(reserva.mesaToken) !== mesaToken) return res.status(409).json({ msg: 'Esta reserva já realizou check-in em outra mesa.' });
      const comanda = reserva.comandaId ? await Comanda.findById(reserva.comandaId).lean() : null;
      if (!comanda) return res.status(409).json({ msg: 'Check-in realizado sem comanda vinculada.' });
      return res.json({ reserva, comanda, mesa: { id: mesa.id, numero: mesa.numero, token: mesa.token }, redirect: `/cardapio/${mesa.token}` });
    }
    if (!['pendente', 'confirmada'].includes(reserva.status)) return res.status(409).json({ msg: 'Status da reserva não permite check-in.' });
    const existente = await Comanda.findOne({ 'reservaId': reserva._id });
    if (existente) {
      reserva.status = 'check_in';
      reserva.mesaId = mesa.id;
      reserva.mesaNumero = mesa.numero;
      reserva.mesaToken = mesa.token;
      reserva.comandaId = existente._id;
      reserva.checkInEm = reserva.checkInEm || new Date();
      await reserva.save();
      return res.json({ reserva, comanda: existente, mesa: { id: mesa.id, numero: mesa.numero, token: mesa.token }, redirect: `/cardapio/${mesa.token}` });
    }
    const comanda = await Comanda.create({
      clienteNome: reserva.nome,
      clienteTelefone: reserva.telefone,
      origem: 'reserva_check_in',
      tipoAtendimento: 'mesa',
      mesa: String(mesa.numero),
      status: 'aberta',
      atendente: 'reserva',
      reservaId: reserva._id,
    });
    reserva.status = 'check_in';
    reserva.mesaId = mesa.id;
    reserva.mesaNumero = mesa.numero;
    reserva.mesaToken = mesa.token;
    reserva.comandaId = comanda._id;
    reserva.checkInEm = new Date();
    await reserva.save();
    return res.status(201).json({ reserva, comanda, mesa: { id: mesa.id, numero: mesa.numero, token: mesa.token }, redirect: `/cardapio/${mesa.token}` });
  } catch (error) { return next(error); }
});

router.patch('/:codigo/status', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res, next) => {
  const status = String(req.body?.status || '').trim();
  if (!STATUS_PERMITIDOS.has(status)) return res.status(400).json({ msg: 'Status de reserva inválido.' });
  try {
    const atualizacao = { status };
    if (status === 'confirmada') atualizacao.confirmadaEm = new Date();
    if (status === 'cancelada') atualizacao.canceladaEm = new Date();
    const reserva = await Reserva.findOneAndUpdate({ codigo: normalizarCodigo(req.params.codigo) }, atualizacao, { new: true, runValidators: true }).lean();
    if (!reserva) return res.status(404).json({ msg: 'Reserva não encontrada.' });
    return res.json({ reserva });
  } catch (error) { return next(error); }
});

router.get('/:codigo', async (req, res, next) => {
  try {
    const reserva = await Reserva.findOne({ codigo: normalizarCodigo(req.params.codigo) }).lean();
    if (!reserva) return res.status(404).json({ msg: 'Reserva não encontrada.' });
    return res.json({ reserva });
  } catch (error) { return next(error); }
});

router.delete('/:codigo', async (req, res, next) => {
  try {
    const reserva = await Reserva.findOne({ codigo: normalizarCodigo(req.params.codigo) });
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
