const express = require('express');
const router = express.Router();
const Configuracoes = require('../models/Configuracoes');
const Auditoria = require('../models/Auditoria');
const auth = require('../middleware/auth');
const { exigirAutorizacao, invalidarCacheConfiguracaoGerente } = require('../middleware/exigirAutorizacao');

const isSupportOverrideActive = () => process.env.FORCAR_AUTORIZACAO_GERENTE === 'true';

// GET /api/configuracoes
router.get('/', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    let configuracao = await Configuracoes.findOne({ _id: 'principal' });
    if (!configuracao) {
      configuracao = await Configuracoes.create({ _id: 'principal', exigirAutorizacaoGerente: true });
    }

    res.json({
      exigirAutorizacaoGerente: configuracao.exigirAutorizacaoGerente,
      bloqueadoPorSuporte: isSupportOverrideActive(),
    });
  } catch (error) {
    console.error('Erro ao buscar configuracoes:', error);
    res.status(500).json({ msg: 'Erro ao buscar configuracoes' });
  }
});

// PATCH /api/configuracoes/autorizacao-gerente
router.patch('/autorizacao-gerente', auth, auth.allowRoles('admin'), exigirAutorizacao('alterar_configuracao'), async (req, res) => {
  if (isSupportOverrideActive()) {
    return res.status(403).json({ msg: 'Bloqueado pelo suporte' });
  }

  const { valor, motivo } = req.body;
  if (typeof valor !== 'boolean') {
    return res.status(400).json({ msg: 'O campo valor deve ser booleano' });
  }
  if (!valor && (!motivo || typeof motivo !== 'string' || motivo.trim().length < 10)) {
    return res.status(400).json({ msg: 'Motivo obrigatório com no mínimo 10 caracteres ao desligar' });
  }

  try {
    let configuracao = await Configuracoes.findOne({ _id: 'principal' });
    if (!configuracao) {
      configuracao = await Configuracoes.create({ _id: 'principal', exigirAutorizacaoGerente: true });
    }

    configuracao.exigirAutorizacaoGerente = valor;
    await configuracao.save();
    invalidarCacheConfiguracaoGerente();

    await Auditoria.create({
      usuarioSolicitante: req.user.id,
      usuarioAutorizou: req.user.id,
      acao: 'toggle_autorizacao_gerente',
      detalhes: { valor, motivo: valor ? '' : motivo.trim() },
      ip: req.ip,
      sucesso: true,
    });

    res.json({ msg: 'Configuracao atualizada com sucesso', exigirAutorizacaoGerente: valor });
  } catch (error) {
    console.error('Erro ao atualizar configuracao:', error);
    res.status(500).json({ msg: 'Erro ao atualizar configuracao' });
  }
});

module.exports = router;
