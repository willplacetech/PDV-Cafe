const test = require('node:test');
const assert = require('node:assert/strict');
const databaseOptions = require('../utils/databaseOptions');

test('sem nome explícito preserva o banco definido na URI', () => {
  assert.deepEqual(databaseOptions({}), {});
  assert.deepEqual(databaseOptions({ MONGO_DB_NAME: '' }), {});
});

test('nome explícito seleciona TesteOffDelivery sem alterar ou expor a URI', () => {
  const env = { MONGO_DB_NAME: 'TesteOffDelivery', MONGO_URI: 'mongodb://example.invalid/OutroBanco' };
  assert.deepEqual(databaseOptions(env), { dbName: 'TesteOffDelivery' });
  assert.equal(env.MONGO_URI, 'mongodb://example.invalid/OutroBanco');
});

test('rejeita nomes inválidos sem incluir o valor na mensagem', () => {
  for (const name of [' ', ' TesteOffDelivery', 'TesteOffDelivery ', 'teste\n', 'teste/outro', 'teste.outro', 'teste$nome', 'teste\\nome', 'teste\0nome', 'a'.repeat(64), 42]) {
    assert.throws(() => databaseOptions({ MONGO_DB_NAME: name }), {
      message: 'MONGO_DB_NAME inválido: use de 1 a 63 letras ASCII, números, hífen ou sublinhado',
    });
  }
});

test('aceita limite de nome e caracteres permitidos', () => {
  const name = `Teste_${'a'.repeat(55)}-1`;
  assert.equal(name.length, 63);
  assert.deepEqual(databaseOptions({ MONGO_DB_NAME: name }), { dbName: name });
});
