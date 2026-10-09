const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { execFileSync } = require('node:child_process');
const { createDeliveryHub } = require('../create-deliverylink-hub');

let root;

const collectJavaScript = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const item = path.join(directory, entry.name);
  return entry.isDirectory() ? collectJavaScript(item) : entry.name.endsWith('.js') ? [item] : [];
});

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryhub-generator-'));
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('rejects a non-empty destination without creating generated files', async () => {
  const destination = path.join(root, 'not-empty');
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(destination, 'keep.txt'), 'preserve');

  await assert.rejects(createDeliveryHub({ destination }), /destination/i);
  assert.equal(fs.existsSync(path.join(destination, 'package.json')), false);
  assert.equal(fs.readFileSync(path.join(destination, 'keep.txt'), 'utf8'), 'preserve');
});

test('generates a standalone app and configures the expected origin at a chosen destination', async () => {
  const destination = path.join(root, 'delivery-hub');

  const generated = await createDeliveryHub({ destination });

  assert.equal(generated, destination);
  assert.equal(fs.existsSync(path.join(destination, 'package.json')), true);
  assert.equal(fs.existsSync(path.join(destination, '.env.example')), true);
  assert.equal(fs.existsSync(path.join(destination, 'front-end', 'src', 'App.jsx')), true);
  assert.equal(fs.existsSync(path.join(destination, 'back-end', 'server.js')), true);
  const remote = execFileSync('git', ['-C', destination, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  assert.equal(remote, 'https://github.com/willplacetech/DeliveryLinkHub.git');
  const source = fs.readFileSync(path.join(destination, 'back-end', 'src', 'routes.js'), 'utf8');
  assert.equal(/sabor|pdv-completo/i.test(source), false);
  for (const file of collectJavaScript(path.join(destination, 'back-end'))) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
  execFileSync(process.execPath, ['--test', 'back-end/test/orderContract.test.js'], {
    cwd: destination,
    stdio: 'pipe',
  });
});

test('rejects a checkout with an unrelated origin and preserves the existing checkout', async () => {
  const destination = path.join(root, 'wrong-origin');
  fs.mkdirSync(destination);
  execFileSync('git', ['-C', destination, 'init'], { stdio: 'ignore' });
  execFileSync('git', ['-C', destination, 'remote', 'add', 'origin', 'https://example.invalid/wrong.git'], { stdio: 'ignore' });

  await assert.rejects(createDeliveryHub({ destination }), /origin/i);
  assert.equal(fs.existsSync(path.join(destination, 'package.json')), false);
  assert.equal(
    execFileSync('git', ['-C', destination, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim(),
    'https://example.invalid/wrong.git',
  );
});

test('fills an existing empty DeliveryLinkHub checkout and keeps its expected origin', async () => {
  const destination = path.join(root, 'empty-checkout');
  fs.mkdirSync(destination);
  execFileSync('git', ['-C', destination, 'init'], { stdio: 'ignore' });
  execFileSync('git', ['-C', destination, 'remote', 'add', 'origin', 'https://github.com/willplacetech/DeliveryLinkHub.git'], { stdio: 'ignore' });

  await createDeliveryHub({ destination });

  assert.equal(fs.existsSync(path.join(destination, 'package.json')), true);
  assert.equal(
    execFileSync('git', ['-C', destination, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim(),
    'https://github.com/willplacetech/DeliveryLinkHub.git',
  );
});
