const express = require('express');
const router = express.Router();
const Configuracoes = require('../models/Configuracoes');
const Auditoria = require('../models/Auditoria');
const auth = require('../middleware/auth');
const { exigirAutorizacao } = require('../middleware/exigirAutorizacao');

// GET /api/configuracoes
router.get('/', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    let configuracao = await Configuracoes.findOne({ _id: 'principal' });
    if (!configuracao) {
      // Create default if not exists
      configuracao = await Configuracoes.create({ _id: 'principal', exigirAutorizacaoGerente: true });
    }
    res.json({ 
      exigirAutorizacaoGerente: configuracao.exigirAutorizacaoGerente,
      bloqueadoPorSuporte: process.env.FORCAR_AUTORIZACAO_GERENTE === 'true'
    });
  } catch (error) {
    res.status(500).json({ msg: 'Erro ao buscar configurações' });
  }
});

// PATCH /api/configuracoes/autorizacao-gerente
router.patch('/autorizacao-gerente', auth, auth.allowRoles('admin'), async (req, res) => {
  // Check for override environment variable
  if (process.env.FORCAR_AUTORIZACAO_GERENTE === 'true') {
    return res.status(403).json({ msg: 'Bloqueado pelo suporte' });
  }

  const { valor, motivo } = req.body;
  if (typeof valor !== 'boolean') {
    return res.status(400).json({ msg: 'O campo valor deve ser booleano' });
  }
  if (!valor && (!motivo || motivo.trim().length < 10)) {
    return res.status(400).json({ msg: 'Motivo obrigátorio com no mínimo 10 caracteres ao desligar' });
  }

  try {
    let configuracao = await Configuracoes.findOne({ _id: 'principal' });
    if (!configuracao) {
      configuracao = await Configuracoes.create({ _id: 'principal', exigirAutorizacaoGerente: true });
    }

    const valorAntigo = configuracao.exigirAutorizacaoGerente;
    configuracao.exigirAutorizacaoGerente = valor;
    await configuracao.save();

    // Log to audit
    await Auditoria.create({
      usuarioSolicitante: req.user.id,
      usuarioAutorizou: req.user.id, // same as solicitant for this action
      acao: 'toggle_autorizacao_gerente',
      detalhes: motivo ? alor: , motivo:  : alor: ,
      ip: req.ip,
      sucesso: true,
    });

    res.json({ msg: 'Configuração atualizada com sucesso', exigirAutorizacaoGerente: valor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: 'Erro ao atualizar configuração' });
  }
});

module.exports = router;
