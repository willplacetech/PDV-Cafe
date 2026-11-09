import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipDashboardReload } from '../src/utils/dashboardLoad.js';

test('nao recarrega o dashboard quando o mes ja foi carregado', () => {
  assert.equal(
    shouldSkipDashboardReload({
      selectedMonth: '2026-11',
      loadedMonth: '2026-11',
      carregandoFechamento: false,
    }),
    true
  );

  assert.equal(
    shouldSkipDashboardReload({
      selectedMonth: '2026-11',
      loadedMonth: '2026-10',
      carregandoFechamento: false,
    }),
    false
  );

  assert.equal(
    shouldSkipDashboardReload({
      selectedMonth: '2026-11',
      loadedMonth: '2026-11',
      carregandoFechamento: true,
    }),
    true
  );
});
