export const OFFLINE_DB_NAME = 'pdv_offline';
export const OFFLINE_QUEUE_STORE = 'fila';
export const LEGACY_QUEUE_KEY = 'pdv_fila_offline';
export const OFFLINE_QUEUE_LIMIT = 50;
export const SYNC_LEASE_MS = 90_000;

const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const uniqueToken = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const validLegacy = item => item && typeof item.idTemporario === 'string' && item.idTemporario.length > 0
  && item.endpoint === '/comandas'
  && item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload);
const canonicalJSON = value => JSON.stringify(value, (_key, entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  return Object.keys(entry).sort().reduce((result, key) => { result[key] = entry[key]; return result; }, Object.create(null));
});
const sameRequest = (a, b) => a.endpoint === b.endpoint && canonicalJSON(a.payload) === canonicalJSON(b.payload)
  && a.ownerId === b.ownerId && a.tenantId === b.tenantId;
const knownOrigin = item => typeof item?.ownerId === 'string' && item.ownerId.length > 0
  && (item.tenantId === null || (typeof item.tenantId === 'string' && item.tenantId.length > 0));
const belongsTo = (item, identity) => knownOrigin(item) && knownOrigin(identity)
  && item.ownerId === identity.ownerId && item.tenantId === identity.tenantId && !item.origemNaoConfirmada;
const unresolvedOrigin = item => !knownOrigin(item) || item.origemNaoConfirmada;

// Cada operacao de escrita usa uma transacao que abrange fila e metadados.
// O lease duravel coordena abas; a idempotencia no servidor protege retries
// apos encerramento/expiracao enquanto uma requisicao antiga ainda esta em voo.
export function createOfflineStore(options = {}) {
  const factory = () => options.indexedDB ?? globalThis.indexedDB;
  const legacyStorage = () => options.storage ?? globalThis.localStorage;
  const now = options.now ?? (() => Date.now());
  let databasePromise;
  let readyPromise;

  const database = () => {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const indexedDB = factory();
        if (!indexedDB) throw new Error('IndexedDB indisponivel');
        const request = indexedDB.open(options.dbName ?? OFFLINE_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: 'idTemporario' });
          db.createObjectStore('metadata', { keyPath: 'key' });
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba'));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); databasePromise = null; readyPromise = null; };
          resolve(db);
        };
      }).catch(error => { databasePromise = null; throw error; });
    }
    return databasePromise;
  };

  const transaction = async (mode, operation) => {
    const db = await database();
    const tx = db.transaction([OFFLINE_QUEUE_STORE, 'metadata'], mode);
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error ?? new Error('Transacao offline abortada'));
      tx.onerror = () => {}; // O abort abaixo entrega o erro sem esconder falhas.
    });
    // O abort pode ocorrer antes de operation terminar sua requisicao.
    void done.catch(() => {});
    try {
      const result = await operation(tx.objectStore(OFFLINE_QUEUE_STORE), tx.objectStore('metadata'));
      await done;
      return result;
    } catch (error) {
      try { tx.abort(); } catch { /* Transacao ja encerrada. */ }
      await done.catch(() => {});
      throw error;
    }
  };

  const migrate = async () => {
    await database();
    const storage = legacyStorage();
    const raw = storage?.getItem(LEGACY_QUEUE_KEY);
    if (!raw) return { invalidos: 0, legadoPreservado: false };
    let entries;
    try { entries = JSON.parse(raw); } catch { entries = null; }
    if (!Array.isArray(entries)) return { invalidos: 1, legadoPreservado: true };
    let invalidos = entries.filter(item => !validLegacy(item)).length;
    await transaction('readwrite', async (queue, metadata) => {
      const migration = await requestResult(metadata.get('legacyMigration'));
      if (migration?.raw === raw) { invalidos = migration.invalidos; return; }
      for (const item of entries) {
        if (!validLegacy(item)) continue;
        const normalized = { ...item, payload: { ...item.payload, idTemporario: item.idTemporario }, origemNaoConfirmada: true,
          status: 'quarentena', motivoQuarentena: 'origem-desconhecida' };
        const receiptKey = `legacyItem:${item.idTemporario}`;
        const receipt = await requestResult(metadata.get(receiptKey));
        if (receipt) {
          if (!sameRequest(receipt.venda, normalized)) invalidos += 1;
          continue;
        }
        const existing = await requestResult(queue.get(item.idTemporario));
        if (existing && !sameRequest(existing, normalized)) { invalidos += 1; continue; }
        if (!existing) {
          // Nao atribuir o legado ao usuario que fez login durante a migracao.
          // P8 deve validar esta origem antes de enviar para outro usuario/tenant.
          await requestResult(queue.add(normalized));
        }
        // Recibo por id impede ressuscitar vendas se um backup legado mudar.
        await requestResult(metadata.put({ key: receiptKey, venda: normalized }));
      }
      await requestResult(metadata.put({ key: 'legacyMigration', raw, invalidos }));
    });
    // Exclusao apenas depois do commit, e somente se nenhuma aba mudou o legado.
    if (!invalidos) {
      try {
        if (storage.getItem(LEGACY_QUEUE_KEY) === raw) storage.removeItem(LEGACY_QUEUE_KEY);
      } catch { return { invalidos, legadoPreservado: true }; }
    }
    return { invalidos, legadoPreservado: Boolean(invalidos) };
  };

  const ready = () => {
    if (!readyPromise) readyPromise = migrate().catch(error => { readyPromise = null; throw error; });
    return readyPromise;
  };
  const operate = async (mode, operation) => { await ready(); return transaction(mode, operation); };
  const sameLease = (lease, claim) => lease && lease.owner === claim.owner && lease.token === claim.token
    && lease.itemId === claim.venda.idTemporario;

  return {
    ready,
    list: identity => operate('readonly', async queue => (await requestResult(queue.getAll())).filter(item => belongsTo(item, identity))),
    // Inspecao local para diagnostico; a UI e o worker usam exclusivamente list(identity).
    inspectAll: () => operate('readonly', queue => requestResult(queue.getAll())),
    listQuarantine: identity => operate('readonly', async queue => identity?.role === 'admin' && knownOrigin(identity)
      ? (await requestResult(queue.getAll())).filter(unresolvedOrigin) : []),
    resolveOrigin: (id, identity, confirmation) => operate('readwrite', async (queue, metadata) => {
      if (identity?.role !== 'admin' || !knownOrigin(identity) || confirmation?.confirmed !== true
        || typeof confirmation.reason !== 'string' || confirmation.reason.trim().length < 3) throw new Error('Administrador, confirmacao e motivo obrigatorios');
      const item = await requestResult(queue.get(id));
      if (!item || !unresolvedOrigin(item) || !validLegacy(item)) throw new Error('Origem nao pode ser reatribuida');
      const lease = await requestResult(metadata.get('syncLease'));
      if (lease?.itemId === id && lease.expiresAt > now()) throw new Error('Venda em sincronizacao');
      const originAudit = { resolvedBy: identity.ownerId, resolvedAt: new Date(now()).toISOString(),
        previousOwnerId: item.ownerId ?? null, previousTenantId: item.tenantId ?? null,
        reason: confirmation.reason.trim().slice(0, 500), confirmed: true };
      const venda = { ...item, ownerId: identity.ownerId, tenantId: identity.tenantId,
        origemNaoConfirmada: false, status: 'pendente', motivoQuarentena: null, originAudit,
        payload: { ...item.payload, origemOffline: { ownerId: identity.ownerId, tenantId: identity.tenantId, originAudit } } };
      await requestResult(queue.put(venda));
      await requestResult(metadata.put({ key: `originResolution:${id}`, ...originAudit, ownerId: identity.ownerId, tenantId: identity.tenantId }));
      return { ok: true, venda };
    }),
    enqueue: input => operate('readwrite', async queue => {
      const venda = knownOrigin(input) ? { ...input, payload: { ...input.payload,
        origemOffline: { ownerId: input.ownerId, tenantId: input.tenantId } } } : { ...input,
        status: 'quarentena', origemNaoConfirmada: true, motivoQuarentena: 'origem-desconhecida' };
      if (!validLegacy(venda)) throw new DOMException('Venda offline invalida', 'DataError');
      const existing = await requestResult(queue.get(venda.idTemporario));
      if (existing) return sameRequest(existing, venda)
        ? { ok: true, venda: existing } : { ok: false, motivo: 'conflito' };
      if (await requestResult(queue.count()) >= OFFLINE_QUEUE_LIMIT) return { ok: false, motivo: 'limite' };
      await requestResult(queue.add(venda));
      return { ok: true, venda };
    }),
    claimNext: (owner, duration = SYNC_LEASE_MS, identity) => operate('readwrite', async (queue, metadata) => {
      const current = await requestResult(metadata.get('syncLease'));
      if (current?.expiresAt > now()) return null;
      const allItems = await requestResult(queue.getAll());
      const items = [];
      for (const item of allItems) {
        if (unresolvedOrigin(item)) {
          if (item.motivoQuarentena !== 'origem-desconhecida') await requestResult(queue.put({ ...item, status: 'quarentena', motivoQuarentena: 'origem-desconhecida' }));
          continue;
        }
        if (item.status === 'quarentena') continue;
        if (!validLegacy(item) || item.payload.idTemporario !== item.idTemporario) {
          await requestResult(queue.put({ ...item, status: 'quarentena', motivoQuarentena: 'registro-invalido' }));
          continue;
        }
        if (belongsTo(item, identity)) items.push(item);
      }
      items.sort((a, b) => String(a.criadaEm ?? '').localeCompare(String(b.criadaEm ?? '')) || a.idTemporario.localeCompare(b.idTemporario));
      const [venda] = items;
      if (!venda) { await requestResult(metadata.delete('syncLease')); return null; }
      const token = uniqueToken();
      await requestResult(metadata.put({ key: 'syncLease', owner, token, itemId: venda.idTemporario, expiresAt: now() + duration }));
      return { owner, token, venda };
    }),
    renewLease: (claim, duration = SYNC_LEASE_MS) => operate('readwrite', async (_queue, metadata) => {
      const lease = await requestResult(metadata.get('syncLease'));
      if (!sameLease(lease, claim) || lease.expiresAt <= now()) return false;
      await requestResult(metadata.put({ ...lease, expiresAt: now() + duration }));
      return true;
    }),
    completeClaim: claim => operate('readwrite', async (queue, metadata) => {
      const lease = await requestResult(metadata.get('syncLease'));
      if (!sameLease(lease, claim) || lease.expiresAt <= now()) return false;
      await requestResult(queue.delete(claim.venda.idTemporario));
      await requestResult(metadata.delete('syncLease'));
      return true;
    }),
    releaseClaim: claim => operate('readwrite', async (_queue, metadata) => {
      const lease = await requestResult(metadata.get('syncLease'));
      if (!sameLease(lease, claim)) return false;
      await requestResult(metadata.delete('syncLease'));
      return true;
    }),
  };
}

export const offlineStore = createOfflineStore();
