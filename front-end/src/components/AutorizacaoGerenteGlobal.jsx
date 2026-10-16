import { useEffect, useRef, useState } from 'react';
import AutorizarGerente from './AutorizarGerente.jsx';
import { getAutorizacaoCache } from '../services/managerApproval.js';

// Uma fila evita que requisições simultâneas substituam a confirmação umas das outras.
export default function AutorizacaoGerenteGlobal() {
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
  const finish = token => {
    const item = queue.current.shift();
    if (token) item?.resolve(token);
    else item?.reject(new Error('Autorização cancelada'));
    while (queue.current.length && getAutorizacaoCache(queue.current[0].acao)) {
      const next = queue.current.shift();
      next.resolve(getAutorizacaoCache(next.acao).token);
    }
    setCurrent(queue.current[0] || null);
  };
  return current && <AutorizarGerente key={current.acao} acao={current.acao} aberto onConfirmado={finish} onCancelar={() => finish(null)} />;
}
