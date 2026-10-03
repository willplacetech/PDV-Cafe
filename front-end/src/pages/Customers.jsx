import { useState, useEffect } from 'react';
import api from '../services/api.jsx';
import { useToast } from '../components/useToast.js';
import AreaTabs from '../components/AreaTabs.jsx';

// 🎯 Máscaras
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
  const [clientes, setClientes] = useState([]);
  const [form, setForm] = useState({ nome: '', telefone: '', endereco: '', cpf: '', aniversario: '' });
  const [editing, setEditing] = useState(null);
  const { showToast } = useToast();


  const carregar = async () => {
    const res = await api.get('/customers');
    setClientes(res.data);
  };
  useEffect(() => {
    const carregarInicial = async () => { await carregar(); };
    carregarInicial();
  }, []);

  // 🔒 Verifica duplicidade de CPF
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

    // ✅ Validações obrigatórias
    if (!form.nome.trim()) {
      return showToast('⚠️ Nome é obrigatório!', 'warning');
    }
    if (telefoneLimpo.length !== 11) {
      return showToast('⚠️ Telefone inválido! Digite com DDD e 9 dígitos', 'warning');
    }
    // 🔒 Verifica duplicidade de CPF
    if (cpfLimpo && cpfLimpo.length !== 11) {
      return showToast('⚠️ CPF inválido! Digite os 11 números ou deixe em branco', 'warning');
    }
    if (cpfLimpo && cpfJaExiste(cpfLimpo, editing?._id)) {
      return showToast('⚠️ Este CPF já está cadastrado!', 'warning');
    }
    const telefoneJaExiste = clientes.some(c =>
      String(c.telefone || '').replace(/\D/g, '') === telefoneLimpo && c._id !== editing?._id
    );
    if (telefoneJaExiste) return;

    const dadosParaEnviar = {
      nome: form.nome.trim(),
      telefone: telefoneLimpo,
      cpf: cpfLimpo,
      aniversario: form.aniversario.replace(/\D/g, '').length === 8 ? form.aniversario : '',
    };

    try {
      editing 
        ? await api.put(`/customers/${editing._id}`, dadosParaEnviar) 
        : await api.post('/customers', dadosParaEnviar);
      
      showToast(editing ? '✅ Cliente atualizado!' : '✅ Cliente cadastrado!', 'success');
               setForm({ nome: '', telefone: '', endereco: '', cpf: '', aniversario: '' }); 
      setEditing(null);
      carregar();
    } catch {
      showToast('❌ Erro ao salvar', 'error');
    }
  };


  const alterar = (c) => {
    setEditing(c);
    setForm({ 
      nome: c.nome, 
      telefone: aplicarMascaraTelefone(c.telefone || ''), 
      endereco: c.endereco || '',
      aniversario: aplicarMascaraData(c.aniversario || ''),
      cpf: aplicarMascaraCPF(c.cpf || '') 
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };


  const remover = async (id) => {
    if (!window.confirm('Excluir este cliente?')) return;
    try {
      await api.delete(`/customers/${id}`);
      showToast('Cliente removido', 'warning');
      carregar();
    } catch (err) {
      showToast(err.response?.data?.msg || 'Erro ao excluir cliente', 'error');
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


  return (
    <div>
      <AreaTabs area="pessoas" />
      <div className="page-heading">
        <div>
          <h1>👤 Cadastro de Clientes</h1>
          <p>Gerencie sua base de clientes</p>
        </div>
      </div>


      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: 16, padding: 16, marginBottom: 16
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px', color: 'var(--text-primary)' }}>
          {editing ? '✏️ Editar Cliente' : '➕ Novo Cliente'}
        </h3>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }} className="form-grid-cli">
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, display: 'block' }}>
                Nome * <span style={{ color: 'var(--error-bg)', fontSize: 10 }}>(obrigatório)</span>
              </label>
              <input 
                placeholder="Nome completo" 
                value={form.nome} 
                required
                onChange={e => setForm({ ...form, nome: e.target.value })}
                style={inputStyle} 
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, display: 'block' }}>
                Telefone * <span style={{ color: 'var(--error-bg)', fontSize: 10 }}>(obrigatório)</span>
              </label>
              <input 
                placeholder="(11) 99999-9999" 
                value={form.telefone}
                onChange={handleTelefoneChange}
                style={inputStyle} 
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, display: 'block' }}>
                CPF <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>(opcional/único)</span>
              </label>
              <input 
                placeholder="000.000.000-00" 
                value={form.cpf}
                onChange={handleCpfChange}
                style={inputStyle} 
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, display: 'block' }}>
                Aniversário <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>(opcional)</span>
              </label>
              <input 
                placeholder="DD/MM/AAAA" 
                value={form.aniversario}
                onChange={e => setForm({ ...form, aniversario: aplicarMascaraData(e.target.value) })}
                style={inputStyle} 
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" style={{
              flex: 1, padding: '12px', background: 'var(--accent-primary)', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
              cursor: 'pointer', minHeight: 46
            }}>{editing ? 'Atualizar' : 'Cadastrar'}</button>
            {editing && <button type="button" onClick={() => { 
              setEditing(null); 
      setForm({ nome: '', telefone: '', endereco: '', cpf: '', aniversario: '' });
            }} style={{
              padding: '12px 20px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
              border: '1.5px solid var(--border-color)', borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 46
            }}>Cancelar</button>}
          </div>
        </form>
      </div>


      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: 16, padding: 16
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          Cadastrados
          <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success-bg)', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
            {clientes.length}
          </span>
        </h3>
        <div style={{ overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                {['Nome', 'Telefone', 'CPF', 'Aniv.', 'Ações'].map(h => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum cliente cadastrado</td></tr>
              ) : clientes.map(c => (
                <tr key={c._id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600, fontSize: 13 }}>{c.nome}</td>
                  <td style={{ padding: '10px 8px', fontSize: 13, fontFamily: 'monospace' }}>
                    {aplicarMascaraTelefone(c.telefone) || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', fontSize: 13, fontFamily: 'monospace' }}>
                    {aplicarMascaraCPF(c.cpf) || '-'}
                  </td>
                   <td style={{ padding: '10px 8px', fontSize: 13, fontFamily: 'monospace', color: 'var(--accent-primary)' }}>
                     {c.aniversario || '-'}
                   </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => alterar(c)} style={btnTable}>Editar</button>
                    <button onClick={() => remover(c._id)} style={{ ...btnTable, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error-bg)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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


const inputStyle = {
  width: '100%', padding: '12px 14px', border: '1.5px solid var(--border-color)',
  borderRadius: 10, fontSize: 16, boxSizing: 'border-box',
  outline: 'none', background: 'var(--input-bg)', color: 'var(--input-text)', minHeight: 48
};


const btnTable = {
  padding: '6px 12px', margin: '0 3px', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
  border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12,
  fontWeight: 600, cursor: 'pointer', minHeight: 34
};
