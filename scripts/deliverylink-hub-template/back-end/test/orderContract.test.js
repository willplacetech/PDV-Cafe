const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeOrder } = require('../src/orderContract');

const validOrder = () => ({
  customer: { name: ' Ana ', phone: ' 11999990000 ', address: ' Rua das Flores, 10 ' },
  items: [{ description: ' Café ', quantity: 2, unitPrice: 8 }],
  total: 16,
  deliveryFee: 5,
});

test('normalizes a generic POS order without requiring product-specific fields', () => {
  assert.deepEqual(normalizeOrder(validOrder()), {
    customer: { name: 'Ana', phone: '11999990000', address: 'Rua das Flores, 10' },
    items: [{ description: 'Café', quantity: 2, unitPrice: 8 }],
    total: 16,
    deliveryFee: 5,
  });
});

test('rejects missing customer data and invalid item or amount values', () => {
  assert.throws(() => normalizeOrder({ ...validOrder(), customer: {} }), /customer name/);
  assert.throws(() => normalizeOrder({ ...validOrder(), items: [] }), /item/);
  assert.throws(() => normalizeOrder({ ...validOrder(), items: [{ description: 'Coffee', quantity: 0, unitPrice: 8 }] }), /positive/);
  assert.throws(() => normalizeOrder({ ...validOrder(), deliveryFee: -1 }), /delivery fee/);
});
