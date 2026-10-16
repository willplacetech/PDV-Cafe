const jwt = require('jsonwebtoken');

module.exports = (bearer, acao, managerId) => {
  const user = jwt.decode(bearer);
  return jwt.sign({ tipo: 'autorizacao-gerente', id: managerId || user.id, acao,
    solicitante: user.id, sessao: user.sid || null, versaoSolicitante: user.tokenVersion ?? 0, versaoGerente: 0,
  }, process.env.JWT_SECRET, { expiresIn: '5m' });
};

module.exports.headers = (method, path, bearer, body, managerId) => {
  let acao;
  if (method !== 'get') {
    if (/\/payment-settings|\/contabil\/taxas-cartao/.test(path)) acao = 'alterar_taxas_cartao';
    if (/\/products\//.test(path) && method === 'put') acao = 'alterar_preco';
    if (/\/products\//.test(path) && method === 'delete') acao = 'excluir_produto';
    if (/\/customers\//.test(path) && method === 'delete') acao = 'excluir_cliente';
    if (/\/comandas(?:\/|$)/.test(path)) {
      if (method === 'delete' || /\/itens\//.test(path)) acao = 'excluir_item';
      if (body?.precoUnitarioManual !== undefined || body?.itens?.some(item => item.precoUnitarioManual !== undefined)) acao = 'alterar_preco';
      if (path.endsWith('/fechar') && body?.desconto > 0) acao = 'desconto_acima_10';
    }
    if (path.endsWith('/cancelar')) acao = 'cancelar_venda';
  }
  return acao ? { 'X-Autorizacao-Gerente': module.exports(bearer, acao, managerId) } : {};
};
