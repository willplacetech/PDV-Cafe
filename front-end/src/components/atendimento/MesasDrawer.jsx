import { useEffect, useState } from 'react';
import api from '../../services/api.jsx';

const formatMoney = value => `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MesasDrawer({ open, onClose, onSelect, embedded = false }) {
  const [mesas, setMesas] = useState([]);
  const [comandas, setComandas] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return undefined;
    let ativo = true;
    const loadingTimer = window.setTimeout(() => setCarregando(true), 0);
    const carregar = (silencioso = false) => Promise.all([api.get('/mesas', { pdvSilenciosa: silencioso }), api.get('/comandas?status=aberta', { pdvSilenciosa: silencioso })])
      .then(([mesasResponse, comandasResponse]) => {
        if (!ativo) return;
        const dadosMesas = Array.isArray(mesasResponse.data) ? mesasResponse.data : mesasResponse.data.mesas || [];
        setMesas(dadosMesas.filter(mesa => mesa.ativa !== false));
        setComandas(comandasResponse.data || []);
        setErro('');
        setAgora(Date.now());
      })
      .catch(error => {
        if (ativo) setErro(error.response?.data?.msg || 'Não foi possível carregar as mesas e comandas.');
      })
      .finally(() => { window.clearTimeout(loadingTimer); if (ativo) setCarregando(false); });
    void carregar();
    const intervalo = embedded ? window.setInterval(() => { void carregar(true); }, 30000) : null;
    return () => { ativo = false; window.clearTimeout(loadingTimer); window.clearInterval(intervalo); };
  }, [open, embedded]);

  if (!open) return null;
  const comandaDaMesa = mesa => comandas.find(comanda => String(comanda.mesa) === String(mesa.numero) && comanda.tipoAtendimento === 'mesa');
  const selecionarMesa = mesa => onSelect({ mesa, comanda: comandaDaMesa(mesa) });
  const selecionarTipo = tipoAtendimento => onSelect({ tipoAtendimento });

  return (
    <div className={`mesas-drawer-overlay ${embedded ? 'mesas-overview' : ''}`}  onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <aside className="mesas-drawer" role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby="mesas-drawer-title">
        <header className="mesas-drawer-header">
          <div><span className="mesas-drawer-eyebrow">ATENDIMENTO</span><h2 id="mesas-drawer-title">Mesas e comandas</h2>{embedded && <p>Consulte totais e tempos. Selecione uma mesa ou comanda para atender no PDV.</p>}</div>
          {!embedded && <button type="button" onClick={onClose} aria-label="Fechar mesas e comandas">×</button>}
        </header>
        <div className="mesas-drawer-content">
          {erro && <p role="alert" className="mesas-drawer-error">{erro}</p>}
          {carregando ? <p role="status">Carregando mesas...</p> : <>
            <div className="mesas-drawer-types">
              <button type="button" onClick={() => selecionarTipo('balcao')}>Balcão</button>
              <button type="button" onClick={() => selecionarTipo('retirada')}>Retirada</button>
              <button type="button" onClick={() => selecionarTipo('delivery')}>Delivery</button>
            </div>
            <h3>Mesas</h3>
            <div className="mesas-drawer-grid">
              {mesas.map(mesa => {
                const comanda = comandaDaMesa(mesa);
                const quantidadeItens = comanda?.itens?.reduce((soma, item) => soma + Number(item.quantidade || 0), 0) || 0;
                const minutosAberta = comanda?.createdAt ? Math.max(0, Math.floor((agora - new Date(comanda.createdAt).getTime()) / 60000)) : null;
                return <button key={mesa.id} type="button" className={`mesas-drawer-table ${comanda ? 'occupied' : 'free'}`} onClick={() => selecionarMesa(mesa)}>
                  <strong>{mesa.nome || `Mesa ${mesa.numero}`}</strong>
                  <span>{comanda ? 'Ocupada' : 'Livre'} · {formatMoney(comanda?.valorTotal)}</span>
                  <small>{quantidadeItens} {quantidadeItens === 1 ? 'item' : 'itens'}{comanda?.numero ? ` · Comanda #${comanda.numero}` : ''}{minutosAberta !== null ? ` · ${minutosAberta} min` : ''}</small>
                </button>;
              })}
            </div>
            <h3>Comandas abertas</h3>
            <div className="mesas-drawer-orders">
              {comandas.length ? comandas.map(comanda => <button key={comanda._id} type="button" onClick={() => onSelect({ comanda })}>
                <span><strong>#{comanda.numero}</strong> · {comanda.clienteNome || (comanda.tipoAtendimento === 'mesa' ? `Mesa ${comanda.mesa}` : comanda.tipoAtendimento)}</span>
                <small>{(comanda.itens || []).reduce((soma, item) => soma + Number(item.quantidade || 0), 0)} itens · {formatMoney(comanda.valorTotal)}</small>
              </button>) : <p>Nenhuma comanda aberta.</p>}
            </div>
          </>}
        </div>
      </aside>
      <style>{`
        .mesas-drawer-overlay{position:fixed;inset:0;z-index:10000;background:rgba(22,15,10,.48);display:flex;justify-content:flex-end}
        .mesas-drawer{width:min(480px,100%);height:100%;overflow:auto;background:var(--bg-secondary);color:var(--text-primary);box-shadow:var(--shadow-lg);animation:mesas-drawer-in .2s ease-out}
        .mesas-drawer-header{position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid var(--border-color);background:var(--bg-secondary)}
        .mesas-drawer-header h2{margin:4px 0 0;font-size:21px}.mesas-drawer-eyebrow{font-size:10px;font-weight:800;letter-spacing:.1em;color:var(--accent-primary)}
        .mesas-drawer-header button{border:0;background:transparent;color:var(--text-primary);font-size:30px;cursor:pointer}
        .mesas-drawer-content{padding:18px}.mesas-drawer-content h3{margin:22px 0 10px;font-size:15px}
        .mesas-drawer-types{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mesas-drawer-types button,.mesas-drawer-orders button{border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);padding:12px;font:inherit;font-weight:700;cursor:pointer}
        .mesas-drawer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .mesas-drawer-table{display:grid;gap:5px;text-align:left;padding:14px;border:1px solid;border-radius:12px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer}
        .mesas-drawer-table.free{border-color:var(--success-bg)}.mesas-drawer-table.occupied{border-color:var(--warning-bg)}
        .mesas-drawer-table span,.mesas-drawer-table small,.mesas-drawer-orders small{color:var(--text-secondary);font-size:11px}
        .mesas-drawer-orders{display:grid;gap:8px}.mesas-drawer-orders button{display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left}
        .mesas-drawer-orders p,.mesas-drawer-content>p{color:var(--text-secondary);font-size:13px}.mesas-drawer-error{color:var(--danger-bg)}
        .mesas-overview{position:static;display:block;background:transparent;z-index:auto}.mesas-overview .mesas-drawer{width:100%;height:auto;overflow:visible;animation:none;border:1px solid var(--border-color);border-radius:16px;box-shadow:var(--shadow-sm)}.mesas-overview .mesas-drawer-header{position:static;border-radius:16px 16px 0 0}.mesas-overview .mesas-drawer-header p{font-size:13px;color:var(--text-secondary)}.mesas-overview .mesas-drawer-grid{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
        @keyframes mesas-drawer-in{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @media(max-width:600px){.mesas-drawer{width:100%}}
      `}</style>
    </div>
  );
}
