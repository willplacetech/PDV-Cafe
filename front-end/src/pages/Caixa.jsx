import { useCallback, useEffect, useState } from 'react';
import api from '../services/api.jsx';
import { useToast } from '../components/useToast.js';

const dinheiro = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hoje = () => new Date().toISOString().slice(0, 10);

export default function Caixa() {
  const [data, setData] = useState(hoje());
  const [turno, setTurno] = useState('principal');
  const [caixa, setCaixa] = useState(null);
  const [sistema, setSistema] = useState(null);
  const [valorContado, setValorContado] = useState('');
  const [observacao, setObservacao] = useState('');
  const [movimento, setMovimento] = useState({ tipo: 'sangria', valor: '', responsavel: '', motivo: '' });
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const { showToast } = useToast();

  const carregar = useCallback(async () => {
    try {
      const atualResponse = await api.get('/caixa/atual', { params: { data, turno } });
      let atual = atualResponse.data;
      if (!atual.fechamento) {
        const abertura = await api.post('/caixa/abrir', { data, turno });
        atual = { ...atual, fechamento: abertura.data, sistema: abertura.data.sistema, outrosMeios: abertura.data.outrosMeios };
      }
      setCaixa(atual.fechamento);
      setSistema(atual.sistema || atual.fechamento.sistema);
      const contagem = atual.fechamento.contagemFisica || {};
      const possuiContagem = contagem.valorContado !== undefined || contagem.cedulas?.length || contagem.moedas?.length;
      const valorSalvo = contagem.valorContado ?? contagem.totalDinheiro;
      setValorContado(possuiContagem ? Number(valorSalvo || 0).toFixed(2) : '');
      setObservacao(atual.fechamento.conferencia?.observacao || '');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível carregar o caixa', 'error');
    } finally { setCarregando(false); }
  }, [data, turno, showToast]);

  useEffect(() => {
    const inicializar = async () => { await carregar(); };
    inicializar();
  }, [carregar]);

  const atualizarValores = async () => {
    if (atualizando) return;
    setAtualizando(true);
    try {
      const { data: atual } = await api.get('/caixa/atual', { params: { data, turno } });
      if (!atual.fechamento) return showToast('Não há fechamento disponível para atualizar', 'warning');
      setCaixa({ ...atual.fechamento, outrosMeios: atual.outrosMeios || atual.fechamento.outrosMeios });
      setSistema(atual.sistema || atual.fechamento.sistema);
      showToast('Valores do dia atualizados', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível atualizar os valores do caixa', 'error');
    } finally { setAtualizando(false); }
  };

  const totalDinheiro = Number((Number(valorContado) || 0).toFixed(2));
  const esperado = Number(sistema?.saldoEsperado || 0);
  const diferenca = Number((totalDinheiro - esperado).toFixed(2));
  const situacao = diferenca === 0 ? 'conferido' : diferenca > 0 ? 'sobrando' : 'faltante';
  const bloqueado = caixa?.status === 'fechado';

  const contagemValida = valorContado.trim() !== '' && Number.isFinite(Number(valorContado)) && Number(valorContado) >= 0;
  const payloadContagem = { valorContado: totalDinheiro };

  const salvarParcial = async () => {
    if (bloqueado) return;
    if (!contagemValida) { showToast('Informe o valor contado', 'warning'); return; }
    setSalvando(true);
    try {
      const { data: atualizado } = await api.post(`/caixa/${caixa._id}/contagem-parcial`, payloadContagem);
      setCaixa(atualizado); showToast('Contagem parcial salva', 'success');
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível salvar a contagem', 'error'); }
    finally { setSalvando(false); }
  };

  const fecharCaixa = async () => {
    if (bloqueado) return;
    if (!contagemValida) { showToast('Informe um valor contado válido', 'warning'); return; }
    if (Math.abs(diferenca) > 5 && !observacao.trim()) {
      showToast('Diferença acima de R$ 5,00 exige justificativa', 'warning'); return;
    }
    setSalvando(true);
    try {
      const { data: fechado } = await api.post(`/caixa/${caixa._id}/fechar`, { ...payloadContagem, observacao });
      setCaixa(fechado); setSistema(fechado.sistema); showToast('Caixa fechado e bloqueado', 'success');
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível fechar o caixa', 'error'); }
    finally { setSalvando(false); }
  };

  const registrarMovimento = async (event) => {
    event.preventDefault();
    if (bloqueado) return;
    try {
      const { data: atualizado } = await api.post(`/caixa/${caixa._id}/movimentos`, movimento);
      setCaixa(atualizado); setSistema(atualizado.sistema); setMovimento({ tipo: movimento.tipo, valor: '', responsavel: '', motivo: '' }); showToast('Movimento registrado', 'success');
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível registrar o movimento', 'error'); }
  };

  if (carregando || !caixa || !sistema) return <div className="caixa-page"><section className="caixa-panel">Carregando fechamento de caixa...</section></div>;

  return (
    <div className="caixa-page">
      <header className="page-heading caixa-heading">
        <div><span className="dashboard-eyebrow">CONFERÊNCIA DIÁRIA</span><h1>Fechamento de Caixa</h1><p>Compare o esperado pelo sistema com o dinheiro físico contado.</p></div>
        <div className="caixa-filters"><label>Data<input type="date" value={data} disabled={bloqueado} onChange={(event) => setData(event.target.value)} /></label><label>Turno<input value={turno} disabled={bloqueado} onChange={(event) => setTurno(event.target.value)} /></label><button type="button" onClick={atualizarValores} disabled={atualizando} style={{ minHeight: 40, alignSelf: 'end', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 700, cursor: atualizando ? 'wait' : 'pointer' }}>{atualizando ? 'Atualizando...' : 'Atualizar valores'}</button></div>
      </header>

      <section className="caixa-panel caixa-expected">
        <div><span>Saldo anterior</span><strong>{dinheiro(sistema.saldoAnterior)}</strong></div>
        <div><span>+ Vendas em dinheiro</span><strong>{dinheiro(sistema.entradasDinheiro)}</strong></div>
        <div><span>- Sangrias</span><strong>{dinheiro((sistema.sangrias || []).reduce((total, item) => total + Number(item.valor || 0), 0))}</strong></div>
        <div><span>+ Suplementações</span><strong>{dinheiro((sistema.suplementacoes || []).reduce((total, item) => total + Number(item.valor || 0), 0))}</strong></div>
        <div className="caixa-expected-total"><span>ESPERADO</span><strong>{dinheiro(esperado)}</strong></div>
      </section>

      <section className="caixa-panel"><div className="caixa-panel-heading"><div><span className="dashboard-eyebrow">CONTAGEM FÍSICA</span><h2>Valor contado</h2></div></div><label style={{ display: 'grid', gap: 6, maxWidth: 360, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 }}>Total em dinheiro<input type="number" min="0" step="0.01" disabled={bloqueado} value={valorContado} onChange={(event) => setValorContado(event.target.value)} placeholder="0,00" style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: 10, border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--input-bg)', color: 'var(--input-text)', fontSize: 18 }} /></label></section>

      <section className={`caixa-panel caixa-conference ${situacao}`}><div><span>Esperado</span><strong>{dinheiro(esperado)}</strong></div><div><span>Contado</span><strong>{dinheiro(totalDinheiro)}</strong></div><div><span>Diferença</span><strong>{diferenca >= 0 ? '+' : ''}{dinheiro(diferenca)}</strong></div><b>{situacao === 'conferido' ? '✅ Conferido' : situacao === 'sobrando' ? '✅ Sobrando' : '⚠️ Faltante'}</b>{Math.abs(diferenca) > 5 && <label className="caixa-observacao">⚠️ Diferença acima de R$ 5,00 — justifique<input disabled={bloqueado} value={observacao} onChange={(event) => setObservacao(event.target.value)} placeholder="Informe o motivo" /></label>}</section>

      {!bloqueado && <><section className="caixa-panel"><div className="caixa-panel-heading"><div><span className="dashboard-eyebrow">MOVIMENTAÇÃO</span><h2>Sangria ou suplementação</h2></div></div><form className="caixa-movement-form" onSubmit={registrarMovimento}><select value={movimento.tipo} onChange={(event) => setMovimento({ ...movimento, tipo: event.target.value })}><option value="sangria">Sangria</option><option value="suplementacao">Suplementação</option></select><input type="number" min="0.01" step="0.01" placeholder="Valor" value={movimento.valor} onChange={(event) => setMovimento({ ...movimento, valor: event.target.value })} required /><input placeholder="Responsável" value={movimento.responsavel} onChange={(event) => setMovimento({ ...movimento, responsavel: event.target.value })} required /><input placeholder="Motivo" value={movimento.motivo} onChange={(event) => setMovimento({ ...movimento, motivo: event.target.value })} required /><button type="submit">Registrar</button></form></section><div className="caixa-actions"><button type="button" onClick={salvarParcial} disabled={salvando}>Salvar Parcial</button><button type="button" onClick={fecharCaixa} disabled={salvando}>Confirmar Fechamento</button></div></>}
      {bloqueado && <div className="caixa-locked">🔒 Fechamento realizado em {new Date(caixa.conferencia?.conferidoEm || caixa.updatedAt).toLocaleString('pt-BR')}. Este registro está bloqueado para edição.</div>}

      <section className="caixa-panel caixa-other">
        <h2>Resumo por meio de pagamento</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 12 }}>
          {[
            ['Entradas em dinheiro', dinheiro(sistema.entradasDinheiro)],
            ['Dinheiro esperado', dinheiro(esperado)],
            ['Dinheiro contado', dinheiro(totalDinheiro)],
            ['Pix', dinheiro(caixa.outrosMeios?.pix)],
            ['Cartão de crédito (bruto)', dinheiro(caixa.outrosMeios?.credito)],
            ['Taxa do crédito', dinheiro(caixa.outrosMeios?.taxaCredito)],
            ['Crédito líquido', dinheiro(caixa.outrosMeios?.liquidoCredito)],
            ['Cartão de débito (bruto)', dinheiro(caixa.outrosMeios?.debito)],
            ['Taxa do débito', dinheiro(caixa.outrosMeios?.taxaDebito)],
            ['Débito líquido', dinheiro(caixa.outrosMeios?.liquidoDebito)],
            ['Crédito na loja (não recebido)', dinheiro(caixa.outrosMeios?.creditoLoja)],
            ['Total recebido (bruto)', dinheiro(Number(sistema.entradasDinheiro || 0) + Number(caixa.outrosMeios?.total || 0))],
            ['Total recebido líquido', dinheiro(Number(sistema.entradasDinheiro || 0) + Number(caixa.outrosMeios?.totalLiquido || 0))],
          ].map(([rotulo, valor]) => <div key={rotulo} style={{ display: 'grid', gap: 5, paddingTop: 8, borderTop: '1px solid var(--border-light)' }}><span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{rotulo}</span><strong>{valor}</strong></div>)}
        </div>
      </section>
      <style>{`.caixa-page{max-width:1180px;margin:0 auto}.caixa-heading{display:flex;justify-content:space-between;gap:20px;align-items:end}.caixa-filters{display:flex;gap:10px}.caixa-filters label{display:grid;gap:5px;font-size:12px;font-weight:700}.caixa-filters input{min-height:40px;padding:8px;border:1px solid var(--border-color);border-radius:8px;background:var(--input-bg);color:var(--input-text)}.caixa-panel{background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:14px;padding:18px;margin-bottom:16px}.caixa-expected{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.caixa-expected div,.caixa-conference div{display:grid;gap:5px}.caixa-expected span,.caixa-conference span{font-size:12px;color:var(--text-secondary)}.caixa-expected strong,.caixa-conference strong{font-size:18px}.caixa-expected-total{border-left:3px solid var(--accent-primary);padding-left:14px}.caixa-expected-total strong{font-size:24px;color:var(--accent-primary)}.caixa-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.caixa-panel-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.caixa-panel-heading h2,.caixa-other h2{margin:3px 0 0;font-size:18px}.caixa-denomination{display:grid;grid-template-columns:1fr 100px 1fr;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--border-light)}.caixa-denomination input{width:100%;box-sizing:border-box;min-height:38px;padding:7px;border:1px solid var(--border-color);border-radius:7px;background:var(--input-bg);color:var(--input-text)}.caixa-denomination strong{text-align:right}.caixa-conference{display:grid;grid-template-columns:repeat(3,1fr) auto;gap:18px;align-items:center}.caixa-conference.sobrando{border-color:var(--success-bg)}.caixa-conference.faltante{border-color:var(--error-bg)}.caixa-conference>b{font-size:14px}.caixa-observacao{grid-column:1/-1;display:grid;gap:7px;color:var(--warning-bg);font-weight:700;font-size:13px}.caixa-observacao input{min-height:42px;padding:8px;border:1px solid var(--warning-bg);border-radius:8px;background:var(--input-bg);color:var(--input-text)}.caixa-movement-form{display:grid;grid-template-columns:150px 130px 1fr 1fr auto;gap:8px}.caixa-movement-form input,.caixa-movement-form select{min-height:40px;padding:8px;border:1px solid var(--border-color);border-radius:8px;background:var(--input-bg);color:var(--input-text)}.caixa-movement-form button,.caixa-actions button{min-height:42px;padding:8px 16px;border:0;border-radius:8px;background:var(--accent-primary);color:#fff;font-weight:700;cursor:pointer}.caixa-actions{display:flex;justify-content:flex-end;gap:10px;margin-bottom:16px}.caixa-actions button:first-child{background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color)}.caixa-locked{padding:14px;margin-bottom:16px;border-radius:10px;background:var(--bg-tertiary);color:var(--text-secondary);font-weight:700}.caixa-other>div{display:grid;grid-template-columns:repeat(4,auto);gap:10px 18px;align-items:center}.caixa-other span{color:var(--text-secondary)}@media(max-width:760px){.caixa-heading{display:grid}.caixa-filters{display:grid;grid-template-columns:1fr 1fr}.caixa-expected,.caixa-grid{grid-template-columns:1fr}.caixa-expected-total{border-left:0;border-top:3px solid var(--accent-primary);padding:12px 0 0}.caixa-conference{grid-template-columns:1fr 1fr}.caixa-conference>b,.caixa-observacao{grid-column:1/-1}.caixa-movement-form{grid-template-columns:1fr 1fr}.caixa-movement-form input:last-of-type,.caixa-movement-form button{grid-column:1/-1}.caixa-other>div{grid-template-columns:1fr 1fr}}`}</style>
    </div>
  );
}
