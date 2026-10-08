import { createContext, useContext } from 'react';

export const FormasPagamentoContext = createContext(null);
export function useFormasPagamento() {
  const context = useContext(FormasPagamentoContext);
  if (!context) throw new Error('useFormasPagamento precisa estar dentro de FormasPagamentoProvider');
  return context;
}
