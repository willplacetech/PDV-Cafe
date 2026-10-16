import test from 'node:test';
import assert from 'node:assert/strict';
import { criarCSV, dataArquivoCSV } from '../src/utils/exportarCsv.js';
import { buildOrdersQuery } from '../src/utils/orderQuery.js';

test('CSV preserva acentos, aspas, separadores e quebras de linha com BOM e CRLF', () => {
  assert.equal(criarCSV([{ nome: 'Pão; "café"\r\nquente', quantidade: 0, vazio: null }], [
    { rotulo: 'Nome; completo', chave: 'nome' }, { chave: 'quantidade' }, { chave: 'vazio' },
  ]), '\uFEFF"Nome; completo";quantidade;vazio\r\n"Pão; ""café""\r\nquente";0;');
});

test('números usam vírgula decimal sem moeda e valores negativos continuam numéricos', () => {
  assert.equal(criarCSV([{ valor: 1234.56 }, { valor: -42.5 }, { valor: 0 }], [{ chave: 'valor' }]),
    '\uFEFFvalor\r\n1234,56\r\n-42,5\r\n0');
});

test('texto de fórmulas é neutralizado, inclusive após espaços ou caracteres de controle', () => {
  for (const valor of ['=1+1', '+cmd', '-1+2', '@SUM(A1)', ' \t=1+1', '\u0000=1']) {
    assert.equal(criarCSV([{ valor }], [{ chave: 'valor' }]), `\uFEFFvalor\r\n'${valor}`);
  }
  assert.equal(criarCSV([], [{ rotulo: '=1+1', chave: 'valor' }]), "\uFEFF'=1+1");
});

test('data do arquivo e datas de vendas usam São Paulo na virada UTC', () => {
  const data = new Date('2026-10-17T01:30:00Z');
  assert.equal(dataArquivoCSV(data), '2026-10-16');
  assert.match(criarCSV([{ data }], [{ chave: 'data' }]), /16\/10\/2026/);
});

test('order filters reach the server before pagination and full exports omit page limits', () => {
  assert.deepEqual(buildOrdersQuery({
    pagina: 2,
    limite: 25,
    status: 'pendente',
    inicio: '2026-10-16',
    fim: '2026-10-17',
  }), {
    pagina: 2,
    limite: 25,
    status: 'pendente',
    inicio: '2026-10-16',
    fim: '2026-10-17',
  });
  assert.deepEqual(buildOrdersQuery({
    pagina: 2,
    limite: 25,
    status: 'todos',
    paginada: false,
  }), {});
});
