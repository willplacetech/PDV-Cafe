const { calcularContagem, calcularConferencia, calcularOutrosMeios, normalizarValorContado } = require('../../utils/caixa');

describe('Controle de caixa', () => {
  test('calcula cédulas, moedas e total contado', () => {
    const contagem = calcularContagem(
      [{ valor: 100, quantidade: 10 }, { valor: 50, quantidade: 5 }],
      [{ valor: 1, quantidade: 15 }, { valor: 0.5, quantidade: 4 }],
    );
    expect(contagem.totalCedulas).toBe(1250);
    expect(contagem.totalMoedas).toBe(17);
    expect(contagem.totalDinheiro).toBe(1267);
  });

  test('classifica diferença como conferido, sobrando ou faltante', () => {
    expect(calcularConferencia(100, 100)).toEqual({ diferenca: 0, situacao: 'conferido' });
    expect(calcularConferencia(120, 100)).toEqual({ diferenca: 20, situacao: 'sobrando' });
    expect(calcularConferencia(80, 100)).toEqual({ diferenca: -20, situacao: 'faltante' });
  });

  test('normaliza valor contado sem detalhar cédulas e moedas', () => {
    expect(normalizarValorContado('123.45')).toBe(123.45);
    expect(normalizarValorContado(0)).toBe(0);
    expect(() => normalizarValorContado('')).toThrow('Informe o valor contado');
    expect(() => normalizarValorContado(-1)).toThrow('Informe um valor contado válido');
  });

  test('crédito da loja não compõe o total do cartão de crédito', () => {
    expect(calcularOutrosMeios([
      { tipo: 'pix', valorRecebido: 10 },
      { tipo: 'cartao_credito', valorRecebido: 30 },
      { tipo: 'cartao_debito', valorRecebido: 15 },
      { tipo: 'credito_loja', valorRecebido: 20 },
    ])).toEqual({
      pix: 10,
      credito: 30,
      taxaCredito: 0,
      liquidoCredito: 30,
      debito: 15,
      taxaDebito: 0,
      liquidoDebito: 15,
      creditoLoja: 20,
      total: 55,
      totalLiquido: 55,
    });
  });
});
