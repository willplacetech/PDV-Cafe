const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Configuracoes = require('../../models/Configuracoes');
const Auditoria = require('../../models/Auditoria');

test('atualiza a autorização gerencial e registra detalhes compatíveis com auditoria', async () => {
  const admin = await User.create({ username: 'admin-config', password: 'senha-admin-config-123', role: 'admin' });
  const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);

  const response = await request(app)
    .patch('/api/configuracoes/autorizacao-gerente')
    .set('Authorization', `Bearer ${token}`)
    .send({ valor: false, motivo: 'Teste de auditoria da autorização' });

  expect(response.status).toBe(200);
  expect(response.body.exigirAutorizacaoGerente).toBe(false);
  expect((await Configuracoes.findById('principal')).exigirAutorizacaoGerente).toBe(false);
  const enabled = await request(app)
    .patch('/api/configuracoes/autorizacao-gerente')
    .set('Authorization', `Bearer ${token}`)
    .send({ valor: true });

  expect(enabled.status).toBe(200);
  expect(enabled.body.exigirAutorizacaoGerente).toBe(true);
  expect((await Configuracoes.findById('principal')).exigirAutorizacaoGerente).toBe(true);
  const auditorias = await Auditoria.find({ acao: 'toggle_autorizacao_gerente' }).sort({ createdAt: 1 });
  expect(auditorias.map(auditoria => auditoria.detalhes)).toEqual([
    'Autorização gerencial desativada. Motivo: Teste de auditoria da autorização',
    'Autorização gerencial ativada',
  ]);
});
