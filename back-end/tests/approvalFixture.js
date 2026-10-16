const jwt = require('jsonwebtoken');

module.exports = (bearer, acao, managerId) => {
  const user = jwt.decode(bearer);
  return jwt.sign({ tipo: 'autorizacao-gerente', id: managerId || user.id, acao,
    solicitante: user.id, sessao: user.sid || null, versaoSolicitante: user.tokenVersion ?? 0, versaoGerente: 0,
  }, process.env.JWT_SECRET, { expiresIn: '5m' });
};
