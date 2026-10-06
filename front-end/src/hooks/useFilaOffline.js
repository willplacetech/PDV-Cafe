import { useEffect, useState } from 'react';
import api from '../services/api.jsx';
import { offlineStore, SYNC_LEASE_MS } from '../services/offlineStore.js';

const EVENTO_FILA = 'pdv:fila-offline-atualizada';
const EVENTO_ARMAZENAMENTO = 'pdv:armazenamento-offline';
const CANAL_FILA = 'pdv:fila-offline';
const EVENTO_SESSAO = 'session:change';
const INTERVALO_RETRY = 30_000;

const publicarFila = () => {
  window.dispatchEvent(new Event(EVENTO_FILA));
  if (window.BroadcastChannel) {
    try {
      const channel = new window.BroadcastChannel(CANAL_FILA);
      channel.postMessage('atualizada');
      channel.close();
    } catch { /* O poll continua atualizando outras abas. */ }
  }
};
const publicarArmazenamento = cheio => window.dispatchEvent(new CustomEvent(EVENTO_ARMAZENAMENTO, { detail: cheio }));

const verificarEspaco = async () => {
  try {
    const estimativa = await navigator.storage?.estimate?.();
    return Boolean(estimativa?.quota && estimativa.usage / estimativa.quota >= 0.9);
  } catch {
    return false;
  }
};

const idTemporarioNovo = () => {
  const sufixo = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${Date.now()}-${sufixo}`;
};

const origemAtual = () => {
  try {
    const user = JSON.parse(localStorage.getItem('pdv_user') || 'null');
    const ownerId = user?._id ?? user?.id ?? user?.userId;
    const tenantId = user?.tenantId ?? null;
    return ownerId ? { ownerId: String(ownerId), tenantId, role: user.role, origemNaoConfirmada: false } : null;
  } catch {
    return null;
  }
};
const mesmaOrigem = (a, b) => Boolean(a && b && a.ownerId === b.ownerId && a.tenantId === b.tenantId);

export function createOfflineSynchronizer(store, post = (...args) => api.post(...args)) {
  const owner = idTemporarioNovo();
  let running = null;
  let retryTimer = null;
  let controller = null;
  let stopped = false;
  let generation = 0;

  const clearRetry = () => {
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = null;
  };
  const retry = () => {
    if (stopped || retryTimer !== null) return;
    retryTimer = window.setTimeout(() => { retryTimer = null; void run(); }, INTERVALO_RETRY);
  };
  const run = () => {
    if (running) return running;
    stopped = false;
    clearRetry();
    const identity = origemAtual();
    const startedGeneration = generation;
    running = (async () => {
      while (!stopped && identity && navigator.onLine && mesmaOrigem(identity, origemAtual())) {
        let claim;
        try {
          claim = await store.claimNext(owner, SYNC_LEASE_MS, identity);
          if (!claim) {
            // Outra aba pode ter sido encerrada. O retry recupera seu lease.
            if ((await store.list(identity)).some(item => item.status !== 'quarentena')) retry();
            break;
          }
        } catch {
          publicarArmazenamento(true);
          retry();
          break;
        }

        if (stopped || generation !== startedGeneration || !mesmaOrigem(identity, origemAtual()) || !mesmaOrigem(claim.venda, identity)) {
          try { await store.releaseClaim(claim); } catch { publicarArmazenamento(true); }
          break;
        }

        const requestController = new AbortController();
        controller = requestController;
        const signal = requestController.signal;
        let lostLease = false;
        const heartbeat = window.setInterval(() => {
          void store.renewLease(claim).then(valid => {
            if (!valid) { lostLease = true; requestController.abort(); }
          }).catch(() => { lostLease = true; requestController.abort(); publicarArmazenamento(true); });
        }, SYNC_LEASE_MS / 6);
        try {
          // URL absoluta jamais deve receber o token da sessao via interceptor.
          if (claim.venda.endpoint !== '/comandas') throw new Error('Endpoint offline nao permitido');
          await post(claim.venda.endpoint, { ...claim.venda.payload, origemOffline: {
            ownerId: claim.venda.ownerId, tenantId: claim.venda.tenantId,
            ...(claim.venda.originAudit ? { originAudit: claim.venda.originAudit } : {}),
          } }, {
            headers: { 'Idempotency-Key': claim.venda.idTemporario }, signal,
          });
          if (lostLease || stopped || !await store.completeClaim(claim)) { retry(); break; }
          publicarFila();
        } catch {
          // Uma resposta perdida nao troca a chave: o backend deduplica o retry.
          retry();
          break;
        } finally {
          window.clearInterval(heartbeat);
          controller = null;
          try { await store.releaseClaim(claim); } catch { publicarArmazenamento(true); }
        }
      }
    })().finally(() => { running = null; });
    return running;
  };

  return {
    run,
    stop: () => { generation += 1; stopped = true; clearRetry(); controller?.abort(); },
  };
}

const sincronizador = createOfflineSynchronizer(offlineStore);
let consumidores = 0;

export default function useFilaOffline() {
  const [pendentes, setPendentes] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [armazenamentoCheio, setArmazenamentoCheio] = useState(false);
  const [origensPendentes, setOrigensPendentes] = useState([]);

  useEffect(() => {
    consumidores += 1;
    let ativo = true;
    let revision = 0;
    const atualizarFila = async () => {
      const version = ++revision;
      const identity = origemAtual();
      try {
        const migration = await offlineStore.ready();
        const fila = await offlineStore.list(identity);
        const quarantine = await offlineStore.listQuarantine(identity);
        if (ativo && version === revision && mesmaOrigem(identity, origemAtual())) {
          setPendentes(fila.length);
          setOrigensPendentes(quarantine.map(item => ({ idTemporario: item.idTemporario, criadaEm: item.criadaEm })));
          if (migration.invalidos) setArmazenamentoCheio(true);
        }
      } catch {
        if (ativo) setArmazenamentoCheio(true);
      }
    };
    const ficouOnline = () => { setOnline(true); void sincronizador.run(); };
    const ficouOffline = () => { setOnline(false); sincronizador.stop(); };
    const mudouSessao = event => {
      if (event?.detail?.scope && event.detail.scope !== 'pdv') return;
      revision += 1;
      setPendentes(0);
      setOrigensPendentes([]);
      sincronizador.stop();
      void atualizarFila();
      if (navigator.onLine) void sincronizador.run().finally(() => { if (ativo && origemAtual()) void sincronizador.run(); });
    };
    const atualizarArmazenamento = event => setArmazenamentoCheio(Boolean(event.detail));
    const channel = window.BroadcastChannel ? new window.BroadcastChannel(CANAL_FILA) : null;
    if (channel) channel.onmessage = () => { void atualizarFila(); if (navigator.onLine) void sincronizador.run(); };
    window.addEventListener(EVENTO_FILA, atualizarFila);
    window.addEventListener('storage', mudouSessao);
    window.addEventListener(EVENTO_SESSAO, mudouSessao);
    window.addEventListener('online', ficouOnline);
    window.addEventListener('offline', ficouOffline);
    window.addEventListener(EVENTO_ARMAZENAMENTO, atualizarArmazenamento);
    // Poll tambem atualiza navegadores sem BroadcastChannel.
    const refreshTimer = window.setInterval(atualizarFila, INTERVALO_RETRY);
    void atualizarFila();
    void verificarEspaco().then(cheio => { if (ativo && cheio) setArmazenamentoCheio(true); });
    if (navigator.onLine) void sincronizador.run();

    return () => {
      ativo = false;
      consumidores -= 1;
      if (!consumidores) sincronizador.stop();
      channel?.close();
      window.clearInterval(refreshTimer);
      window.removeEventListener(EVENTO_FILA, atualizarFila);
      window.removeEventListener('storage', mudouSessao);
      window.removeEventListener(EVENTO_SESSAO, mudouSessao);
      window.removeEventListener('online', ficouOnline);
      window.removeEventListener('offline', ficouOffline);
      window.removeEventListener(EVENTO_ARMAZENAMENTO, atualizarArmazenamento);
    };
  }, []);

  const enfileirar = async (endpoint, payload, idTemporario = idTemporarioNovo()) => {
    const origem = origemAtual();
    if (!origem) return { ok: false, motivo: 'sessao' };
    try {
      if (await verificarEspaco()) throw new Error('Armazenamento proximo do limite');
      const venda = {
        idTemporario, endpoint, payload: { ...payload, idTemporario },
        status: 'pendente', criadaEm: new Date().toISOString(), ...origem,
      };
      const result = await offlineStore.enqueue(venda);
      if (!result.ok) return result;
      setArmazenamentoCheio(false);
      publicarArmazenamento(false);
      publicarFila();
      if (navigator.onLine) void sincronizador.run();
      return result;
    } catch {
      setArmazenamentoCheio(true);
      publicarArmazenamento(true);
      return { ok: false, motivo: 'armazenamento' };
    }
  };

  const resolverOrigem = async (id, reason, confirmed) => {
    const result = await offlineStore.resolveOrigin(id, origemAtual(), { reason, confirmed });
    publicarFila();
    if (navigator.onLine) void sincronizador.run();
    return result;
  };

  return { pendentes, online, armazenamentoCheio, enfileirar, origensPendentes, resolverOrigem };
}
