import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productSource = readFileSync(
  path.join(__dirname, '../src/pages/Products.jsx'),
  'utf8'
);

test('Products page source does not contain mojibake and keeps Portuguese labels readable', () => {
  const brokenPatterns = [
    'ÔÜá´©Å',
    'Ô×ò',
    'ÔÇö',
    '├®',
    '├│',
    '├¡',
    '├º',
    '├ú',
    '├¡',
    '├®',
    'ÔØî',
    '',
    'ƒôª',
    'ƒÆ░',
  ];

  for (const pattern of brokenPatterns) {
    assert.ok(
      !productSource.includes(pattern),
      `Source should not contain mojibake token: ${pattern}`
    );
  }

  const requiredStrings = [
    'Cadastro de Produtos',
    'Novo Produto',
    'Preço de venda',
    'Desconto por Quantidade',
    'Ficha técnica',
    'Produto cadastrado',
  ];

  for (const value of requiredStrings) {
    assert.ok(
      productSource.includes(value),
      `Source should include readable Portuguese text: ${value}`
    );
  }
});
