import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNumericValue } from '../src/utils/numeric.js';

const source = readFileSync(
  new URL('../src/pages/Purchases.jsx', import.meta.url),
  'utf8'
);
const saveSupplySource = `const saveSupply = ${source.split('const saveSupply = ')[1].split('const submit = ')[0]}`;
const createSaveSupply = (bindings) =>
  new Function(
    ...Object.keys(bindings),
    `${saveSupplySource}; return saveSupply;`
  )(...Object.values(bindings));

test('novo insumo pode ser salvo pelo modal sem preço de compra no formulário', async () => {
  let payload;
  const item = { produtoId: '' };
  let form = { itens: [item] };
  const setForm = (update) => {
    form = update(form);
  };
  const saveSupply = createSaveSupply({
    supplyForm: {
      nome: 'Farinha',
      tipoProduto: 'insumo',
      precoCompra: '',
      precoVenda: '',
      conteudoPorEmbalagem: '1',
      estoqueEmbalagens: '0',
      rendimentoPorReceita: '1',
      unidadeConteudo: 'kg',
    },
    products: [],
    form,
    supplyTargetIndex: null,
    selectProduct() {},
    setSupplyModalOpen() {},
    setSupplyTargetIndex() {},
    focusNextInput() {},
    showToast: (message, type) => {
      if (type !== 'success') throw new Error(message);
    },
    setSavingSupply() {},
    getNextProductCode: () => '99901',
    api: {
      post: async (_url, data) => {
        payload = data;
        return { data: { ...data, _id: 'product-1' } };
      },
    },
    setProducts() {},
    setForm,
    parseNumericValue,
  });

  await saveSupply({ preventDefault() {} });

  assert.equal(payload.nome, 'Farinha');
  assert.equal(payload.precoCompra, 0);
  assert.equal(form.itens[0].produtoId, 'product-1');
});

test('parser rejects malformed thousands separators instead of changing the value', () => {
  assert.ok(Number.isNaN(parseNumericValue('1.2.3', Number.NaN)));
  assert.ok(Number.isNaN(parseNumericValue('1.23.456,7', Number.NaN)));
  assert.equal(parseNumericValue('1.234.567,89', Number.NaN), 1234567.89);
  assert.equal(parseNumericValue('1,234,567.89', Number.NaN), 1234567.89);
});
