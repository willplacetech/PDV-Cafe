import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api.jsx';
import {
  carregarConfiguracaoImpressao,
  carregarPreferenciaImpressora,
  conectarImpressora,
  desconectarImpressora,
  imprimirTeste,
  listarImpressoesPendentes,
  obterStatusImpressora,
  reimprimirPendente,
  reconectarImpressora,
  salvarConfiguracaoImpressao,
} from '../../services/impressaoService.js';
import { useToast } from '../useToast.js';

const panelStyle = { padding: 18, border: '1px solid var(--border-color)', borderRadius: 14, background: 'var(--bg-secondary)', marginBottom: 16 };
const buttonStyle = { minHeight: 42, padding: '9px 14px', border: '1px solid var(--border-color)', borderRadius: 9, cursor: 'pointer', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontWeight: 700 };

export default function ImpressoraManager() {
  const [config, setConfig] = useState(null);
  const [preference, setPreference] = useState(null);
  const [status, setStatus] = useState({ configurada: false, conectada: false });
  const [categories, setCategories] = useState([]);
  const [newSector, setNewSector] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastFailure, setLastFailure] = useState(false);
  const [pendingJobs, setPendingJobs] = useState([]);
  const [settingsError, setSettingsError] = useState('');
  const { showToast } = useToast();

  const refreshStatus = useCallback(async () => {
    const saved = carregarPreferenciaImpressora();
    setPreference(saved);
    if (saved) await reconectarImpressora();
    setStatus(obterStatusImpressora());
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const savedConfig = carregarConfiguracaoImpressao();
        if (active) setConfig(savedConfig);
      } catch (error) {
        if (active) {
          setSettingsError(error.message);
          setConfig({
            paperWidth: '80mm',
            imprimirCupomAutomaticamente: true,
            imprimirCozinhaAutomaticamente: true,
            empresa: { nome: 'SABOR DE ABRAÇO', cnpj: '', endereco: '', telefone: '' },
            setores: [{ nome: 'Cozinha', categorias: [] }],
            setorPadrao: 'Cozinha',
          });
          showToast(error.message, 'error');
        }
      }
      try {
        const savedPreference = carregarPreferenciaImpressora();
        if (active) {
          setPreference(savedPreference);
          setStatus(obterStatusImpressora());
        }
        if (savedPreference) {
          try {
            await reconectarImpressora();
            if (active) setStatus(obterStatusImpressora());
          } catch (error) {
            if (active) showToast(`Impressora salva, mas não foi possível reconectar: ${error.message}`, 'warning');
          }
        }
      } catch (error) {
        if (active) showToast(error.message, 'error');
      }
      try {
        const savedJobs = listarImpressoesPendentes();
        if (active) setPendingJobs(savedJobs);
      } catch (error) {
        if (active) showToast(error.message, 'error');
      }
      try {
        const { data } = await api.get('/products');
        const available = [...new Set((data || []).map((product) => product.categoria).filter(Boolean))].sort();
        if (active) setCategories(available);
      } catch (error) {
        if (active) showToast(error.response?.data?.msg || 'Não foi possível carregar as categorias para configurar os setores.', 'warning');
      }
    };
    void initialize();
    return () => { active = false; };
  }, [showToast]);

  useEffect(() => {
    const serial = globalThis.navigator?.serial;
    const updateStatus = () => setStatus(obterStatusImpressora());
    if (serial?.addEventListener) serial.addEventListener('disconnect', updateStatus);
    globalThis.window?.addEventListener('pdv:impressora-status', updateStatus);
    return () => {
      if (serial?.removeEventListener) serial.removeEventListener('disconnect', updateStatus);
      globalThis.window?.removeEventListener('pdv:impressora-status', updateStatus);
    };
  }, []);

  const sectors = config?.setores || [];
  const categoryOptions = useMemo(() => [...new Set([...categories, ...sectors.flatMap((sector) => sector.categorias || [])])].sort(), [categories, sectors]);

  const connect = async (type) => {
    setBusy(true);
    try {
      await conectarImpressora(type);
      await refreshStatus();
      setLastFailure(false);
      showToast('Impressora conectada e preferência salva neste dispositivo.', 'success');
    } catch (error) {
      setLastFailure(true);
      showToast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const testPrint = async () => {
    if (!config || busy) return;
    setBusy(true);
    try {
      const result = await imprimirTeste(config);
      setLastFailure(false);
      showToast(`Teste enviado pela opção ${result.method.toUpperCase()}.`, 'success');
    } catch (error) {
      setLastFailure(true);
      showToast(error.message, 'error');
    } finally {
      setBusy(false);
      setStatus(obterStatusImpressora());
    }
  };

  const save = () => {
    try {
      setConfig(salvarConfiguracaoImpressao(config));
      setSettingsError('');
      showToast('Configurações de impressão salvas neste dispositivo.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const disconnect = () => {
    try {
      desconectarImpressora();
      setPreference(null);
      setStatus(obterStatusImpressora());
      setLastFailure(false);
      showToast('Impressora desconectada.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const reprint = async (job) => {
    setBusy(true);
    try {
      await reimprimirPendente(job.id, {
        ...config,
        onFallback: (message) => showToast(message, 'warning'),
      });
      setLastFailure(false);
      showToast('Impressão pendente enviada novamente.', 'success');
    } catch (error) {
      setLastFailure(true);
      showToast(error.message || 'Não foi possível reimprimir.', 'warning');
    } finally {
      try {
        setPendingJobs(listarImpressoesPendentes());
      } catch (error) {
        showToast(error.message, 'error');
      }
      setBusy(false);
    }
  };

  const addSector = (event) => {
    event.preventDefault();
    const name = newSector.trim();
    if (!name) return showToast('Informe o nome do setor.', 'warning');
    if (sectors.some((sector) => sector.nome.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return showToast('Já existe um setor com esse nome.', 'warning');
    }
    const next = [...sectors, { nome: name, categorias: [] }];
    setConfig({ ...config, setores: next, setorPadrao: config.setorPadrao || name });
    setNewSector('');
  };

  const updateSector = (index, changes) => {
    setConfig((current) => {
      const previousName = current.setores[index].nome;
      const setores = current.setores.map((sector, currentIndex) => currentIndex === index ? { ...sector, ...changes } : sector);
      return {
        ...current,
        setores,
        setorPadrao: current.setorPadrao === previousName && typeof changes.nome === 'string' ? changes.nome : current.setorPadrao,
      };
    });
  };

  const removeSector = (index) => {
    const next = sectors.filter((_, sectorIndex) => sectorIndex !== index);
    if (!next.length) return showToast('Mantenha pelo menos um setor cadastrado.', 'warning');
    setConfig({ ...config, setores: next, setorPadrao: next.some((sector) => sector.nome === config.setorPadrao) ? config.setorPadrao : next[0].nome });
  };

  if (!config) return <p role="status">Carregando configurações da impressora…</p>;

  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>🖨️ Impressoras</h1>
          <p>Configuração local no dispositivo. A impressão funciona sem enviar dados de impressão ao servidor.</p>
        </div>
      </div>

      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Conexão</h2>
        {settingsError && <p role="alert" style={{ color: 'var(--error-text, #b91c1c)' }}>{settingsError} Os valores padrão estão apenas nesta tela. Revise e salve para substituir a configuração local inválida.</p>}
        <p style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-label={status.conectada ? 'Conectada' : 'Desconectada'} style={{ width: 12, height: 12, borderRadius: '50%', background: status.conectada ? '#16a34a' : '#dc2626' }} />
          <strong>{preference?.nome || preference?.tipo?.toUpperCase() || 'Nenhuma impressora selecionada'}</strong>
          <span>{status.conectada ? 'Conectada' : preference ? 'Desconectada ou aguardando uso' : 'Desconectada'}</span>
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" style={buttonStyle} disabled={busy} onClick={() => void connect('ble')}>Conectar Bluetooth BLE</button>
          <button type="button" style={buttonStyle} disabled={busy} onClick={() => void connect('usb')}>Conectar USB / Serial</button>
          <button type="button" style={buttonStyle} disabled={busy} onClick={() => void connect('sistema')}>Usar impressão do sistema</button>
          {preference && <button type="button" style={buttonStyle} disabled={busy} onClick={() => void connect(preference.tipo)}>Reconectar impressora</button>}
          <button type="button" style={buttonStyle} disabled={busy || !preference} onClick={() => void testPrint()}>{busy ? 'Aguarde…' : 'Imprimir teste'}</button>
          <button type="button" style={buttonStyle} disabled={busy || !preference} onClick={disconnect}>Desconectar</button>
        </div>
        {lastFailure && <p role="alert" style={{ color: 'var(--error-text, #b91c1c)' }}>Impressão pendente. Confira a conexão e reconecte a impressora antes de reimprimir.</p>}
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Fallback automático: Bluetooth BLE → USB/Serial autorizado → impressão do sistema.
          Bluetooth Clássico SPP não é suportado pela Web Bluetooth. Web Serial exige porta serial/USB-serial; impressoras USB nativas podem não ser expostas pelo navegador.
        </p>
      </section>

      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Impressões pendentes ({pendingJobs.length})</h2>
        {pendingJobs.length === 0
          ? <p>Nenhuma impressão pendente neste dispositivo.</p>
          : pendingJobs.map((job) => (
            <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border-light)', padding: '10px 0' }}>
              <span>{job.tipo} · {new Date(job.createdAt).toLocaleString('pt-BR')}</span>
              <button type="button" style={buttonStyle} disabled={busy} onClick={() => void reprint(job)}>Reimprimir</button>
            </div>
          ))}
      </section>

      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Cupom e automação</h2>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Largura do papel
          <select value={config.paperWidth} onChange={(event) => setConfig({ ...config, paperWidth: event.target.value })} style={{ display: 'block', marginTop: 5, minHeight: 40 }}>
            <option value="58mm">58 mm</option>
            <option value="80mm">80 mm</option>
          </select>
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <input type="checkbox" checked={config.imprimirCupomAutomaticamente} onChange={(event) => setConfig({ ...config, imprimirCupomAutomaticamente: event.target.checked })} /> Imprimir cupom automaticamente ao fechar a venda
        </label>
        <label style={{ display: 'block' }}>
          <input type="checkbox" checked={config.imprimirCozinhaAutomaticamente} onChange={(event) => setConfig({ ...config, imprimirCozinhaAutomaticamente: event.target.checked })} /> Imprimir pedidos de cozinha automaticamente
        </label>
        <div style={{ display: 'grid', gap: 9, marginTop: 16, maxWidth: 520 }}>
          <h3 style={{ margin: '4px 0' }}>Dados do estabelecimento no cupom</h3>
          {[
            ['nome', 'Nome do estabelecimento'],
            ['cnpj', 'CNPJ'],
            ['endereco', 'Endereço'],
            ['telefone', 'Telefone'],
          ].map(([field, label]) => (
            <label key={field}>
              {label}
              <input value={config.empresa[field]} onChange={(event) => setConfig({ ...config, empresa: { ...config.empresa, [field]: event.target.value } })} style={{ display: 'block', width: '100%', minHeight: 38, marginTop: 4, boxSizing: 'border-box' }} />
            </label>
          ))}
        </div>
      </section>

      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Setores de cozinha</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Itens são separados por setor e as observações saem destacadas. Categorias sem setor correspondente usam o setor padrão.</p>
        {sectors.map((sector, index) => (
          <div key={`${sector.nome}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(180px, 2fr) auto', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input aria-label={`Nome do setor ${index + 1}`} value={sector.nome} onChange={(event) => updateSector(index, { nome: event.target.value })} style={{ minHeight: 38 }} />
            <div aria-label={`Categorias do setor ${sector.nome}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {categoryOptions.map((category) => (
                <label key={category} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={sector.categorias.includes(category)}
                    onChange={(event) => updateSector(index, {
                      categorias: event.target.checked
                        ? [...sector.categorias, category]
                        : sector.categorias.filter((value) => value !== category),
                    })}
                  />
                  {category}
                </label>
              ))}
              {!categoryOptions.length && <span>Cadastre categorias de produtos para poder distribuí-las por setor.</span>}
            </div>
            <button type="button" style={buttonStyle} onClick={() => removeSector(index)}>Remover</button>
          </div>
        ))}
        <label style={{ display: 'block', marginBottom: 12 }}>
          Setor padrão
          <select value={config.setorPadrao} onChange={(event) => setConfig({ ...config, setorPadrao: event.target.value })} style={{ display: 'block', marginTop: 5, minHeight: 38 }}>
            {sectors.map((sector, index) => <option key={`${sector.nome}-${index}`} value={sector.nome}>{sector.nome}</option>)}
          </select>
        </label>
        <form onSubmit={addSector} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input value={newSector} onChange={(event) => setNewSector(event.target.value)} placeholder="Nome do novo setor" aria-label="Nome do novo setor" />
          <button type="submit" style={buttonStyle}>Adicionar setor</button>
        </form>
        <button type="button" style={buttonStyle} onClick={save}>Salvar configurações</button>
      </section>
    </div>
  );
}
