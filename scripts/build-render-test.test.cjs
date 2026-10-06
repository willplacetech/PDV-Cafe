const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildRenderTest } = require('./build-render-test.cjs');

test('build prepara frontend na mesma origem e publica no diretório servido pelo Express', async () => {
  const commands = [];
  const copies = [];
  await buildRenderTest({
    spawn: (command, args, options) => { commands.push({ command, args, options }); return { status: 0 }; },
    copy: async (...args) => { copies.push(args); },
  });
  assert.deepEqual(commands.map(call => call.args), [['ci', '--omit=dev'], ['ci', '--include=dev'], ['run', 'build', '--', '--mode', 'production']]);
  const root = path.resolve(__dirname, '..');
  assert.equal(commands[0].options.cwd, path.join(root, 'back-end'));
  assert.equal(commands[1].options.cwd, path.join(root, 'front-end'));
  assert.equal(commands[2].options.env.VITE_API_URL, '/api');
  assert.equal(commands[1].options.env.CYPRESS_INSTALL_BINARY, '0');
  assert.deepEqual(copies, [[path.join(root, 'front-end', 'dist'), path.join(root, 'back-end', 'dist'), { recursive: true }]]);
});

test('falha em instalação impede o build e publicação de arquivos', async () => {
  let calls = 0;
  let copied = false;
  await assert.rejects(buildRenderTest({
    spawn: () => { calls += 1; return { status: 1 }; },
    copy: async () => { copied = true; },
  }), /npm ci falhou/);
  assert.equal(calls, 1);
  assert.equal(copied, false);
});

test('falha no build preserva o diretório servido existente', async () => {
  let calls = 0;
  let copied = false;
  await assert.rejects(buildRenderTest({
    spawn: () => { calls += 1; return { status: calls === 3 ? 1 : 0 }; },
    copy: async () => { copied = true; },
  }), /npm run falhou/);
  assert.equal(copied, false);
});

test('erro do processo não revela mensagem potencialmente sensível', async () => {
  await assert.rejects(buildRenderTest({
    spawn: () => ({ status: null, error: new Error('conteúdo privado do ambiente') }),
    copy: async () => {},
  }), error => error.message === 'npm ci falhou; confira a saída do build');
});
