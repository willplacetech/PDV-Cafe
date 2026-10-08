import test from 'node:test';
import assert from 'node:assert/strict';
import { criarXmlClientes } from '../src/utils/customersXml.js';

test('exportação XML inclui cadastro, endereço de entrega e total de clientes', () => {
  const xml = criarXmlClientes([{
    _id: 'cliente-1',
    nome: 'Ana',
    telefone: '11999999999',
    cpf: '12345678900',
    aniversario: '01/02/1990',
    endereco: 'Rua A',
    enderecoEntrega: { rua: 'Rua B', numero: '10', bairro: 'Centro' },
    cafesFidelidade: 3,
    createdAt: '2026-10-08T10:00:00.000Z',
  }], new Date('2026-10-08T12:00:00.000Z'));

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<exportadoEm>2026-10-08T12:00:00\.000Z<\/exportadoEm>/);
  assert.match(xml, /<total>1<\/total>/);
  assert.match(xml, /<nome>Ana<\/nome>/);
  assert.match(xml, /<rua>Rua B<\/rua>/);
  assert.match(xml, /<cafesFidelidade>3<\/cafesFidelidade>/);
});

test('exportação XML escapa caracteres especiais e remove caracteres inválidos', () => {
  const xml = criarXmlClientes([{
    _id: '1',
    nome: 'Café & <Pão> "bom"',
    endereco: "Rua d'Água\u0001",
  }], new Date('2026-10-08T12:00:00.000Z'));

  assert.match(xml, /<nome>Café &amp; &lt;Pão&gt; &quot;bom&quot;<\/nome>/);
  assert.match(xml, /<endereco>Rua d&apos;Água<\/endereco>/);
  assert.equal(xml.includes('\u0001'), false);
});

test('exportação XML representa lista vazia com total zero', () => {
  const xml = criarXmlClientes([], new Date('2026-10-08T12:00:00.000Z'));
  assert.match(xml, /<total>0<\/total>/);
  assert.doesNotMatch(xml, /<cliente>/);
});
