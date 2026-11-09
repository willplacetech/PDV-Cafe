const { LRUCache } = require('lru-cache');

const cache = new LRUCache({ max: 500 });
const inFlight = new Map();

const cached = (key, ttlMs, loader) => {
  if (typeof key !== 'string' || typeof loader !== 'function') {
    throw new TypeError('A chave e o loader do cache são obrigatórios');
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new TypeError('O TTL do cache deve ser um número positivo');
  }

  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (inFlight.has(key)) return inFlight.get(key).promise;

  const pending = { promise: null, invalidated: false };
  const promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      if (value !== undefined && !pending.invalidated) {
        cache.set(key, value, { ttl: ttlMs });
      }
      return value;
    })
    .finally(() => {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    });

  pending.promise = promise;
  inFlight.set(key, pending);
  return promise;
};

const invalidate = (prefix) => {
  if (typeof prefix !== 'string') throw new TypeError('O prefixo de invalidação deve ser texto');

  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  for (const [key, pending] of inFlight) {
    if (key.startsWith(prefix)) {
      pending.invalidated = true;
      inFlight.delete(key);
    }
  }
};

module.exports = { cached, invalidate };
