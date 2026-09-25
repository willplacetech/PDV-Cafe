import { useEffect, useState } from 'react';
import api from '../services/api.jsx';

const CHAVE_FILA = 'pdv_fila_offline';
const EVENTO_FILA = 'pdv:fila-offline-atualizada';
const EVENTO_ARMAZENAMENTO = 'pdv:armazenamento-offline';
const LIMITE_FILA = 50;
const INTERVALO_RETRY = 30_000;

let sincronizacaoAtual = null;
let timerRetry = null;

const lerFila = () => {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE_FILA) || '[]');
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
};

const publicarFila = () => window.dispatchEvent(new Event(EVENTO_FILA));
const publicarArmazenamento = (cheio) => window.dispatchEvent(new CustomEvent(EVENTO_ARMAZENAMENTO, { detail: cheio }));

const gravarFila = (fila) => {
  try {
    localStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
    publicarFila();
    return true;
  } catch {
    return false;
  }
};

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

const sincronizarFila = () => {
  if (sincronizacaoAtual) return sincronizacaoAtual;

  sincronizacaoAtual = (async () => {
    while (navigator.onLine) {
      const [venda] = lerFila();
      if (!venda) break;

      try {
        await api.post(venda.endpoint, venda.payload);
        const filaAtualizada = lerFila().filter((item) => item.idTemporario !== venda.idTemporario);
        if (!gravarFila(filaAtualizada)) break;
      } catch {
        if (timerRetry) window.clearTimeout(timerRetry);
        timerRetry = window.setTimeout(() => {
          timerRetry = null;
          void sincronizarFila();
        }, INTERVALO_RETRY);
        break;
      }
    }
  })().finally(() => {
    sincronizacaoAtual = null;
  });

  return sincronizacaoAtual;
};

export default function useFilaOffline() {
  const [pendentes, setPendentes] = useState(() => lerFila().length);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [armazenamentoCheio, setArmazenamentoCheio] = useState(false);

  useEffect(() => {
    const atualizarFila = () => setPendentes(lerFila().length);
    const ficouOnline = () => {
      setOnline(true);
      if (timerRetry) window.clearTimeout(timerRetry);
      timerRetry = null;
      void sincronizarFila();
    };
    const ficouOffline = () => setOnline(false);
    const atualizarArmazenamento = (event) => setArmazenamentoCheio(Boolean(event.detail));

    window.addEventListener(EVENTO_FILA, atualizarFila);
    window.addEventListener('storage', atualizarFila);
    window.addEventListener('online', ficouOnline);
    window.addEventListener('offline', ficouOffline);
    window.addEventListener(EVENTO_ARMAZENAMENTO, atualizarArmazenamento);
    void verificarEspaco().then(setArmazenamentoCheio);
    if (navigator.onLine) void sincronizarFila();

    return () => {
      window.removeEventListener(EVENTO_FILA, atualizarFila);
      window.removeEventListener('storage', atualizarFila);
      window.removeEventListener('online', ficouOnline);
      window.removeEventListener('offline', ficouOffline);
      window.removeEventListener(EVENTO_ARMAZENAMENTO, atualizarArmazenamento);
    };
  }, []);

  const enfileirar = async (endpoint, payload, idTemporario = idTemporarioNovo()) => {
    const fila = lerFila();
    if (fila.length >= LIMITE_FILA) return { ok: false, motivo: 'limite' };
    if (await verificarEspaco()) {
      setArmazenamentoCheio(true);
      publicarArmazenamento(true);
      return { ok: false, motivo: 'armazenamento' };
    }

    const venda = {
      idTemporario,
      endpoint,
      payload: { ...payload, idTemporario },
      status: 'pendente',
      criadaEm: new Date().toISOString(),
    };

    if (!gravarFila([...fila, venda])) {
      setArmazenamentoCheio(true);
      publicarArmazenamento(true);
      return { ok: false, motivo: 'armazenamento' };
    }

    setArmazenamentoCheio(false);
    publicarArmazenamento(false);
    if (navigator.onLine) void sincronizarFila();
    return { ok: true, venda };
  };

  return { pendentes, online, armazenamentoCheio, enfileirar };
}