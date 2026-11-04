const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithTenant(tenantId, callback) {
  return storage.run(String(tenantId), callback);
}

function currentTenantId() {
  return storage.getStore() || null;
}

module.exports = { runWithTenant, currentTenantId };
