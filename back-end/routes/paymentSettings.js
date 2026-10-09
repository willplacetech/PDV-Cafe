const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const PaymentSettings = require('../models/PaymentSettings');
const { ROTULOS_PAGAMENTO, catalogoDaConfiguracao, normalizarNome, formaPersonalizada } = require('../utils/formasPagamento');

const router = express.Router();
router.use(auth);
router.get('/', async (req, res) => {
  try {
    const configuracao = await PaymentSettings.findOne({ chave: 'principal' }).lean();
    res.json({ formasPagamento: catalogoDaConfiguracao(configuracao) });
  } catch (error) { res.status(500).json({ msg: error.message }); }
});
router.post('/', auth.allowRoles('admin'), async (req, res) => {
  const nome = typeof req.body.nome === 'string' ? req.body.nome.trim().replace(/\s+/g, ' ') : '';
  const nomeNormalizado = normalizarNome(nome);
  const taxaPercentual = Number(req.body.taxaPercentual);
  if (!nome || nome.length > 80 || /[\u0000-\u001f\u007f]/.test(nome) || req.body.taxaPercentual == null || req.body.taxaPercentual === '' || !Number.isFinite(taxaPercentual) || taxaPercentual < 0 || taxaPercentual > 100) return res.status(400).json({ msg: 'Informe nome e taxa entre 0% e 100%.' });
  if (Object.values(ROTULOS_PAGAMENTO).some(rotulo => normalizarNome(rotulo) === nomeNormalizado)) return res.status(409).json({ msg: 'Já existe uma forma de pagamento com este nome.' });
  try {
    await PaymentSettings.updateOne({ chave: 'principal' }, { $setOnInsert: { chave: 'principal' } }, { upsert: true });
    const tipo = `personalizado_${new mongoose.Types.ObjectId()}`;
    const configuracao = await PaymentSettings.findOneAndUpdate({ chave: 'principal', 'formasPersonalizadas.nomeNormalizado': { $ne: nomeNormalizado }, 'formasPersonalizadas.49': { $exists: false } }, { $push: { formasPersonalizadas: { tipo, nome, nomeNormalizado, taxaPercentual } } }, { new: true, runValidators: true });
    if (!configuracao) return res.status(409).json({ msg: 'Nome já cadastrado ou limite de 50 formas atingido.' });
    const formasPagamento = catalogoDaConfiguracao(configuracao);
    res.status(201).json({ formaPagamento: formasPagamento.find(forma => forma.value === tipo), formasPagamento });
  } catch (error) { res.status(error.code === 11000 ? 409 : 500).json({ msg: error.code === 11000 ? 'Tente novamente o cadastro da forma de pagamento.' : error.message }); }
});

router.delete('/:tipo', auth.allowRoles('admin'), async (req, res) => {
  const { tipo } = req.params;
  if (!formaPersonalizada(tipo)) return res.status(400).json({ msg: 'Somente formas de pagamento personalizadas podem ser excluídas.' });
  try {
    const configuracao = await PaymentSettings.findOneAndUpdate(
      { chave: 'principal', 'formasPersonalizadas.tipo': tipo },
      { $pull: { formasPersonalizadas: { tipo } } },
      { new: true, runValidators: true },
    );
    if (!configuracao) return res.status(404).json({ msg: 'Forma de pagamento não encontrada.' });
    res.json({ formasPagamento: catalogoDaConfiguracao(configuracao) });
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

module.exports = router;
