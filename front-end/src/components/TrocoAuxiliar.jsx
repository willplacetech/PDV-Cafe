import { useContext, useState, useEffect } from 'react';

const formatMoney = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const parseValor = (texto) => { const limpo = String(texto ?? '').replace(/[^\d,.-]/g, '').replace(',', '.'); const n = Number(limpo); return Number.isFinite(n) ? n : 0; };

export default function TrocoAuxiliar({ totalAPagar, formaPagamento, valorRecebido: valorControlado, onChangeValorRecebido }) {
  const [interno, setInterno] = useState('');
  const controlado = valorControlado !== undefined;
  const recebidoTexto = controlado ? String(valorControlado ?? '') : interno;

  if (formaPagamento !== 'dinheiro') return null;
  const total = Math.max(0, Number(totalAPagar) || 0);
  const valorRecebido = parseValor(recebidoTexto);
  const troco = valorRecebido - total;
  const temEntrada = String(recebidoTexto).trim() !== '';
  const setRecebido = (valor) => { if (controlado) onChangeValorRecebido?.(valor); else setInterno(valor); };
  const trocarForma = (event) => { if (event?.type === 'change') setRecebido(''); };

  return <div className="troco-auxiliar" style={{ marginTop: 12, padding: 12, borderRadius: 12, border: '1px dashed var(--border-color)', background: 'var(--bg-tertiary)' }} data-forma-pagamento={formaPagamento}>
    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 8, letterSpacing: '0.04em' }}>💵 CÁLCULO DE TROCO (opcional)</div>
    {!controlado && <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Valor recebido do cliente<input type="text" inputMode="decimal" placeholder="Ex: 50,00" value={recebidoTexto} onChange={(e) => setRecebido(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 6 }} /></label>}
    <div style={{ display: 'grid', gap: 4, fontSize: 13, marginTop: controlado ? 0 : 8 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total a pagar</span><strong>{formatMoney(total)}</strong></div>{temEntrada && <><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Recebido</span><strong>{formatMoney(valorRecebido)}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border-color)', fontSize: 16, fontWeight: 800, color: troco >= 0 ? 'var(--success-bg)' : 'var(--error-bg)' }}><span>{troco >= 0 ? 'Troco a devolver' : 'Ainda falta'}</span><span>{formatMoney(Math.abs(troco))}</span></div></>}{controlado && !temEntrada && <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12 }}>Informe o valor recebido acima para ver o troco.</p>}</div>
    <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>Apenas auxílio visual — não altera o valor registrado na venda.</p>
  </div>;
}
