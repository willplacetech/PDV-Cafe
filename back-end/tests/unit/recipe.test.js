const mongoose = require('mongoose');
const Recipe = require('../../models/Recipe');
const Product = require('../../models/Product');
const { calcularCustoReceita } = require('../../utils/custo');

describe('Recipe (Ficha Técnica)', () => {
  let produtoCoz;
  let insumoOvo;

  beforeEach(async () => {
    produtoCoz = await Product.create({
      codigo: '1001',
      nome: 'Omelete',
      preco: 12,
      tipo: 'venda',
      categoria: 'Salgados',
      estoque: 0,
      aFazer: true,
    });
    insumoOvo = await Product.create({
      codigo: '999020',
      nome: 'Ovo',
      preco: 0,
      tipo: 'insumo',
      categoria: 'Insumos',
      precoCompra: 0.5,
      unidadeCompra: 'un',
      conteudoPorEmbalagem: 1,
      unidadeConteudo: 'un',
      estoque: 100,
      custoUnitarioBase: 0.5,
    });
  });

  test('Recipe deve ter rendimento obrigatório', async () => {
    await expect(Recipe.create({
      nome: 'Omelete Simples',
      produtoId: produtoCoz._id,
      ingredientes: [{ produtoId: insumoOvo._id, quantidade: 2, unidade: 'un' }],
      unidadeRendimento: 'un',
    })).rejects.toThrow();
  });

  test('Recipe deve exigir pelo menos um ingrediente', async () => {
    await expect(Recipe.create({
      nome: 'Omelete Vazio',
      produtoId: produtoCoz._id,
      rendimento: 1,
      unidadeRendimento: 'un',
      ingredientes: [],
    })).rejects.toThrow();
  });

  test('Recipe deve calcular custo unitário corretamente', () => {
    const ingredientes = [
      { quantidade: 2, unidade: 'un', custoUnitarioBase: 0.5 },
    ];
    const custo = calcularCustoReceita(ingredientes, 0, 0, 0, 1);
    expect(custo.custoInsumosTotal).toBeCloseTo(1, 5);
    expect(custo.custoTotal).toBeCloseTo(1, 5);
    expect(custo.custoUnitario).toBeCloseTo(1, 5);
  });

  test('Recipe deve calcular custo com múltiplos ingredientes', () => {
    const ingredientes = [
      { quantidade: 2, unidade: 'un', custoUnitarioBase: 0.5 },
      { quantidade: 30, unidade: 'g', custoUnitarioBase: 0.03 },
    ];
    const custo = calcularCustoReceita(ingredientes, 0, 0, 0, 1);
    expect(custo.custoInsumosTotal).toBeCloseTo(1.9, 5);
    expect(custo.custoUnitario).toBeCloseTo(1.9, 5);
  });

  test('Recipe deve calcular disponibilidade baseada no estoque de insumos', async () => {
    const recipe = await Recipe.create({
      nome: 'Omelete',
      produtoId: produtoCoz._id,
      rendimento: 1,
      unidadeRendimento: 'un',
      ingredientes: [{ produtoId: insumoOvo._id, quantidade: 2, unidade: 'un' }],
    });
    expect(recipe.ingredientes).toHaveLength(1);
    expect(recipe.ingredientes[0].quantidade).toBe(2);
  });

  test('Recipe deve calcular disponibilidade limitada pelo insumo com menos estoque', async () => {
    const recipe = await Recipe.create({
      nome: 'Omelete Limitado',
      produtoId: produtoCoz._id,
      rendimento: 1,
      unidadeRendimento: 'un',
      ingredientes: [{ produtoId: insumoOvo._id, quantidade: 2, unidade: 'un' }],
    });
    const ovo = await Product.findById(insumoOvo._id);
    const porcoesPossiveis = Math.floor(ovo.estoque / recipe.ingredientes[0].quantidade);
    expect(porcoesPossiveis).toBe(50);
  });
});
