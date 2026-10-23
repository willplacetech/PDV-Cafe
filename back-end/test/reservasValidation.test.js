const test = require('node:test');
const assert = require('node:assert/strict');
const { validarReserva, normalizarTelefone } = require('../routes/reservas');

test('normaliza telefone removendo caracteres não numéricos', () => {
  assert.equal(normalizarTelefone('(11) 99999-8888'), '11999998888');
});

test('aceita reserva com data, horário e dados válidos', () => {
  const resultado = validarReserva({
    data: '2026-11-20', horario: '19:30', pessoas: 4,
    nome: ' Ana Souza ', telefone: '(11) 99999-8888',
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.value, {
    data: '2026-11-20', horario: '19:30', pessoas: 4,
    nome: 'Ana Souza', telefone: '11999998888', observacao: undefined,
  });
});

test('rejeita data, horário e quantidade inválidos', () => {
  const resultado = validarReserva({ data: '20/11/2026', horario: '25:00', pessoas: 0, nome: 'A', telefone: '123' });
  assert.equal(resultado.ok, false);
  assert.match(resultado.msg, /Data inválida/);
});
