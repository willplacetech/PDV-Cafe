import test from 'node:test';
import assert from 'node:assert/strict';
import * as roleAccess from '../src/permissions/roleAccess.js';

test('role access arrays match the approved screen permissions', () => {
  const expected = {
    pdv: ['admin', 'operador', 'garcom'],
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

test('each role lands on a screen it can access', () => {
  const expected = {
    admin: '/dashboard',
    gerente: '/comandas',
    operador: '/pdv',
    garcom: '/pdv',
    cozinha: '/cozinha',
  };

  for (const [role, path] of Object.entries(expected)) {
    assert.equal(roleAccess.getHomePath(role), path, `unexpected home path for ${role}`);
  }
});
