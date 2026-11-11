import FieldLabel from '../components/FieldLabel.jsx';
import { useState, useEffect, useCallback, useContext } from 'react';
import api from '../services/api.jsx';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { requestAutorizado } from '../services/apiAutorizada.js';
import { useAutorizacaoGerente } from '../hooks/useAutorizacaoGerente.jsx';
import { useToast } from '../components/useToast.js';
import EstadoLista from '../components/EstadoLista.jsx';
import ConfirmarAcao from '../components/ConfirmarAcao.jsx';
import AreaTabs from '../components/AreaTabs.jsx';
import { criarXmlClientes } from '../utils/customersXml.js';
import { exportarCSV, colunasCSV, dataArquivoCSV } from '../utils/exportarCsv.js';
import { calcularMultiplicadorFidelidade } from '../utils/fidelidade.js';
import { parseNumericValue } from '../utils/numeric.js';
import Paginacao from '../components/Paginacao.jsx';
import useUrlPagination from '../hooks/useUrlPagination.js';

const aplicarMascaraTelefone = (valor) => {
  if (!valor) return '';
  const apenasNumeros = valor.replace(/\D/g, '');
  if (apenasNumeros.length <= 2) return apenasNumeros.replace(/^(\d{0,2})/, '($1');
  if (apenasNumeros.length <= 7) return apenasNumeros.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
  return apenasNumeros.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
};

const aplicarMascaraCPF = (valor) => {
  if (!valor) return '';
  const apenasNumeros = valor.replace(/\D/g, '');
  if (apenasNumeros.length <= 3) return apenasNumeros;
  if (apenasNumeros.length <= 6) return apenasNumeros.replace(/^(\d{3})(\d{0,3})/, '$1.$2');
  if (apenasNumeros.length <= 9) return apenasNumeros.replace(/^(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
  return apenasNumeros.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
};

const aplicarMascaraData = (valor) => {
  if (!valor) return '';
  const apenasNumeros = valor.replace(/\D/g, '').slice(0, 8);
  if (apenasNumeros.length <= 2) return apenasNumeros;
  if (apenasNumeros.length <= 4) return apenasNumeros.replace(/^(\d{2})(\d{0,2})/, '$1/$2');
  return apenasNumeros.replace(/^(\d{2})(\d{2})(\d{0,4})/, '$1/$2/$3');
};

export default function Customers() {
  const { user } = useContext(AuthContext);
  const canEdit = user?.role === 'admin';
  const [clientes, setClientes] = useState([]);
  const [totalClientes, setTotalClientes] = useState(0);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState('');
  const paginacao = useUrlPagination();
  const { paginaAtual, limiteAtual } = paginacao;
  const [form, setForm] = useState({ nome: '', telefone: '', endereco: '', enderecoEntrega: { rua: '', numero: '', bairro: '', complemento: '', referencia: '' }, cpf: '', aniversario: '', cafesFidelidade: '0' });
  const [editing, setEditing] = useState(null);
  const { showToast } = useToast();
  const { solicitar: solicitarExcluir, renderizarModal: renderizarAutorizacaoExcluir } = useAutorizacaoGerente('excluir_cliente');

  const carregar = useCallback(async () => {
    setCarregandoLista(true);
    setErroLista('');
    try {
      const res = await api.get('/customers', { params: { pagina: paginaAtual, limite: limiteAtual } });
      setClientes(Array.isArray(res.data) ? res.data : res.data.dados);
      setTotalClientes(Array.isArray(res.data) ? res.data.length : res.data.total);
    } catch (error) {
      setErroLista(error.response?.data?.msg || error.message || 'Não foi possível carregar clientes.');
    } finally {
      setCarregandoLista(false);
    }
  }, [paginaAtual, limiteAtual]);
  useEffect(() => {
    const carregarInicial = async () => { await carregar(); };
    carregarInicial();
  }, [carregar]);

  const cpfJaExiste = (cpf, idEdicao = null) => {
    const cpfLimpo = String(cpf).replace(/\D/g, '');
    return clientes.some(c =>
      String(c.cpf || '').replace(/\D/g, '') === cpfLimpo && c._id !== idEdicao
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    const telefoneLimpo = form.telefone.replace(/\D/g, '');
    const cpfLimpo = form.cpf.replace(/\D/g, '');
    if (!form.nome.trim()) return showToast('⚠️ Nome é obrigatório!', 'warning');
    if (telefoneLimpo.length !== 11) return showToast('⚠️ Telefone inválido! Digite com DDD e 9 dígitos', 'warning');
    if (cpfLimpo && cpfLimpo.length !== 11) return showToast('⚠️ CPF inválido! Digite os 11 números ou deixe em branco', 'warning');
    if (cpfLimpo && cpfJaExiste(cpfLimpo, editing?._id)) return showToast('⚠️ Este CPF já está cadastrado!', 'warning');
    const cafesFidelidade = parseNumericValue(form.cafesFidelidade, Number.NaN);
    if (editing && (!Number.isSafeInteger(cafesFidelidade) || cafesFidelidade < 0)) {
      return showToast('⚠️ Informe um total histórico de comandas inteiro e não negativo', 'warning');
    }
    const telefoneJaExiste = clientes.some(c =>
      String(c.telefone || '').replace(/\D/g, '') === telefoneLimpo && c._id !== editing?._id
    );
    if (telefoneJaExiste) return;

    const dadosParaEnviar = {
      nome: form.nome.trim(),
      telefone: telefoneLimpo,
      enderecoEntrega: form.enderecoEntrega,
      cpf: cpfLimpo,
      aniversario: form.aniversario.replace(/\D/g, '').length === 8 ? form.aniversario : '',
      ...(editing ? { cafesFidelidade } : {}),
    };

    try {
      editing
        ? await api.put(`/customers/${editing._id}`, dadosParaEnviar)
        : await api.post('/customers', dadosParaEnviar);
      showToast(editing ? '✅ Cliente atualizado!' : '✅ Cliente cadastrado!', 'success');
      setForm({ nome: '', telefone: '', endereco: '', enderecoEntrega: { rua: '', numero: '', bairro: '', complemento: '', referencia: '' }, cpf: '', aniversario: '', cafesFidelidade: '0' });
      setEditing(null);
      await carregar();
    } catch (err) {
      showToast(err.response?.data?.msg || '❌ Erro ao salvar', 'error');
    }
  };

  const alterar = (c) => {
    setEditing(c);
    setForm({
      nome: c.nome,
      telefone: aplicarMascaraTelefone(c.telefone || ''),
      endereco: c.endereco || '',
      enderecoEntrega: { rua: '', numero: '', bairro: '', complemento: '', referencia: '', ...(c.enderecoEntrega || {}) },
      aniversario: aplicarMascaraData(c.aniversario || ''),
      cpf: aplicarMascaraCPF(c.cpf || ''),
      cafesFidelidade: String(c.cafesFidelidade || 0),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remover = async (id) => {
    try {
      await requestAutorizado('delete', `/customers/${id}`, null, 'excluir_cliente', solicitarExcluir);
      showToast('Cliente removido', 'success');
      carregar();
    } catch (err) {
      showToast(err.response?.data?.msg || 'Erro ao excluir cliente', 'error');
    }
  };

  const clientesParaExportacao = async () => {
    const resposta = await api.get('/customers');
    return Array.isArray(resposta.data) ? resposta.data : resposta.data.dados;
  };

  const exportarXml = async () => {
    try {
      const xml = criarXmlClientes(await clientesParaExportacao());
      const arquivo = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement('a');
      link.href = url;
      link.download = `clientes-${new Date().toISOString().slice(0, 10)}.xml`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível exportar os clientes.', 'error');
    }
  };

  const exportarCsv = async () => {
    try {
      exportarCSV(await clientesParaExportacao(), colunasCSV.clientes, `clientes_${dataArquivoCSV()}.csv`);
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível exportar os clientes.', 'error');
    }
  };

  const handleTelefoneChange = (e) => {
    const valor = e.target.value.replace(/\D/g, '').slice(0, 11);
    setForm({ ...form, telefone: aplicarMascaraTelefone(valor) });
  };

  const handleCpfChange = (e) => {
    const valor = e.target.value.replace(/\D/g, '').slice(0, 11);
    setForm({ ...form, cpf: aplicarMascaraCPF(valor) });
  };

  const focarCadastro = () => {
    const campoNome = document.querySelector('#customer-form input[placeholder="Nome completo"]');
    campoNome?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    campoNome?.focus({ preventScroll: true });
  };

  return (
    <div>
      {renderizarAutorizacaoExcluir()}
      <AreaTabs area="pessoas" />
      <div className="page-heading">
        <div>
          <h1>👤 Cadastro de Clientes</h1>
          <p>Gerencie sua base de clientes</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={exportarCsv}>Exportar CSV</button>
      </div>

      {canEdit && <div className="ui-card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px', color: 'var(--text-primary)' }}>
          {editing ? '✏️ Editar Cliente' : '➕ Novo Cliente'}
        </h3>
        <form id="customer-form" onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }} className="form-grid-cli">
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, display: 'block' }}><FieldLabel hint={<> (obrigatório) </>}> Nome * </FieldLabel></label>
              <input placeholder="Nome completo" value={form.nome} required onChange={e => setForm({ ...form, nome: e.target.value })} className="input-field" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, display: 'block' }}><FieldLabel hint={<> (obrigatório) </>}> Telefone * </FieldLabel></label>
              <input placeholder="(11) 99999-9999" value={form.telefone} onChange={handleTelefoneChange} className="input-field" required />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, display: 'block' }}><FieldLabel hint={<> (opcional/único) </>}> CPF </FieldLabel></label>
              <input placeholder="000.000.000-00" value={form.cpf} onChange={handleCpfChange} className="input-field" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, display: 'block' }}><FieldLabel hint={<> (opcional) </>}> Aniversário </FieldLabel></label>
              <input placeholder="DD/MM/AAAA" value={form.aniversario} onChange={e => setForm({ ...form, aniversario: aplicarMascaraData(e.target.value) })} className="input-field" />
            </div>
            {editing && <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, display: 'block' }}><FieldLabel hint={<> Cada 10 comandas completam um multiplicador. </>}> Histórico de comandas da fidelidade </FieldLabel></label>
              <input type="number" min="0" step="1" inputMode="numeric" required value={form.cafesFidelidade} onChange={event => setForm({ ...form, cafesFidelidade: event.target.value })} className="input-field" />
            </div>}
          </div>
          <fieldset style={{ marginTop: 14, padding: 12, border: '1px solid var(--border-color)', borderRadius: 10 }}>
            <legend style={{ padding: '0 6px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Endereço de entrega cadastrado</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {[
                ['rua', 'Rua / Avenida'],
                ['numero', 'Número'],
                ['bairro', 'Bairro'],
                ['complemento', 'Complemento'],
                ['referencia', 'Ponto de referência'],
              ].map(([campo, label]) => (
                <label key={campo} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {label}
                  <input
                    value={form.enderecoEntrega[campo]}
                    onChange={event => setForm(atual => ({ ...atual, enderecoEntrega: { ...atual.enderecoEntrega, [campo]: event.target.value } }))}
                    maxLength={campo === 'rua' ? 300 : campo === 'numero' ? 30 : campo === 'bairro' ? 120 : 200}
                    className="input-field"
                    style={{ display: 'block', marginTop: 5 }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{editing ? '🔒 Atualizar' : 'Cadastrar'}</button>
            {editing && <button type="button" className="btn btn-secondary" onClick={() => {
              setEditing(null);
              setForm({ nome: '', telefone: '', endereco: '', enderecoEntrega: { rua: '', numero: '', bairro: '', complemento: '', referencia: '' }, cpf: '', aniversario: '', cafesFidelidade: '0' });
            }}>Cancelar</button>}
          </div>
        </form>
      </div>}

      <div className="ui-card">
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Cadastrados
            <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success-bg)', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
              {totalClientes}
            </span>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportarXml} aria-label="Exportar lista de clientes em XML">
            Exportar XML
          </button>
        </h3>
        <div style={{ overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                {['Nome', 'Telefone', 'CPF', 'Aniv.', 'Fidelidade', ...(canEdit ? ['Ações'] : [])].map(h => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregandoLista || erroLista || clientes.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 6 : 5}>
                    <EstadoLista
                      carregando={carregandoLista}
                      erro={erroLista}
                      vazio={clientes.length === 0}
                      tituloVazio="Nenhum cliente cadastrado"
                      mensagemVazia="Cadastre o primeiro cliente para manter sua base organizada."
                      acaoVaziaTexto={canEdit ? 'Cadastrar primeiro cliente' : undefined}
                      onAcaoVazia={canEdit ? focarCadastro : undefined}
                      onRetry={() => { void carregar(); }}
                    />
                  </td>
                </tr>
              ) : clientes.map(c => (
                <tr key={c._id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600, fontSize: 13 }}>{c.nome}{c.clienteInterno && <small style={{ display: 'block', fontWeight: 400 }}>Consumo da equipe · sem pagamento</small>}</td>
                  <td style={{ padding: '10px 8px', fontSize: 13, fontFamily: 'monospace' }}>{aplicarMascaraTelefone(c.telefone) || '-'}</td>
                  <td style={{ padding: '10px 8px', fontSize: 13, fontFamily: 'monospace' }}>{aplicarMascaraCPF(c.cpf) || '-'}</td>
                  <td style={{ padding: '10px 8px', fontSize: 13, fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{c.aniversario || '-'}</td>
                  <td style={{ padding: '10px 8px', fontSize: 13, whiteSpace: 'nowrap' }}>{c.clienteInterno ? '-' : <>{c.cafesFidelidade || 0} comandas · x{calcularMultiplicadorFidelidade(c.cafesFidelidade)}</>}</td>
                  {canEdit && <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {c.clienteInterno ? <span>Cliente do sistema</span> : <>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => alterar(c)}>Editar</button>
                      <ConfirmarAcao titulo="Excluir cliente" mensagem="Excluir este cliente?" acaoTexto="Excluir" onConfirmar={() => remover(c._id)}>
                        {({ onClick }) => <button type="button" className="btn btn-danger btn-sm" onClick={onClick}>🔒 Excluir</button>}
                      </ConfirmarAcao>
                    </>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacao total={totalClientes} paginaAtual={paginaAtual} limiteAtual={limiteAtual} onChangePagina={paginacao.alterarPagina} onChangeLimite={paginacao.alterarLimite} />
      </div>

      <style>{`
        @media (min-width: 640px) {
          .form-grid-cli { grid-template-columns: 1fr 1fr !important; }
        }
        @media (min-width: 1024px) {
          .form-grid-cli { grid-template-columns: 2fr 1fr 1fr 2fr !important; }
        }
      `}</style>
    </div>
  );
}
