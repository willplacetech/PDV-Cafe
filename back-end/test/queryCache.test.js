const test = require('node:test');
const assert = require('node:assert/strict');
const { cached, invalidate } = require('../utils/queryCache');

test('cache reutiliza valores até o TTL e executa novamente após expirar', async () => {
  let chamadas = 0;
  const loader = async () => { chamadas += 1; return chamadas; };

  assert.equal(await cached('teste:ttl', 20, loader), 1);
  assert.equal(await cached('teste:ttl', 20, loader), 1);
  assert.equal(chamadas, 1);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(await cached('teste:ttl', 20, loader), 2);
});

test('cache deduplica loaders concorrentes, não armazena undefined e permite null', async () => {
  let chamadas = 0;
  const loader = async () => {
    chamadas += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return null;
  };

  const resultados = await Promise.all([
    cached('teste:concorrencia', 1000, loader),
    cached('teste:concorrencia', 1000, loader),
  ]);
  assert.deepEqual(resultados, [null, null]);
  assert.equal(chamadas, 1);

  let indefinidoChamadas = 0;
  const indefinido = async () => { indefinidoChamadas += 1; return undefined; };
  await cached('teste:undefined', 1000, indefinido);
  await cached('teste:undefined', 1000, indefinido);
  assert.equal(indefinidoChamadas, 2);
});

test('invalidação remove prefixos e impede loader antigo de repopular o cache', async () => {
  let resolverAntigo;
  const antigo = cached('produtos:concorrencia', 1000, () => new Promise((resolve) => {
    resolverAntigo = resolve;
  }));
  await Promise.resolve();

  invalidate('produtos:');
  assert.equal(await cached('produtos:concorrencia', 1000, async () => 'novo'), 'novo');
  resolverAntigo('antigo');
  await antigo;
  assert.equal(await cached('produtos:concorrencia', 1000, async () => 'inesperado'), 'novo');
});
