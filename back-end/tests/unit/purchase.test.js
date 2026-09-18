const mongoose = require('mongoose');
const Purchase = require('../../models/Purchase');
const Product = require('../../models/Product');
const { calcularCustoReceita, quantidadeNaBase, arredondar } = require('../../utils/custo');

describe('Compra (Purchase)', () => {
  let insumo;

  beforeAll(async () => {
    insumo = await Product.create({
      codigo: '999010',
      nome: 'Farinha de Trigo',
      preco: 0,
      tipo: 'insumo',
      categoria: 'Insumos',
      precoCompra: 5,
      unidadeCompra: 'kg',
      conteudoPorEmbalagem: 1,
      unidadeConteudo: 'kg',
      estoque: 10,
    });
  });

  test('quantidadeTotal deve ser qtdEmbalagens × conteudoPorEmbalagem', () => {
    const qtdEmbalagens = 10;
    const conteudoPorEmbalagem = 1;
    const quantidadeTotal = qtdEmbalagens * conteudoPorEmbalagem;
    expect(quantidadeTotal).toBe(10);
  });

  test('custoUnitario deve ser valorTotal / quantidadeTotal', () => {
    const valorTotal = 50;
    const quantidadeTotal = 10;
    const custoUnitario = arredondar(valorTotal / quantidadeTotal);
    expect(custoUnitario).toBe(5);
  });

  test('calcularCustoReceita deve calcular custo insumos, total e unitário', () => {
    const ingredientes = [
      { quantidade: 500, unidade: 'g', custoUnitarioBase: 0.005 },
    ];
    const custo = calcularCustoReceita(ingredientes, 0, 0, 0, 18);
    expect(custo.custoInsumosTotal).toBeCloseTo(2.5, 5);
    expect(custo.custoTotal).toBeCloseTo(2.5, 5);
    expect(custo.custoUnitario).toBeCloseTo(arredondar(2.5 / 18), 5);
  });

  test('quantidadeNaBase deve converter unidades corretamente', () => {
    expect(quantidadeNaBase(1, 'kg')).toBe(1000);
    expect(quantidadeNaBase(500, 'g')).toBe(500);
    expect(quantidadeNaBase(1, 'un')).toBe(1);
    expect(quantidadeNaBase(0.5, 'kg')).toBe(500);
  });

  test('Purchase deve validar itens não vazios', async () => {
    await expect(Purchase.create({
      fornecedor: 'Teste',
      numeroNF: '123',
      data: new Date(),
      metodoCusteio: 'media_ponderada',
      itens: [],
      valorTotal: 0,
      createdBy: new mongoose.Types.ObjectId(),
    })).rejects.toThrow();
  });

  test('Purchase deve exigir fornecedor e numeroNF', async () => {
    const validUserId = new mongoose.Types.ObjectId();
    await expect(Purchase.create({
      fornecedor: '',
      numeroNF: '',
      data: new Date(),
      metodoCusteio: 'media_ponderada',
      itens: [{ produtoId: insumo._id, valorTotal: 50, qtdEmbalagens: 10, conteudoPorEmbalagem: 1, unidadeConteudo: 'kg', quantidadeTotal: 10, custoUnitario: 5 }],
      valorTotal: 50,
      createdBy: validUserId,
    })).rejects.toThrow();
  });
});
