const { calcularContagem, calcularConferencia } = require('../../utils/caixa');

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
});
