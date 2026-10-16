import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import AutorizarGerente from './AutorizarGerente.jsx';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import api from '../services/api.jsx';
import { getAutorizacaoCache, guardarAutorizacao } from '../services/managerApproval.js';
import { getSessionGeneration } from '../services/accessSession.js';

// Uma fila evita que requisições simultâneas substituam a confirmação umas das outras.
export default function AutorizacaoGerenteGlobal() {
  const { user } = useContext(AuthContext);
  const eGerenteOuAdmin = user?.role === 'admin' || user?.role === 'gerente';
  const queue = useRef([]);
  const processamento = useRef(null);
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
  const finish = useCallback((request, token, error) => {
    if (queue.current[0] !== request) return;
    const item = queue.current.shift();
    if (token) item?.resolve(token);
    else item?.reject(error || new Error('Autorização cancelada'));
    while (queue.current.length && getAutorizacaoCache(queue.current[0].acao)) {
      const next = queue.current.shift();
      next.resolve(getAutorizacaoCache(next.acao).token);
    }
    setCurrent(queue.current[0] || null);
  }, []);

  useEffect(() => {
    if (!current || !eGerenteOuAdmin || processamento.current === current) return;
    processamento.current = current;
    const generation = getSessionGeneration();
    api.post('/auth/autorizar', { acao: current.acao })
      .then(({ data }) => {
        if (generation !== getSessionGeneration()) throw new Error('Sessão alterada durante a autorização');
        if (!data.tokenAutorizacao) throw new Error('Autorização rejeitada');
        guardarAutorizacao(current.acao, data.tokenAutorizacao);
        finish(current, data.tokenAutorizacao);
      })
      .catch(error => finish(current, null, error))
      .finally(() => {
        if (processamento.current === current) processamento.current = null;
      });
  }, [current, eGerenteOuAdmin, finish]);

  if (!current || eGerenteOuAdmin) return null;
  return <AutorizarGerente key={current.acao} acao={current.acao} aberto onConfirmado={token => finish(current, token)} onCancelar={() => finish(current, null)} />;
}
