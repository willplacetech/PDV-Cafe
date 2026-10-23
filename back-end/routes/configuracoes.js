const express = require('express');
const router = express.Router();
const Configuracoes = require('../models/Configuracoes');
const Auditoria = require('../models/Auditoria');
const auth = require('../middleware/auth');
const { invalidarCacheConfiguracaoGerente } = require('../middleware/exigirAutorizacao');

const isSupportOverrideActive = () => process.env.FORCAR_AUTORIZACAO_GERENTE === 'true';

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const sanitizeBranding = (input = {}) => {
  const out = {};
  const str = (key, max) => {
    if (input[key] === undefined || input[key] === null) return;
    const value = String(input[key]).trim();
    if (!value) {
      out[key] = '';
      return;
    }
    out[key] = value.slice(0, max);
  };
  str('name', 40);
  str('shortName', 12);
  str('tagline', 80);
  str('logoUrl', 500);
  if (input.themeColor !== undefined) {
    const c = String(input.themeColor || '').trim();
    if (c && !HEX_COLOR.test(c)) {
      const err = new Error('themeColor inválida (use #RGB ou #RRGGBB)');
      err.status = 400;
      throw err;
    }
    out.themeColor = c;
  }
  if (input.backgroundColor !== undefined) {
    const c = String(input.backgroundColor || '').trim();
    if (c && !HEX_COLOR.test(c)) {
      const err = new Error('backgroundColor inválida (use #RGB ou #RRGGBB)');
      err.status = 400;
      throw err;
    }
    out.backgroundColor = c;
  }
  return out;
};

const brandingResponse = (doc) => {
  const b = doc?.branding?.toObject?.() || doc?.branding || {};
  return {
    name: b.name || '',
    shortName: b.shortName || '',
    tagline: b.tagline || '',
    logoUrl: b.logoUrl || '',
    themeColor: b.themeColor || '',
    backgroundColor: b.backgroundColor || '',
  };
};

const ensureConfig = async () => {
  let configuracao = await Configuracoes.findOne({ _id: 'principal' });
  if (!configuracao) {
    configuracao = await Configuracoes.create({ _id: 'principal', exigirAutorizacaoGerente: true });
  }
  return configuracao;
};

// Público: login e cardápio podem aplicar a marca do estabelecimento
router.get('/branding', async (req, res) => {
  try {
    const configuracao = await ensureConfig();
    res.json({ branding: brandingResponse(configuracao) });
  } catch (error) {
    console.error('Erro ao buscar branding:', error);
    res.status(500).json({ msg: 'Erro ao buscar branding' });
  }
});

// Admin: grava branding do estabelecimento (multi-dispositivo)
router.put('/branding', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const patch = sanitizeBranding(req.body || {});
    const configuracao = await ensureConfig();
    const atual = configuracao.branding?.toObject?.() || configuracao.branding || {};
    const next = { ...atual };
    for (const [key, value] of Object.entries(patch)) {
      if (value === '') delete next[key];
      else next[key] = value;
    }
    configuracao.branding = next;
    configuracao.markModified('branding');
    await configuracao.save();

    await Auditoria.create({
      usuarioSolicitante: req.user.id,
      usuarioAutorizou: req.user.id,
      acao: 'atualizar_branding',
      detalhes: `Branding atualizado: ${next.name || '(padrão)'}`,
      ip: req.ip,
      sucesso: true,
    }).catch(() => {});

    res.json({ msg: 'Branding atualizado', branding: brandingResponse(configuracao) });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ msg: error.message });
    console.error('Erro ao atualizar branding:', error);
    res.status(500).json({ msg: 'Erro ao atualizar branding' });
  }
});

// GET /api/configuracoes — qualquer autenticado
router.get('/', auth, async (req, res) => {
  try {
    const configuracao = await ensureConfig();
    res.json({
      exigirAutorizacaoGerente: configuracao.exigirAutorizacaoGerente !== false,
      bloqueadoPorSuporte: isSupportOverrideActive(),
      branding: brandingResponse(configuracao),
    });
  } catch (error) {
    console.error('Erro ao buscar configuracoes:', error);
    res.status(500).json({ msg: 'Erro ao buscar configuracoes' });
  }
});

// PATCH /api/configuracoes/autorizacao-gerente — somente admin
router.patch('/autorizacao-gerente', auth, auth.allowRoles('admin'), async (req, res) => {
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
    const configuracao = await ensureConfig();
    configuracao.exigirAutorizacaoGerente = valor;
    await configuracao.save();
    invalidarCacheConfiguracaoGerente();

    await Auditoria.create({
      usuarioSolicitante: req.user.id,
      usuarioAutorizou: req.user.id,
      acao: 'toggle_autorizacao_gerente',
      detalhes: valor
        ? 'Autorização gerencial ativada'
        : `Autorização gerencial desativada. Motivo: ${motivo.trim()}`,
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
