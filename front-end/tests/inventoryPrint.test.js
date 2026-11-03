import assert from 'node:assert/strict';
import test from 'node:test';
import { createInventoryPrintHtml } from '../src/utils/inventoryPrint.js';

test('monta a folha A4 com saldo atual e campos manuais vazios', () => {
  const html = createInventoryPrintHtml([{
    codigo: '101',
    nome: 'Café',
    categoria: 'Bebidas Quentes',
    tipo: 'venda',
    unidade: 'kg',
    estoque: 2.375,
  }], new Date('2026-11-03T12:00:00.000Z'));

  assert.match(html, /@page \{ size: A4 portrait;/);
  assert.match(html, /Emitido em: 03\/11\/2026/);
  assert.match(html, /<td class="numeric">2,375<\/td>/);
  assert.match(html, /<th>Contagem física<\/th>/);
  assert.match(html, /<th>Diferença<\/th>/);
  assert.match(html, /<td class="manual"><\/td>\s*<td class="manual"><\/td>/);
});

test('escapa os dados textuais antes de inserir no documento', () => {
  const html = createInventoryPrintHtml([{
    codigo: '<101>',
    nome: '<img src=x onerror=alert(1)> & Café',
    categoria: '<script>alert(1)</script>',
    tipo: 'insumo',
    unidade: 'kg',
    estoque: 1,
  }]);

  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; Café/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; \/ Insumo/);
  assert.doesNotMatch(html, /<img src=x|<script>alert/);
});
