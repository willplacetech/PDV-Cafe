import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotaVendaTexto, criarPedidoDaComanda } from '../src/utils/notaVenda.js';

test('comprovante de comanda inclui taxa de entrega no total e no WhatsApp', () => {
  const pedido = criarPedidoDaComanda({
    _id: 'comanda-1',
    numero: 12,
    clienteNome: 'Maria',
    clienteTelefone: '11999999999',
    tipoAtendimento: 'delivery',
    taxaEntrega: 4.5,
    desconto: 1,
    itens: [{ nome: 'Café', quantidade: 2, precoUnitario: 8 }],
    entrega: { taxaEntrega: 4.5, telefone: '11999999999' },
  });

  assert.equal(pedido.subtotal, 16);
  assert.equal(pedido.taxaEntrega, 4.5);
  assert.equal(pedido.total, 19.5);
  const texto = buildNotaVendaTexto(pedido, { comandaNumero: 12 });
  assert.match(texto, /Taxa de entrega:\s+R\$ 4,50/);
  assert.match(texto, /TOTAL:\s+R\$ 19,50/);
});
