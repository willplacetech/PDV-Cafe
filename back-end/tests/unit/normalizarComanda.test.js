const { normalizarComanda, normalizarNumero } = require('../../utils/normalizarComanda');

describe('normalizarComanda', () => {
  test('normaliza aliases financeiros e os campos de pagamento para o schema atual', async () => {
    const resultado = await normalizarComanda({
      atendente: 'caixa',
      status: 'fechado',
      total: '15.50',
      pagamentos: [{ valorRecebido: '15.50', tipo: 'pix' }],
      campoAntigo: 'preservado no backup antes da migração',
    }, '1');

    expect(resultado.numero).toBe('0001');
    expect(resultado.status).toBe('fechada');
    expect(resultado.valorTotal).toBe(15.5);
    expect(resultado.valorPago).toBe(15.5);
    expect(resultado.saldoDevedor).toBe(0);
    expect(resultado.statusPagamento).toBe('quitado');
    expect(resultado.historicoPagamentos[0].formaPagamento).toBe('pix');
    expect(resultado).not.toHaveProperty('total');
    expect(resultado).not.toHaveProperty('pagamentos');
    expect(resultado).not.toHaveProperty('campoAntigo');
  });

  test('comanda cancelada usa o status financeiro canônico', async () => {
    const resultado = await normalizarComanda({
      atendente: 'caixa',
      status: 'cancelado',
      valorTotal: 20,
    }, '0002');

    expect(resultado.status).toBe('cancelada');
    expect(resultado.statusPagamento).toBe('cancelado');
  });

  test('status legado pendente vira fechada e o status de pagamento continua derivado', async () => {
    const resultado = await normalizarComanda({
      atendente: 'caixa',
      status: 'pendente',
      valorTotal: 20,
    }, '0003');

    expect(resultado.status).toBe('fechada');
    expect(resultado.statusPagamento).toBe('pendente');
  });

  test('recusa número que não pode seguir a numeração atual', () => {
    expect(normalizarNumero(12)).toBe('0012');
    expect(() => normalizarNumero('C-12')).toThrow(/somente dígitos/);
  });

  test('valida campos obrigatórios antes de permitir a migração', async () => {
    await expect(normalizarComanda({ status: 'aberta' }, '0001')).rejects.toThrow(/atendente/);
  });
});
