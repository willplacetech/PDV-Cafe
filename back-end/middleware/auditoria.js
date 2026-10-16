const { auditarRequisicao } = require('../utils/auditoria');

function acaoDaRequisicao(req) {
  const path = (req.originalUrl || req.url || '').split('?')[0].replace(/\/$/, '');
  const method = req.method;
  if (method === 'POST' && path === '/api/auth/login') return 'login';
  if (method === 'POST' && path === '/api/auth/logout') return 'logout';
  if (method === 'POST' && path === '/api/auth/register') return 'criar_usuario';
  if (method === 'PATCH' && /^\/api\/auth\/users\/[^/]+$/.test(path)) return Object.hasOwn(req.body || {}, 'role') ? 'trocar_permissao' : 'editar_usuario';
  if (method === 'DELETE' && /^\/api\/auth\/users\/[^/]+$/.test(path)) return 'desativar_usuario';
  if (method === 'POST' && /^\/api\/caixa\/[^/]+\/fechar$/.test(path)) return 'fechar_caixa';
  if (method === 'POST' && /^\/api\/caixa\/[^/]+\/(movimentos|ajuste)$/.test(path)) return 'sangria_suprimento';
  if (['PATCH', 'DELETE'].includes(method) && /^\/api\/(orders|comandas)\/[^/]+(?:\/cancelar)?$/.test(path)) return 'cancelar_venda';
  if (['PUT', 'PATCH'].includes(method) && /^\/api\/(products|produtos)\/[^/]+(?:\/aplicar-preco)?$/.test(path)) return 'alterar_preco_custo';
  if (method === 'PUT' && /^\/api\/insumos\/[^/]+\/preco-compra$/.test(path)) return 'alterar_preco_custo';
  return null;
}

function auditarAcao(acao) {
  return (req, res, next) => {
    const end = res.end;
    let encerrando = false;
    res.end = function (...args) {
      if (encerrando) return res;
      encerrando = true;
      const nome = req.acaoAuditoria || (typeof acao === 'function' ? acao(req) : acao);
      if (!nome) return end.apply(res, args);
      const sucesso = res.statusCode >= 200 && res.statusCode < 400;
      // Persiste antes de finalizar a resposta, inclusive respostas sem conteúdo.
      void auditarRequisicao(req, nome, sucesso, undefined, sucesso ? null : `http_${res.statusCode}`)
        .finally(() => end.apply(res, args));
      return res;
    };
    next();
  };
}

module.exports = { auditarAcao, auditarOperacoes: auditarAcao(acaoDaRequisicao) };
