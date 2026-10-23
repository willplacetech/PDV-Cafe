import { useContext, useState, useEffect } from 'react';
import api from '../services/api.jsx';
import { AuthContext } from './AuthContextDefinition.jsx';
import { ConfiguracoesContext } from './ConfiguracoesContextDefinition.js';

export const ConfiguracoesProvider = ({ children }) => {
  const { user, loading: authLoading } = useContext(AuthContext);
  const [exigirAutorizacaoGerente, setExigirAutorizacaoGerente] = useState(true);
  const [bloqueadoPorSuporte, setBloqueadoPorSuporte] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (authLoading) { setLoading(true); return () => { active = false; }; }
    if (!user?.id) { setLoading(false); return () => { active = false; }; }
    setExigirAutorizacaoGerente(true);
    setBloqueadoPorSuporte(false);
    setLoading(true);
    api.get('/configuracoes')
      .then(({ data }) => { if (!active) return; setExigirAutorizacaoGerente(data.exigirAutorizacaoGerente !== false); setBloqueadoPorSuporte(Boolean(data.bloqueadoPorSuporte)); })
      .catch((error) => { if (!active) return; console.error('Erro ao buscar configurações:', error); setExigirAutorizacaoGerente(true); setBloqueadoPorSuporte(false); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, user?.id]);

  const updateConfiguracoes = async (valor, motivo) => { const { data } = await api.patch('/configuracoes/autorizacao-gerente', { valor, motivo }); setExigirAutorizacaoGerente(data.exigirAutorizacaoGerente !== false); return data; };
  return <ConfiguracoesContext.Provider value={{ exigirAutorizacaoGerente, bloqueadoPorSuporte, loading, updateConfiguracoes }}>{children}</ConfiguracoesContext.Provider>;
};
