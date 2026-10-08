import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api.jsx';
import { AuthContext } from './AuthContextDefinition.jsx';
import { FormasPagamentoContext } from './FormasPagamentoDefinition.js';
import { FORMAS_PAGAMENTO, rotuloPagamento as rotuloPadrao } from '../utils/formasPagamento.jsx';

const PADRAO = FORMAS_PAGAMENTO.map(forma => ({ ...forma, personalizada: false, taxaPercentual: 0 }));
const lerCache = chave => {
  try {
    const dados = JSON.parse(localStorage.getItem(chave));
    return Array.isArray(dados) && dados.length && dados.every(forma => typeof forma.value === 'string' && typeof forma.label === 'string') ? dados : PADRAO;
  } catch { return PADRAO; }
};

export function FormasPagamentoProvider({ children }) {
  const { user } = useContext(AuthContext);
  const chaveCache = `pdv_formas_pagamento_${user?.id || user?._id || user?.username || ''}`;
  const [formasPagamento, setFormasPagamento] = useState(() => lerCache(chaveCache));
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const requisicaoRef = useRef(null);
  const versaoRef = useRef(0);
  const atualizarFormas = useCallback(formas => {
    versaoRef.current += 1;
    setFormasPagamento(formas);
    setErro('');
    try { localStorage.setItem(chaveCache, JSON.stringify(formas)); } catch { /* cache auxiliar */ }
  }, [chaveCache]);
  const recarregar = useCallback(() => {
    if (requisicaoRef.current) return requisicaoRef.current;
    const versaoInicial = versaoRef.current;
    setCarregando(true);
    const requisicao = api.get('/payment-settings', { pdvSilenciosa: true }).then(({ data }) => {
      if (!Array.isArray(data.formasPagamento) || !data.formasPagamento.length) throw new Error('Não foi possível carregar as formas de pagamento.');
      if (versaoInicial === versaoRef.current) atualizarFormas(data.formasPagamento);
      return data.formasPagamento;
    }).catch(error => {
      if (versaoInicial === versaoRef.current) setErro(error.response?.data?.msg || 'Não foi possível carregar as formas de pagamento.');
      return null;
    }).finally(() => { setCarregando(false); requisicaoRef.current = null; });
    requisicaoRef.current = requisicao;
    return requisicao;
  }, [atualizarFormas]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void recarregar(); }, 0);
    const atualizarAoVoltar = () => { if (document.visibilityState === 'visible') void recarregar(); };
    window.addEventListener('focus', atualizarAoVoltar);
    document.addEventListener('visibilitychange', atualizarAoVoltar);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', atualizarAoVoltar);
      document.removeEventListener('visibilitychange', atualizarAoVoltar);
    };
  }, [recarregar]);

  const rotuloPagamento = useCallback(tipo => formasPagamento.find(forma => forma.value === tipo)?.label || rotuloPadrao(tipo), [formasPagamento]);
  const value = useMemo(() => ({ formasPagamento, rotuloPagamento, atualizarFormas, recarregar, carregando, erro }), [formasPagamento, rotuloPagamento, atualizarFormas, recarregar, carregando, erro]);
  return <FormasPagamentoContext.Provider value={value}>{children}</FormasPagamentoContext.Provider>;
}
