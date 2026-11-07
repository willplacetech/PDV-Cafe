import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const sourceRoots = [
  path.join(projectRoot, 'front-end/src'),
  path.join(projectRoot, 'back-end'),
];
const sourceExtensions = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.css',
  '.html',
]);
const excludedDirectories = new Set([
  'node_modules',
  'coverage',
  'test',
  'tests',
]);

const listSourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return excludedDirectories.has(entry.name)
        ? []
        : listSourceFiles(path.join(directory, entry.name));
    }
    return entry.isFile() && sourceExtensions.has(path.extname(entry.name))
      ? [path.join(directory, entry.name)]
      : [];
  });

test('runtime frontend and backend source contains no common mojibake artifacts', () => {
  const brokenPatterns = [
    /\u00c3[\u0080-\u00bf]/u,
    /\u00c2[\u0080-\u00bf]/u,
    /\u00e2\u20ac/u,
    /\u00f0\u0178/u,
    /[\u251c\u252c\u2514\u2524]/u,
    /\u0192[\u00c0-\u00ff]/u,
    /\ufffd/u,
    /\u00d4(?:\u00dc|\u00a3|\u00d7|\u00c7|\u00d8|\u00fb|\u00ea|\u00e5)/u,
    /\u00ad/u,
  ];

  const sourceFiles = sourceRoots.flatMap(listSourceFiles);
  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of brokenPatterns) {
      assert.doesNotMatch(
        source,
        pattern,
        `${path.relative(projectRoot, file)} should not contain mojibake pattern ${pattern}`
      );
    }
  }

  const productsSource = readFileSync(
    path.join(projectRoot, 'front-end/src/pages/Products.jsx'),
    'utf8'
  );
  const purchasesSource = readFileSync(
    path.join(projectRoot, 'front-end/src/pages/Purchases.jsx'),
    'utf8'
  );
  for (const label of [
    'Cadastro de Produtos',
    'Preço de venda',
    'Desconto por Quantidade',
    'Conteúdo da embalagem',
  ]) {
    assert.ok(
      productsSource.includes(label),
      `Products page should keep readable label: ${label}`
    );
  }
  for (const label of [
    'Número da NF',
    'Atualização de custo',
    'Histórico de compras',
  ]) {
    assert.ok(
      purchasesSource.includes(label),
      `Purchases page should keep readable label: ${label}`
    );
  }
});
