import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/pages/Comandas.jsx', import.meta.url), 'utf8');
const { code } = await transformWithOxc(source, 'Comandas.jsx', { jsx: { runtime: 'classic' } });

test('Comandas exports the component required by its lazy route', () => {
  assert.match(code, /export default function Comandas\(/);
});
