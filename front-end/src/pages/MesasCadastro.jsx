import { useEffect, useMemo, useState } from 'react';
import api from '../services/api.jsx';
import { useToast } from '../components/useToast.js';

const criarMesaInicial = (numero) => ({
  id: numero,
  numero,
  nome: `Mesa ${numero}`,
  lugares: 4,
  ativa: true,
});

export default function MesasCadastro() {
  const [mesas, setMesas] = useState([]);
  const [oferecerBalcao, setOferecerBalcao] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const { showToast } = useToast();
  const quantidadeTotal = mesas.length;

  useEffect(() => {
    api.get('/mesas').then(({ data }) => {
      setMesas(data.mesas);
      setOferecerBalcao(data.oferecerBalcao);
      setCarregando(false);
    }).catch(() => showToast('Não foi possível carregar as mesas. Tente recarregar a página.', 'error'));
  }, [showToast]);

  const proximoNumero = useMemo(() => {
    return Math.max(0, ...mesas.map((mesa) => Number(mesa.numero || 0))) + 1;
  }, [mesas]);

  const adicionarMesa = () => {
    setMesas((atual) => [...atual, criarMesaInicial(proximoNumero)]);
  };

  const editarNome = (id, nome) => {
    setMesas((atual) => atual.map((mesa) => (
      mesa.id === id ? { ...mesa, nome } : mesa
    )));
  };

  const editarLugares = (id, lugares) => {
    const valor = Number(lugares || 0);
    setMesas((atual) => atual.map((mesa) => (
      mesa.id === id ? { ...mesa, lugares: Number.isFinite(valor) ? Math.max(1, valor) : 1 } : mesa
    )));
  };

  const alternarStatus = (id) => {
    setMesas((atual) => atual.map((mesa) => (
      mesa.id === id ? { ...mesa, ativa: !mesa.ativa } : mesa
    )));
  };

  const salvar = async () => {
    if (carregando || salvando) return;
    setSalvando(true);
    try {
      const { data } = await api.put('/mesas', { mesas, oferecerBalcao });
      setMesas(data.mesas);
      showToast('Configuração de mesas salva com sucesso!', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível salvar as mesas', 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Cadastro de Mesas</h1>
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)', marginBottom: 20 }}>
        <label style={{ display: 'grid', gap: 8, maxWidth: 260, fontWeight: 700, color: 'var(--text-secondary)' }}>
          Quantidade total de mesas:
          <input
            type="number"
            min="1"
            value={quantidadeTotal}
            readOnly
            style={{ minHeight: 46, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
          />
        </label>
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)', marginBottom: 20, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase' }}>
              <th style={{ padding: '10px 8px' }}>Nº</th>
              <th style={{ padding: '10px 8px' }}>Nome / Rótulo</th>
              <th style={{ padding: '10px 8px' }}>Lugares</th>
              <th style={{ padding: '10px 8px' }}>Status</th>
              <th style={{ padding: '10px 8px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {mesas.map((mesa) => (
              <tr key={mesa.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                <td style={{ padding: '12px 8px', fontWeight: 700 }}>{mesa.numero}</td>
                <td style={{ padding: '12px 8px' }}>
                  <input
                    value={mesa.nome}
                    onChange={(e) => editarNome(mesa.id, e.target.value)}
                    style={{ width: '100%', minHeight: 42, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                  />
                </td>
                <td style={{ padding: '12px 8px' }}>
                  <input
                    type="number"
                    min="1"
                    value={mesa.lugares}
                    onChange={(e) => editarLugares(mesa.id, e.target.value)}
                    style={{ width: 90, minHeight: 42, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                  />
                </td>
                <td style={{ padding: '12px 8px', fontWeight: 700, color: mesa.ativa ? 'var(--success-bg)' : 'var(--text-secondary)' }}>
                  {mesa.ativa ? '✅ Ativa' : '⚫ Inativa'}
                </td>
                <td style={{ padding: '12px 8px' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer' }}>
                      Editar
                    </button>
                    <button type="button" onClick={() => alternarStatus(mesa.id)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: mesa.ativa ? 'var(--warning-bg)' : 'var(--success-bg)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                      {mesa.ativa ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={adicionarMesa} disabled={carregando || salvando} style={{ background: 'var(--accent-primary)', color: '#fff', border: 0, borderRadius: 10, minHeight: 46, padding: '0 18px', fontWeight: 800, cursor: 'pointer', marginBottom: 16 }}>
        ➕ Adicionar Mesa
      </button>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)', marginBottom: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={oferecerBalcao} onChange={(e) => setOferecerBalcao(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)' }} />
          Quando todas as mesas estiverem ocupadas → oferecer opção Balcão
        </label>
      </div>

      <button type="button" onClick={salvar} disabled={carregando || salvando} style={{ background: 'var(--success-bg)', color: '#fff', border: 0, borderRadius: 10, minHeight: 48, padding: '0 18px', fontWeight: 800, cursor: 'pointer' }}>
        ✅ Salvar
      </button>
    </div>
  );
}
