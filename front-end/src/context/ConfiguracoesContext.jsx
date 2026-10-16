import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api.jsx';
import { AuthContext } from './AuthContextDefinition.jsx';

const ConfiguracoesContext = createContext();

export const useConfiguracoes = () => {
  const context = useContext(ConfiguracoesContext);
  if (!context) {
    throw new Error('useConfiguracoes must be used within a ConfiguracoesProvider');
  }
  return context;
};

export const ConfiguracoesProvider = ({ children }) => {
  const { user, loading: authLoading } = useContext(AuthContext);
  const [exigirAutorizacaoGerente, setExigirAutorizacaoGerente] = useState(true);
  const [bloqueadoPorSuporte, setBloqueadoPorSuporte] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchConfiguracoes = async () => {
      setExigirAutorizacaoGerente(true);
      setBloqueadoPorSuporte(false);
      if (authLoading) {
        setLoading(true);
        return;
      }
      if (user?.role !== 'admin') {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data } = await api.get('/configuracoes');
        if (!active) return;
        setExigirAutorizacaoGerente(data.exigirAutorizacaoGerente !== false);
        setBloqueadoPorSuporte(Boolean(data.bloqueadoPorSuporte));
      } catch (error) {
        if (!active) return;
        console.error('Erro ao buscar configurações:', error);
        setExigirAutorizacaoGerente(true);
        setBloqueadoPorSuporte(false);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchConfiguracoes();
    return () => { active = false; };
  }, [authLoading, user?.id, user?.role]);

  const updateConfiguracoes = async (valor, motivo) => {
    try {
      const { data } = await api.patch('/configuracoes/autorizacao-gerente', { valor, motivo });
      setExigirAutorizacaoGerente(data.exigirAutorizacaoGerente !== false);
      return data;
    } catch (error) {
      throw error;
    }
  };

  return (
    <ConfiguracoesContext.Provider value={{
      exigirAutorizacaoGerente,
      bloqueadoPorSuporte,
      loading,
      updateConfiguracoes
    }}>
      {children}
    </ConfiguracoesContext.Provider>
  );
};
