const request = require('supertest');
const app = require('../../server');
const Reserva = require('../../models/Reserva');
const Tenant = require('../../models/Tenant');
const Comanda = require('../../models/Comanda');
const MesasSettings = require('../../models/MesasSettings');
const { garantirTokensMesas } = require('../../utils/mesaTokens');

let tenant;
beforeEach(async () => {
  tenant = await Tenant.create({ nome: 'Reservation check-in', slug: 'reservation-check-in', telefone: '11999999999', endereco: 'Rua de teste' });
});

const reservaValida = (overrides = {}) => ({
  codigo: 'CHECKIN1234', data: '2026-11-20', horario: '19:30', pessoas: 4,
  nome: 'Ana Souza', telefone: '11999998888', ...overrides,
});

const criarReserva = (overrides = {}) => Reserva.create({ ...reservaValida(overrides), tenantId: tenant._id });

const prepararMesa = async (overrides = {}) => {
  const settings = await MesasSettings.create({
    _id: 'principal',
    mesas: [{ id: 7, numero: 7, nome: 'Mesa 7', lugares: 4, ativa: true, ...overrides }],
    tenantId: tenant._id,
  });
  await garantirTokensMesas(settings);
  return settings.mesas[0];
};

describe('check-in de reserva', () => {
  test('marca check-in, abre comanda e devolve redirecionamento da mesa', async () => {
    const mesa = await prepararMesa();
    const reserva = await criarReserva({ codigo: 'CHECKIN0001' });

    const response = await request(app).post(`/api/reservas/${reserva.codigo}/check-in`)
      .send({ mesaToken: mesa.token });

    expect(response.status).toBe(201);
    expect(response.body.reserva.status).toBe('check_in');
    expect(response.body.reserva.mesaId).toBe(7);
    expect(response.body.comanda.reservaId).toBe(String(reserva._id));
    expect(response.body.comanda.tipoAtendimento).toBe('mesa');
    expect(response.body.redirect).toBe(`/cardapio/${mesa.token}`);
    expect(await Comanda.countDocuments({ reservaId: reserva._id })).toBe(1);
  });

  test.each(['cancelada', 'no_show'])('recusa check-in em reserva %s', async status => {
    const mesa = await prepararMesa();
    const reserva = await criarReserva({ codigo: `CHECKIN${status.slice(0, 4).toUpperCase()}`, status });

    const response = await request(app).post(`/api/reservas/${reserva.codigo}/check-in`)
      .send({ mesaToken: mesa.token });

    expect(response.status).toBe(409);
    expect(await Comanda.countDocuments()).toBe(0);
  });

  test('recusa mesa inexistente ou inativa', async () => {
    await prepararMesa({ ativa: false });
    await criarReserva({ codigo: 'CHECKIN0002' });

    const response = await request(app).post('/api/reservas/CHECKIN0002/check-in')
      .send({ mesaToken: 'token-inexistente' });

    expect(response.status).toBe(404);
  });

  test('repetir check-in retorna a mesma comanda sem duplicar', async () => {
    const mesa = await prepararMesa();
    const reserva = await criarReserva({ codigo: 'CHECKIN0003' });
    const endpoint = `/api/reservas/${reserva.codigo}/check-in`;

    const primeira = await request(app).post(endpoint).send({ mesaToken: mesa.token });
    const segunda = await request(app).post(endpoint).send({ mesaToken: mesa.token });

    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(200);
    expect(segunda.body.comanda._id).toBe(primeira.body.comanda._id);
    expect(await Comanda.countDocuments({ reservaId: reserva._id })).toBe(1);
  });

  test('check-in já realizado em outra mesa é rejeitado', async () => {
    const primeiraMesa = await prepararMesa();
    const segundaMesa = await MesasSettings.findById('principal');
    segundaMesa.mesas.push({ id: 8, numero: 8, nome: 'Mesa 8', lugares: 4, ativa: true });
    await garantirTokensMesas(segundaMesa);
    const outraMesa = segundaMesa.mesas.find(mesa => mesa.id === 8);
    const reserva = await criarReserva({ codigo: 'CHECKIN0004' });

    await request(app).post(`/api/reservas/${reserva.codigo}/check-in`).send({ mesaToken: primeiraMesa.token });
    const response = await request(app).post(`/api/reservas/${reserva.codigo}/check-in`).send({ mesaToken: outraMesa.token });

    expect(response.status).toBe(409);
    expect(response.body.msg).toMatch(/outra mesa/);
  });
});
