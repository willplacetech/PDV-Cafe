import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import AutorizarGerente from './AutorizarGerente.jsx';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { useConfiguracoes } from '../hooks/useConfiguracoes.js';
import api from '../services/api.jsx';
import { emitirAutorizacaoAdmin, getAutorizacaoCache, guardarAutorizacao } from '../services/managerApproval.js';

// Uma fila evita que requisições simultâneas substituam a confirmação umas das outras.
export default function AutorizacaoGerenteGlobal() {
  const { user } = useContext(AuthContext);
  const { exigirAutorizacaoGerente } = useConfiguracoes();
  const eAdmin = user?.role === 'admin';
  const queue = useRef([]);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    const receive = event => {
      queue.current.push(event.detail);
      setCurrent(queue.current[0]);
    };
    const cancel = () => {
      queue.current.splice(0).forEach(item => item.reject(new Error('Autorização cancelada')));
      setCurrent(null);
    };
    const session = event => { if (event.detail.scope === 'pdv') cancel(); };
    window.addEventListener('gerente:autorizar', receive);
    window.addEventListener('session:change', session);
    return () => {
      window.removeEventListener('gerente:autorizar', receive);
      window.removeEventListener('session:change', session);
      cancel();
    };
  }, []);

  const finish = useCallback((request, token, error, cancelled = false) => {
    if (queue.current[0] !== request) return;
    const item = queue.current.shift();
    if (cancelled || error) item?.reject(error || new Error('Autorização cancelada'));
    else item?.resolve(token ?? null);
    while (queue.current.length && getAutorizacaoCache(queue.current[0].acao)) {
      const next = queue.current.shift();
      next.resolve(getAutorizacaoCache(next.acao).token);
    }
    setCurrent(queue.current[0] || null);
  }, []);

  useEffect(() => {
    if (!current || !eAdmin || exigirAutorizacaoGerente === false) return undefined;
    let active = true;
    emitirAutorizacaoAdmin(current.acao, async acao => {
      const { data } = await api.post('/auth/autorizar', { acao });
      return data;
    }).then(token => {
      if (active) finish(current, token);
    }).catch(error => {
      if (active) finish(current, null, error);
    });
    return () => { active = false; };
  }, [current, eAdmin, exigirAutorizacaoGerente, finish]);

  // A configuração global desligada dispensa a autorização no servidor.
  useEffect(() => {
    if (!current) return;
    if (exigirAutorizacaoGerente === false) {
      finish(current, null);
    }
  }, [current, exigirAutorizacaoGerente, finish]);

  if (!current || eAdmin || exigirAutorizacaoGerente === false) return null;

  return (
    <AutorizarGerente
      key={current.acao}
      acao={current.acao}
      aberto
      onConfirmado={token => {
        guardarAutorizacao(current.acao, token);
        finish(current, token);
      }}
      onCancelar={() => finish(current, null, null, true)}
    />
  );
}
