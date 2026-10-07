import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import api from '../services/api.jsx';
import { criarOperacoesFinanceiras } from '../utils/operacaoFinanceira.js';

const ComandaContext = createContext(null);

const novaComanda = () => ({
  tipo: 'balcao',
  mesaId: undefined,
  mesaNumero: undefined,
  clienteNome: '',
  observacao: '',
  itens: [],
  status: 'rascunho',
});

const normalizarComanda = comanda => ({
  _id: comanda._id,
  numero: comanda.numero,
  tipo: comanda.tipoAtendimento === 'delivery' ? 'delivery' : comanda.tipoAtendimento || 'mesa',
  mesaId: comanda.mesa,
  mesaNumero: comanda.mesa,
  clienteId: comanda.clienteId,
  clienteNome: comanda.clienteNome || '',
  observacao: comanda.observacao || '',
  clienteTelefone: comanda.clienteTelefone || '',
  entrega: comanda.entrega,
  taxaEntrega: Number(comanda.taxaEntrega || 0),
  itens: (comanda.itens || []).map(item => ({
    ...item,
    produtoId: String(item.produtoId),
    precoUnitarioOriginal: item.precoUnitarioOriginal ?? item.precoUnitario,
  })),
  status: comanda.status || 'aberta',
  registroOriginal: comanda,
});

export function ComandaProvider({ children }) {
  const [comandaAtual, setComandaAtual] = useState(novaComanda);
  const [operacoesFinanceiras] = useState(() => criarOperacoesFinanceiras(api));

  const adicionarItem = useCallback(item => {
    setComandaAtual(atual => {
      const assinatura = (item.modificadores || []).join('|');
      const existente = atual.itens.find(linha => linha.produtoId === item.produtoId && (linha.modificadores || []).join('|') === assinatura);
      const itens = existente
        ? atual.itens.map(linha => linha === existente ? { ...linha, quantidade: Number((Number(linha.quantidade) + Number(item.quantidade || 1)).toFixed(3)) } : linha)
        : [...atual.itens, item];
      return { ...atual, itens, status: 'rascunho' };
    });
  }, []);

  const removerItem = useCallback(indice => {
    setComandaAtual(atual => ({ ...atual, itens: atual.itens.filter((_, index) => index !== indice), status: 'rascunho' }));
  }, []);

  const alterarQtd = useCallback((indice, quantidade) => {
    setComandaAtual(atual => ({
      ...atual,
      itens: atual.itens.map((item, index) => index === indice ? { ...item, quantidade: Number(quantidade) } : item),
      status: 'rascunho',
    }));
  }, []);

  const setTipo = useCallback(tipo => {
    if (!['balcao', 'mesa', 'retirada', 'delivery'].includes(tipo)) throw new Error('Tipo de atendimento inválido');
    setComandaAtual(atual => ({ ...atual, tipo, ...(tipo !== 'mesa' ? { mesaId: undefined, mesaNumero: undefined } : {}) }));
  }, []);

  const setMesa = useCallback((mesaId, mesaNumero = mesaId) => {
    setComandaAtual(atual => ({ ...atual, tipo: 'mesa', mesaId, mesaNumero }));
  }, []);

  const salvarComandaAberta = useCallback(async (atual = comandaAtual) => {
    if (!atual.itens.length) throw new Error('Adicione itens antes de salvar a comanda.');
    const entrega = atual.tipo === 'delivery' ? atual.entrega : undefined;
    const body = {
      tipoAtendimento: atual.tipo,
      mesa: atual.tipo === 'mesa' ? String(atual.mesaNumero || atual.mesaId || '') : undefined,
      clienteId: atual.clienteId || undefined,
      clienteNome: atual.clienteNome || undefined,
      clienteTelefone: atual.clienteTelefone || undefined,
      observacao: atual.observacao || undefined,
      entrega: entrega ? {
        ...entrega,
        endereco: entrega.endereco,
        taxaEntrega: Number(entrega.taxaEntrega || 0),
      } : undefined,
    };
    if (!atual._id) {
      const { data } = await api.post('/comandas', {
        ...body,
        idTemporario: atual.idTemporario,
        rascunho: false,
        itens: atual.itens.map(item => ({
          precoUnitarioManual: item.precoUnitarioManual,
          produtoId: item.produtoId,
          quantidade: Number(item.quantidade),
          tipoVenda: item.tipoVenda,
          pesoVendidoKg: item.pesoVendidoKg,
          modificadores: item.modificadores || [],
        })),
      });
      const salvo = normalizarComanda(data);
      setComandaAtual(salvo);
      return salvo;
    }

    await api.patch(`/comandas/${atual._id}/detalhes`, body);
    const originais = atual.registroOriginal?.itens || [];
    const atuaisPorId = new Map(atual.itens.filter(item => item._id).map(item => [String(item._id), item]));
    for (const item of originais) {
      const atualItem = atuaisPorId.get(String(item._id));
      if (!atualItem) {
        await api.delete(`/comandas/${atual._id}/itens/${item._id}`);
      } else if (Number(atualItem.quantidade) !== Number(item.quantidade) || atualItem.precoUnitarioManual !== item.precoUnitarioManual) {
        await api.patch(`/comandas/${atual._id}/itens/${item._id}`, { quantidade: atualItem.quantidade, precoUnitarioManual: atualItem.precoUnitarioManual });
      }
    }
    const idsOriginais = new Set(originais.map(item => String(item._id)));
    for (const item of atual.itens.filter(linha => !linha._id || !idsOriginais.has(String(linha._id)))) {
      await api.post(`/comandas/${atual._id}/itens`, {
        precoUnitarioManual: item.precoUnitarioManual,
        produtoId: item.produtoId,
        quantidade: Number(item.quantidade),
        tipoVenda: item.tipoVenda,
        pesoVendidoKg: item.pesoVendidoKg,
        modificadores: item.modificadores || [],
      });
    }
    const { data } = await api.get('/comandas?status=aberta');
    const salvo = normalizarComanda(data.find(item => item._id === atual._id) || atual.registroOriginal);
    setComandaAtual(salvo);
    return salvo;
  }, [comandaAtual]);

  const carregarComanda = useCallback(async id => {
    const response = await api.get('/comandas?status=aberta');
    const comanda = response.data.find(item => String(item._id) === String(id));
    if (!comanda) throw new Error('A comanda não está mais aberta.');
    const carregada = normalizarComanda(comanda);
    setComandaAtual(carregada);
    return carregada;
  }, []);

  const fecharComanda = useCallback(async (pagamento, comandaSalva = comandaAtual) => {
    const comanda = comandaSalva._id ? comandaSalva : await salvarComandaAberta(comandaSalva);
    const { data } = await operacoesFinanceiras.enviar('post', `/comandas/${comanda._id}/fechar`, pagamento);
    setComandaAtual(novaComanda());
    return { comanda: comanda.registroOriginal || comanda, ...data };
  }, [comandaAtual, salvarComandaAberta, operacoesFinanceiras]);

  const limparComanda = useCallback(() => setComandaAtual(novaComanda()), []);
  const value = useMemo(() => ({
    comandaAtual,
    setComandaAtual,
    adicionarItem,
    removerItem,
    alterarQtd,
    setTipo,
    setMesa,
    salvarComandaAberta,
    fecharComanda,
    carregarComanda,
    limparComanda,
  }), [comandaAtual, adicionarItem, removerItem, alterarQtd, setTipo, setMesa, salvarComandaAberta, fecharComanda, carregarComanda, limparComanda]);

  return <ComandaContext.Provider value={value}>{children}</ComandaContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- Preserve the provider's existing public hook API.
export function useComanda() {
  const context = useContext(ComandaContext);
  if (!context) throw new Error('useComanda precisa estar dentro de ComandaProvider');
  return context;
}
