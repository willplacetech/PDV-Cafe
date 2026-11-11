import test from 'node:test';
import assert from 'node:assert/strict';
import * as roleAccess from '../src/permissions/roleAccess.js';

test('role access arrays match the approved screen permissions', () => {
  const expected = {
    products: ['admin', 'gerente'],
    customers: ['admin', 'gerente'],
    productionStock: ['admin', 'gerente'],
    cash: ['admin', 'gerente'],
    kitchen: ['admin', 'operador', 'cozinha'],
    recipeSheets: ['admin', 'cozinha'],
    tableSettings: ['admin'],
    comandas: ['admin', 'gerente', 'operador', 'garcom', 'cozinha'],
  };

  for (const [screen, roles] of Object.entries(expected)) {
    assert.deepEqual(roleAccess[screen], roles, `unexpected roles for ${screen}`);
  }
});
