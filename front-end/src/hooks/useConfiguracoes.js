import { useContext } from 'react';
import { ConfiguracoesContext } from '../context/ConfiguracoesContextDefinition.js';

export const useConfiguracoes = () => {
  const context = useContext(ConfiguracoesContext);
  if (!context) {
    throw new Error('useConfiguracoes must be used within a ConfiguracoesProvider');
  }
  return context;
};
