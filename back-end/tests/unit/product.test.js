const mongoose = require('mongoose');
const Product = require('../../models/Product');

describe('Product', () => {
  test('Deve criar produto de venda com tipo e categoria corretos', async () => {
    const produto = await Product.create({
      codigo: '1001',
      nome: 'Café Especial',
      preco: 8.50,
      tipo: 'venda',
      categoria: 'Bebidas Quentes',
      estoque: 100,
    });
    expect(produto.tipo).toBe('venda');
    expect(produto.preco).toBe(8.50);
    expect(produto.categoria).toBe('Bebidas Quentes');
    expect(produto.ativo).toBe(true);
  });

  test('Não deve criar produto sem nome', async () => {
    await expect(Product.create({ codigo: '1002', preco: 5, tipo: 'venda', categoria: 'Outros' }))
      .rejects.toThrow();
  });

  test('Não deve criar produto com código duplicado', async () => {
    await Product.create({ codigo: '2001', nome: 'Café', preco: 5, tipo: 'venda', categoria: 'Outros' });
    await expect(Product.create({ codigo: '2001', nome: 'Café Duplicado', preco: 6, tipo: 'venda', categoria: 'Outros' }))
      .rejects.toThrow();
  });

  test('Produto Coz deve ter estoque padrão 0', async () => {
    const produto = await Product.create({
      codigo: '3001',
      nome: 'Omelete',
      preco: 12,
      tipo: 'venda',
      categoria: 'Salgados',
      estoque: 0,
      aFazer: true,
    });
    expect(produto.estoque).toBe(0);
    expect(produto.aFazer).toBe(true);
  });

  test('Produto com descontosPorQuantidade deve aplicar faixa correta', async () => {
    const produto = await Product.create({
      codigo: '4001',
      nome: 'Cookie',
      preco: 16,
      tipo: 'venda',
      categoria: 'Doces',
      estoque: 50,
      descontosPorQuantidade: [
        { quantidadeMinima: 3, precoUnitario: 14, ativo: true },
        { quantidadeMinima: 6, precoUnitario: 12, ativo: true },
      ],
    });
    expect(produto.descontosPorQuantidade).toHaveLength(2);
    expect(produto.descontosPorQuantidade[0].quantidadeMinima).toBe(3);
  });

  test('Produto com grupoDesconto deve validar campos', async () => {
    const produto = await Product.create({
      codigo: '5001',
      nome: 'Bolinho',
      preco: 16,
      tipo: 'venda',
      categoria: 'Doces',
      estoque: 30,
      grupoDesconto: { nome: 'Cookies', quantidadeMinima: 3, precoPromocional: 14, ativo: true },
    });
    expect(produto.grupoDesconto).toBeDefined();
    expect(produto.grupoDesconto.nome).toBe('Cookies');
    expect(produto.grupoDesconto.precoPromocional).toBe(14);
  });

  test('Insumo deve ter categoria Insumos', async () => {
    const insumo = await Product.create({
      codigo: '999001',
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
    expect(insumo.tipo).toBe('insumo');
    expect(insumo.categoria).toBe('Insumos');
  });

  test('Produto insumo com precoCompra negativo deve falhar', async () => {
    await expect(Product.create({
      codigo: '999002',
      nome: 'Açúcar',
      preco: 0,
      tipo: 'insumo',
      categoria: 'Insumos',
      precoCompra: -5,
      unidadeCompra: 'kg',
      conteudoPorEmbalagem: 1,
      unidadeConteudo: 'kg',
      estoque: 10,
    })).rejects.toThrow();
  });

  test('Produto com codigo deve ser único', async () => {
    await Product.create({ codigo: '6001', nome: 'Produto A', preco: 5, tipo: 'venda', categoria: 'Outros' });
    await expect(Product.create({ codigo: '6001', nome: 'Produto B', preco: 6, tipo: 'venda', categoria: 'Outros' }))
      .rejects.toThrow();
  });
});
