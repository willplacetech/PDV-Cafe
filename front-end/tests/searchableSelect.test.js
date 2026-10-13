import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { selectOptions, filterOptions } from '../src/utils/selectOptions.js';

const option = (value, label, disabled = false) => React.createElement('option', { value, disabled }, label);

test('busca por trecho ignora acentos, caixa e espaços externos', () => {
  const options = selectOptions([option('1', 'Café com leite'), option('2', 'Pão francês')]);
  assert.deepEqual(filterOptions(options, '  CAFE  ').map(item => item.value), ['1']);
  assert.deepEqual(filterOptions(options, 'frances').map(item => item.value), ['2']);
  assert.equal(filterOptions(options, '').length, 2);
  assert.equal(filterOptions(options, 'inexistente').length, 0);
});

test('preserva valores, texto composto, fragments e opções desabilitadas de grupos', () => {
  const children = React.createElement(React.Fragment, null,
    option('', 'Selecione'),
    React.createElement('optgroup', { label: 'Insumos', disabled: true }, option(42, ['Açúcar', ' · kg'])),
    React.createElement('option', null, 'un'),
    option('x', 'Indisponível', true));
  assert.deepEqual(selectOptions(children), [
    { value: '', label: 'Selecione', disabled: false, group: '' },
    { value: '42', label: 'Açúcar · kg', disabled: true, group: 'Insumos' },
    { value: 'un', label: 'un', disabled: false, group: '' },
    { value: 'x', label: 'Indisponível', disabled: true, group: '' },
  ]);
});
