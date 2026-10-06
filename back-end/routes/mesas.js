const express = require('express');
const auth = require('../middleware/auth');
const MesasSettings = require('../models/MesasSettings');

const router = express.Router();
const mesasPadrao = () => ({
  mesas: [1, 2, 3, 4].map((numero) => ({ id: numero, numero, nome: `Mesa ${numero}`, lugares: 4, ativa: true })),
  oferecerBalcao: true,
});

router.use(auth);
router.get('/', auth.allowRoles('admin', 'operador', 'garcom', 'cozinha'), async (req, res, next) => {
  try {
    const settings = await MesasSettings.findById('principal').lean();
    return res.json(settings ? { mesas: settings.mesas, oferecerBalcao: settings.oferecerBalcao } : mesasPadrao());
  } catch (error) { return next(error); }
});

router.put('/', auth.allowRoles('admin'), async (req, res, next) => {
  const { mesas, oferecerBalcao = true } = req.body || {};
  if (!Array.isArray(mesas) || mesas.length > 200 || typeof oferecerBalcao !== 'boolean') {
    return res.status(400).json({ msg: 'Configuração de mesas inválida' });
  }
  const ids = new Set();
  const numeros = new Set();
  const validas = mesas.every((mesa) => {
    if (!mesa || !Number.isSafeInteger(mesa.id) || mesa.id < 1 || !Number.isSafeInteger(mesa.numero) || mesa.numero < 1
      || !Number.isInteger(mesa.lugares) || mesa.lugares < 1 || mesa.lugares > 100
      || typeof mesa.nome !== 'string' || !mesa.nome.trim() || mesa.nome.trim().length > 100 || typeof mesa.ativa !== 'boolean'
      || ids.has(mesa.id) || numeros.has(mesa.numero)) return false;
    ids.add(mesa.id); numeros.add(mesa.numero);
    return true;
  });
  if (!validas) return res.status(400).json({ msg: 'Cada mesa precisa de número único, nome e capacidade válidos' });
  try {
    const settings = await MesasSettings.findByIdAndUpdate('principal', {
      $set: { mesas: mesas.map(({ id, numero, nome, lugares, ativa }) => ({ id, numero, nome: nome.trim(), lugares, ativa })), oferecerBalcao },
    }, { upsert: true, new: true, runValidators: true });
    return res.json({ mesas: settings.mesas, oferecerBalcao: settings.oferecerBalcao });
  } catch (error) { return next(error); }
});

module.exports = router;
