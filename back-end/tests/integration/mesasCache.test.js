const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const MesasSettings = require('../../models/MesasSettings');
const { cached, invalidate } = require('../../utils/queryCache');

let token;

beforeEach(async () => {
  invalidate('cardapio:');
  invalidate('mesas:');
  const admin = await User.create({ username: 'mesas-cache-admin', password: 'isolated-password-123', role: 'admin' });
  token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET);
});

test('mesas usam cache de leitura e atualização invalida os dados de mesas e cardápio', async () => {
  const findSpy = jest.spyOn(MesasSettings, 'findById');
  try {
    const first = await request(app).get('/api/mesas').set('Authorization', `Bearer ${token}`);
    const second = await request(app).get('/api/mesas').set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(findSpy).toHaveBeenCalledTimes(1);

    await cached('cardapio:mesa-preview', 60000, async () => 'antigo');
    const updated = await request(app)
      .put('/api/mesas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mesas: [{ id: 1, numero: 1, nome: 'Mesa atualizada', lugares: 4, ativa: true }],
        oferecerBalcao: false,
      });
    expect(updated.status).toBe(200);

    const afterUpdate = await request(app).get('/api/mesas').set('Authorization', `Bearer ${token}`);
    expect(afterUpdate.body.mesas[0].nome).toBe('Mesa atualizada');
    expect(afterUpdate.body.oferecerBalcao).toBe(false);
    expect(findSpy).toHaveBeenCalledTimes(2);
    expect(await cached('cardapio:mesa-preview', 60000, async () => 'novo')).toBe('novo');
  } finally {
    findSpy.mockRestore();
  }
});
