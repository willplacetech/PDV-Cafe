import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api.jsx';

const ConfiguracoesContext = createContext();

export const useConfiguracoes = () => {
  const context = useContext(ConfiguracoesContext);
  if (!context) {
    throw new Error('useConfiguracoes must be used within a ConfiguracoesProvider');
  }
  return context;
};

export const ConfiguracoesProvider = ({ children }) => {
  const [exigirAutorizacaoGerente, setExigirAutorizacaoGerente] = useState(true);
  const [bloqueadoPorSuporte, setBloqueadoPorSuporte] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfiguracoes = async () => {
      try {
        const { data } = await api.get('/configuracoes');
        setExigirAutorizacaoGerente(data.exigirAutorizacaoGerente);
        setBloqueadoPorSuporte(data.bloqueadoPorSuporte);
      } catch (error) {
        console.error('Erro ao buscar configurações:', error);
        // Default to true (safe side)
        setExigirAutorizacaoGerente(true);
        setBloqueadoPorSuporte(false);
      } finally {
        setLoading(false);
      }
    };

    fetchConfiguracoes();
  }, []);

  const updateConfiguracoes = async (valor, motivo) => {
    try {
      const { data } = await api.patch('/configuracoes/autorizacao-gerente', { valor, motivo });
      setExigirAutorizacaoGerente(data.exigirAutorizacaoGerente);
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
