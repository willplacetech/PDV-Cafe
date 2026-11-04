const Product = require('../../models/Product');

test('model factories do not silently assign a tenant to legacy fixtures', async () => {
  const product = await Product.create({
    codigo: 'LEGACY-FIXTURE',
    nome: 'Produto legado',
    categoria: 'Outros',
    preco: 5,
  });

  expect(product.tenantId).toBeUndefined();
});
