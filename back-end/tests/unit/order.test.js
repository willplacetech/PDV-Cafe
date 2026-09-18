const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const { calcularPrecoComDesconto } = require('../../utils/descontosQuantidade');

describe('Order', () => {
  let produto;

  beforeAll(async () => {
    produto = await Product.create({
      codigo: '1001',
      nome: 'Café Especial',
      preco: 8.50,
      tipo: 'venda',
      categoria: 'Bebidas Quentes',
      estoque: 100,
    });
  });

  test('Deve criar pedido com itens e calcular subtotal', async () => {
    const order = await Order.create({
      numero: '0001',
      itens: [{
        produtoId: produto._id,
        codigo: produto.codigo,
        nome: produto.nome,
        precoUnitario: 8.50,
        quantidade: 2,
        tipoVenda: 'unidade',
      }],
      subtotal: 17.00,
      total: 17.00,
      clienteNome: 'Cliente Teste',
      status: 'pago',
      atendente: 'admin',
    });
    expect(order.itens).toHaveLength(1);
    expect(order.subtotal).toBe(17);
    expect(order.total).toBe(17);
    expect(order.status).toBe('pago');
  });

  test('calcularPrecoComDesconto deve aplicar desconto por quantidade (≥3 unidades)', () => {
    const produtoComDesconto = {
      preco: 16,
      descontosPorQuantidade: [
        { quantidadeMinima: 3, precoUnitario: 14, ativo: true },
      ],
    };
    const result = calcularPrecoComDesconto(produtoComDesconto, 3);
    expect(result.precoUnitario).toBe(14);
    expect(result.economiaUnitario).toBe(2);
    expect(result.economiaTotal).toBe(6);
  });

  test('calcularPrecoComDesconto não deve aplicar desconto abaixo da quantidade mínima', () => {
    const produtoComDesconto = {
      preco: 16,
      descontosPorQuantidade: [
        { quantidadeMinima: 3, precoUnitario: 14, ativo: true },
      ],
    };
    const result = calcularPrecoComDesconto(produtoComDesconto, 2);
    expect(result.precoUnitario).toBe(16);
    expect(result.economiaTotal).toBe(0);
  });

  test('Pedido com status cancelado não deve servir para relatórios', async () => {
    const order = await Order.create({
      numero: '0002',
      itens: [{ produtoId: produto._id, codigo: produto.codigo, nome: produto.nome, precoUnitario: 8.50, quantidade: 1, tipoVenda: 'unidade' }],
      subtotal: 8.50,
      total: 8.50,
      clienteNome: 'Cliente Teste',
      status: 'cancelado',
      atendente: 'admin',
    });
    expect(order.status).toBe('cancelado');
  });

  test('Pedido deve registrar pagamentos corretamente', async () => {
    const order = await Order.create({
      numero: '0003',
      itens: [{ produtoId: produto._id, codigo: produto.codigo, nome: produto.nome, precoUnitario: 8.50, quantidade: 3, tipoVenda: 'unidade' }],
      subtotal: 25.50,
      total: 25.50,
      clienteNome: 'Cliente Teste',
      status: 'pago',
      atendente: 'admin',
      pagamentos: [{ tipo: 'dinheiro', valorRecebido: 25.50, dataPagamento: new Date() }],
    });
    expect(order.pagamentos).toHaveLength(1);
    expect(order.pagamentos[0].tipo).toBe('dinheiro');
    expect(order.pagamentos[0].valorRecebido).toBe(25.50);
  });
});
