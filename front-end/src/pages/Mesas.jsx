import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MesasDrawer from '../components/atendimento/MesasDrawer.jsx';
import { useComanda } from '../context/ComandaContext.jsx';
import { useToast } from '../components/useToast.js';

export default function Mesas() {
  const { comandaAtual, salvarComandaAberta, carregarComanda, limparComanda, setMesa, setTipo } = useComanda();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const selecionandoRef = useRef(false);
  const [selecionando, setSelecionando] = useState(false);

  const selecionar = async ({ mesa, comanda, tipoAtendimento }) => {
    if (comandaAtual.pagamentoPendente || comandaAtual.consumoInternoPendente) {
      showToast('Retome o fechamento pendente antes de trocar de comanda.', 'warning');
      navigate('/pdv');
      return;
    }
    if (selecionandoRef.current) return;
    selecionandoRef.current = true;
    setSelecionando(true);
    try {
      if (comandaAtual.itens.length) await salvarComandaAberta(comandaAtual);
      if (comanda) await carregarComanda(comanda._id);
      else {
        limparComanda();
        if (mesa) setMesa(mesa.id, mesa.numero);
        else setTipo(tipoAtendimento || 'balcao');
      }
      navigate('/pdv');
    } catch (error) {
      showToast(error.response?.data?.msg || error.message || 'Não foi possível abrir a comanda.', 'error');
    } finally {
      selecionandoRef.current = false;
      setSelecionando(false);
    }
  };

  return <main aria-busy={selecionando}>
    {selecionando && <p role="status">Abrindo atendimento...</p>}
    <MesasDrawer embedded open onSelect={selecionar} />
  </main>;
}
