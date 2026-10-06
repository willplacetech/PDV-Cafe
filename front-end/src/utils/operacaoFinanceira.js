const hashIntencao = async (valor) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

// Persist only a fingerprint and operation ID. A response lost before browser
// confirmation keeps its ID across reloads and cancellation of the dialog.
export const criarOperacoesFinanceiras = (api, options = {}) => {
  const operacoes = new Map();
  return {
    enviar(metodo, url, payload, { reusarConcluido = false } = {}) {
      const assinatura = JSON.stringify(payload);
      const recurso = `${metodo}:${url}`;
      let operacao = operacoes.get(recurso);
      if (reusarConcluido && operacao?.resultado) return Promise.resolve(operacao.resultado);
      if (!operacao || operacao.assinatura !== assinatura) {
        operacao = { assinatura };
        operacoes.set(recurso, operacao);
      }
      if (operacao.resultado) return Promise.resolve(operacao.resultado);
      if (operacao.pendente) return operacao.pendente;
      operacao.pendente = (async () => {
        const storage = options.storage === undefined ? globalThis.sessionStorage : options.storage;
        const savedUser = globalThis.localStorage?.getItem('pdv_user');
        const user = savedUser ? JSON.parse(savedUser) : null;
        const usuarioId = options.usuarioId || user?.id || user?._id || user?.username || '';
        const fingerprint = await hashIntencao(JSON.stringify([usuarioId, metodo, url, payload]));
        const storageKey = `pdv_financial_pending_v1:${fingerprint}`;
        const savedKey = storage?.getItem(storageKey);
        operacao.operacaoId = operacao.operacaoId || savedKey || crypto.randomUUID();
        if (!/^[A-Za-z0-9._:-]{1,128}$/.test(operacao.operacaoId)) throw new Error('Identificador de pagamento armazenado invalido');
        storage?.setItem(storageKey, operacao.operacaoId);
        const resultado = await api[metodo](url, { ...payload, operacaoId: operacao.operacaoId });
        // Storage cleanup must not turn an already confirmed receipt into an
        // apparent failure. A leftover key is still safe because server replays.
        try { storage?.removeItem(storageKey); } catch { /* keep safe replay */ }
        return resultado;
      })()
        .then(resultado => { operacao.resultado = resultado; return resultado; })
        .finally(() => { operacao.pendente = null; });
      return operacao.pendente;
    },
    limpar() { operacoes.clear(); },
  };
};
