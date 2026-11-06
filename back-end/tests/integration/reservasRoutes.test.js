const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Reserva = require('../../models/Reserva');
const Tenant = require('../../models/Tenant');

let tenant;
beforeEach(async () => {
  tenant = await Tenant.create({ nome: 'Reservations routes', slug: 'reservations-routes', telefone: '11999999999', endereco: 'Rua de teste' });
});

const criarUsuario = async (role = 'admin') => {
  const user = await User.create({
    username: `reservas-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    password: 'reservas-password-123',
    role,
    tenantId: tenant._id,
  });
  const token = jwt.sign({ id: user.id, role }, process.env.JWT_SECRET);
  return { user, token };
};

const criarReserva = (dados) => Reserva.create({ ...dados, tenantId: tenant._id });

const reservaValida = (overrides = {}) => ({
  data: '2026-11-20',
  horario: '19:30',
  pessoas: 4,
  nome: 'Ana Souza',
  telefone: '(11) 99999-8888',
  observacao: 'Mesa próxima à janela',
  ...overrides,
});

describe('API de reservas', () => {
  test('cria uma reserva pública e normaliza o telefone', async () => {
    const response = await request(app).post('/api/reservas').send(reservaValida());

    expect(response.status).toBe(201);
    expect(response.body.reserva).toEqual(expect.objectContaining({
      codigo: expect.stringMatching(/^[A-F0-9]{10}$/),
      data: '2026-11-20',
      horario: '19:30',
      pessoas: 4,
      nome: 'Ana Souza',
      telefone: '11999998888',
      status: 'pendente',
    }));
  });

  test.each([
    ['data inválida', { data: '20/11/2026' }, /Data inválida/],
    ['horário inválido', { horario: '25:00' }, /Horário inválido/],
    ['quantidade inválida', { pessoas: 0 }, /quantidade de pessoas/],
    ['nome curto', { nome: 'A' }, /Nome deve ter/],
    ['telefone inválido', { telefone: '123' }, /Telefone inválido/],
    ['observação longa', { observacao: 'x'.repeat(501) }, /Observação muito longa/],
  ])('rejeita %s', async (_descricao, body, mensagem) => {
    const response = await request(app).post('/api/reservas').send(reservaValida(body));

    expect(response.status).toBe(400);
    expect(response.body.msg).toMatch(mensagem);
  });

  test('consulta uma reserva por código sem autenticação', async () => {
    const criada = await criarReserva({ ...reservaValida(), telefone: '11999998888', codigo: 'ABCDEF1234' });

    const response = await request(app).get(`/api/reservas/${criada.codigo.toLowerCase()}`);

    expect(response.status).toBe(200);
    expect(response.body.reserva.codigo).toBe('ABCDEF1234');
  });

  test('protege a agenda e permite acesso aos papéis autorizados', async () => {
    const semToken = await request(app).get('/api/reservas/agenda');
    expect(semToken.status).toBe(403);

    const operador = await criarUsuario('operador');
    const agenda = await request(app).get('/api/reservas/agenda')
      .query({ data: '2026-11-20' })
      .set('Authorization', `Bearer ${operador.token}`);

    expect(agenda.status).toBe(200);
    expect(agenda.body).toEqual({ reservas: [] });
  });

  test('rejeita data inválida na agenda antes de consultar o banco', async () => {
    const admin = await criarUsuario('admin');
    const response = await request(app).get('/api/reservas/agenda')
      .query({ data: '2026-02-30' })
      .set('Authorization', `Bearer ${admin.token}`);

    expect(response.status).toBe(400);
    expect(response.body.msg).toMatch(/Data inválida/);
  });

  test('altera status e registra datas de confirmação e cancelamento', async () => {
    const admin = await criarUsuario('admin');
    const criada = await criarReserva({ ...reservaValida(), telefone: '11999998888', codigo: 'STATUS1234' });

    const confirmada = await request(app).patch(`/api/reservas/${criada.codigo}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'confirmada' });

    expect(confirmada.status).toBe(200);
    expect(confirmada.body.reserva.status).toBe('confirmada');
    expect(confirmada.body.reserva.confirmadaEm).toBeTruthy();

    const cancelada = await request(app).patch(`/api/reservas/${criada.codigo}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'cancelada' });

    expect(cancelada.status).toBe(200);
    expect(cancelada.body.reserva.status).toBe('cancelada');
    expect(cancelada.body.reserva.canceladaEm).toBeTruthy();
  });

  test('rejeita status desconhecido e código inexistente', async () => {
    const admin = await criarUsuario('admin');
    const status = await request(app).patch('/api/reservas/NAOEXISTE/status')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'concluida' });
    expect(status.status).toBe(400);

    const notFound = await request(app).patch('/api/reservas/NAOEXISTE/status')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'confirmada' });
    expect(notFound.status).toBe(404);
  });

  test('cancela reserva pendente e impede novo cancelamento', async () => {
    const criada = await criarReserva({ ...reservaValida(), telefone: '11999998888', codigo: 'CANCEL1234' });

    const primeira = await request(app).delete(`/api/reservas/${criada.codigo}`);
    expect(primeira.status).toBe(200);
    expect(primeira.body.reserva.status).toBe('cancelada');

    const segunda = await request(app).delete(`/api/reservas/${criada.codigo}`);
    expect(segunda.status).toBe(409);
  });

  test.each(['check_in', 'no_show', 'cancelada'])('não cancela reserva com status terminal %s', async status => {
    const criada = await criarReserva({ ...reservaValida(), telefone: '11999998888', codigo: `TERM${status.slice(0, 6).toUpperCase()}`, status });

    const response = await request(app).delete(`/api/reservas/${criada.codigo}`);

    expect(response.status).toBe(409);
  });
});
