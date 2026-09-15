import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.jsx';
import { useToast } from '../components/Toast.jsx';
import { compartilharNotaWhatsApp } from '../utils/notaVenda.js';


const corCategoria = {
  'Bebidas Quentes': { bg: 'var(--category-hot-bg)', txt: 'var(--category-hot-text)', border: 'var(--category-hot-border)' },
  'Bebidas geladas': { bg: 'var(--category-cold-bg)', txt: 'var(--category-cold-text)', border: 'var(--category-cold-border)' },
  Salgados: { bg: 'var(--category-savory-bg)', txt: 'var(--category-savory-text)', border: 'var(--category-savory-border)' },
  Doces: { bg: 'var(--category-sweet-bg)', txt: 'var(--category-sweet-text)', border: 'var(--category-sweet-border)' },
  'Café da manhã': { bg: 'var(--category-breakfast-bg)', txt: 'var(--category-breakfast-text)', border: 'var(--category-breakfast-border)' },
  Insumos: { bg: 'var(--category-supply-bg)', txt: 'var(--category-supply-text)', border: 'var(--category-supply-border)' },
  Outros: { bg: 'var(--category-other-bg)', txt: 'var(--category-other-text)', border: 'var(--category-other-border)' }
};

const grupos = ['Todos', 'Favoritos', 'Bebidas Quentes', 'Salgados', 'Doces', 'Bebidas geladas', 'Café da manhã'];
const normalizarTexto = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// FIX: 'gelad' verificado ANTES de 'café/espresso' para classificar corretamente
// "Café Gelado" / "Espresso Gelado" → Bebidas geladas (não Bebidas Quentes)
const grupoProduto = (produto) => {
  const nome = produto.nome.toLowerCase();
  if (nome.includes('gelad') || nome.includes('suco') || nome.includes('refrigerante')) return 'Bebidas geladas';
  if (nome.includes('cappuccino') || nome.includes('café') || nome.includes('cafe') || nome.includes('espresso') || nome.includes('expresso') || nome.includes('filtro')) return 'Bebidas Quentes';
  if (nome.includes('doce') || nome.includes('bolo') || nome.includes('torta') || nome.includes('cookie')) return 'Doces';
  if (nome.includes('pão') || nome.includes('salgad') || nome.includes('croissant') || produto.categoria === 'Salgados') return 'Salgados';
  if (produto.categoria === 'Café da manhã') return 'Café da manhã';
  return 'Outros';
};
const permiteFracionar = (produto) => Boolean(produto?.vendidoFracionado) || ['kg', 'g', 'l', 'ml'].includes(produto?.unidadeVenda);


export default function PDV() {
  const [produtos, setProdutos] = useState([]);
  const [maisVendidos, setMaisVendidos] = useState([]);
  const [carrinho, setCarrinho] = useState([]);
  const [busca, setBusca] = useState('');
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [grupoAtivo, setGrupoAtivo] = useState('Todos');
  const [feedbackProduto, setFeedbackProduto] = useState(null);
  const [modalSucesso, setModalSucesso] = useState(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const selectClienteRef = useRef(null);


  useEffect(() => { carregarDados(); }, []);


  const carregarDados = async () => {
    try {
      const [resProd, resCli, resMaisVendidos] = await Promise.all([
        api.get('/products'), api.get('/customers'), api.get('/products/mais-vendidos?limite=8')
      ]);
      setProdutos(resProd.data);
      setClientes(resCli.data);
      setMaisVendidos(resMaisVendidos.data);
    } catch {
      showToast('Erro ao carregar dados', 'error');
    }
  };


  const tocarFeedback = () => {
    try {
      const contexto = new window.AudioContext();
      const oscilador = contexto.createOscillator();
      const ganho = contexto.createGain();
      oscilador.frequency.value = 620;
      ganho.gain.setValueAtTime(0.035, contexto.currentTime);
      ganho.gain.exponentialRampToValueAtTime(0.001, contexto.currentTime + 0.08);
      oscilador.connect(ganho).connect(contexto.destination);
      oscilador.start();
      oscilador.stop(contexto.currentTime + 0.08);
    } catch { /* áudio pode ser bloqueado pelo navegador */ }
  };

  const adicionarItem = (prod, opcoes = {}) => {
    if (prod.estoque <= 0) return showToast('Produto sem estoque!', 'error');
    const modificadoresItem = opcoes.modificadores || [];
    const assinatura = modificadoresItem.join('|');
    const existe = carrinho.find(i => i.produtoId === prod._id && (i.modificadores || []).join('|') === assinatura);
    const incremento = 1;
    const quantidadeProduto = carrinho.filter(i => i.produtoId === prod._id).reduce((total, item) => total + item.quantidade, 0);
    if (quantidadeProduto + incremento > prod.estoque) return showToast('Estoque máximo atingido!', 'warning');
    if (existe) {
      if (existe.quantidade >= prod.estoque) return showToast('Estoque máximo atingido!', 'warning');
      setCarrinho(carrinho.map(i => i.produtoId === prod._id && (i.modificadores || []).join('|') === assinatura ? { ...i, quantidade: Number((i.quantidade + incremento).toFixed(3)) } : i));
    } else {
      setCarrinho([...carrinho, {
        produtoId: prod._id, codigo: prod.codigo, nome: prod.nome,
        precoUnitario: prod.preco, quantidade: incremento, unidadeVenda: prod.unidadeVenda || 'un', vendidoFracionado: permiteFracionar(prod), modificadores: modificadoresItem
      }]);
    }
    setFeedbackProduto(prod._id);
    tocarFeedback();
    window.setTimeout(() => setFeedbackProduto(null), 350);
  };

  const selecionarProduto = (prod) => {
    adicionarItem(prod);
  };


  const alterarQtd = (idx, qtd) => {
    const novos = [...carrinho];
    const prod = produtos.find(p => p._id === novos[idx].produtoId);
    if (qtd < 0.001) return removerItem(idx);
    if (!permiteFracionar(prod) && !Number.isInteger(qtd)) return showToast('Este produto é vendido por unidade', 'warning');
    const quantidadeOutrasLinhas = carrinho.reduce((total, item, itemIndex) => itemIndex !== idx && item.produtoId === novos[idx].produtoId ? total + item.quantidade : total, 0);
    if (quantidadeOutrasLinhas + qtd > prod.estoque) return showToast(`Máximo: ${prod.estoque}`, 'warning');
    novos[idx].quantidade = qtd;
    setCarrinho(novos);
  };


  const setPreco = (idx, valor) => {
    const novos = [...carrinho];
    novos[idx].precoUnitario = Math.max(0, parseFloat(valor) || 0);
    setCarrinho(novos);
  };


  const removerItem = (idx) => setCarrinho(carrinho.filter((_, i) => i !== idx));


  const subtotal = carrinho.reduce((ac, i) => ac + i.precoUnitario * i.quantidade, 0);
  const total = subtotal;
  const totalItens = carrinho.reduce((ac, i) => ac + i.quantidade, 0);
  const clienteSelecionado = clientes.find(c => c._id === clienteId);


  const finalizar = async () => {
    if (!carrinho.length) return showToast('Carrinho vazio!', 'warning');

    try {
      const { data: comanda } = await api.post('/comandas', {
        clienteId: clienteId || undefined,
        clienteNome: clienteSelecionado?.nome || clienteNome.trim() || 'Cliente não identificado',
        clienteTelefone: clienteSelecionado?.telefone || '',
        itens: carrinho.map((item) => ({
          produtoId: item.produtoId,
          quantidade: Number(item.quantidade),
          modificadores: item.modificadores || [],
        })),
      });
      setCarrinho([]); setClienteId(''); setClienteNome('');
      showToast(`Comanda #${comanda.numero} aberta`, 'success');
      navigate('/comandas');
    } catch (err) {
      showToast(err.response?.data?.msg || 'Erro ao abrir comanda', 'error');
    }
  };


  // ==========================================
  // 🖨️ IMPRIMIR CUPOM
  // ==========================================
  const imprimirCupom = (pedido) => {
    if (!pedido) return;
    
    const data = new Date(pedido.createdAt).toLocaleString('pt-BR');
    const itensHtml = pedido.itens.map(item => `
      <div style="display:flex; justify-content:space-between; border-bottom: 1px dashed #000; padding: 4px 0;">
        <div style="flex:1; margin-right:8px;">
          <div style="font-weight:bold;">${item.nome}</div>
          <div style="font-size:10px;">Cod: ${item.codigo} | Qtd: ${item.quantidade} x R$ ${item.precoUnitario.toFixed(2).replace('.',',')}</div>
        </div>
        <div style="font-weight:bold; white-space:nowrap;">R$ ${(item.quantidade * item.precoUnitario).toFixed(2).replace('.',',')}</div>
      </div>
    `).join('');
    const cupom = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cupom #${pedido.numero}</title>
        <style>
          * { font-family: 'Courier New', monospace; font-size: 12px; }
          body { width: 76mm; margin: 0; padding: 4mm; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .total { font-size: 14px; font-weight: bold; border-top: 2px solid #000; padding-top: 8px; margin-top: 8px; }
          .linha-dupla { border-top: 2px dashed #000; margin: 8px 0; }
          @media print {
            @page { margin: 0; size: 80mm auto; }
            body { margin: 4mm; }
          }
        </style>
      </head>
      <body>
        <div class="center"><img src="${window.location.origin}/Abraco1.png" alt="Sabor de Abraço" style="width:52px;height:52px;object-fit:contain;"></div>
        <div class="center bold" style="font-size:14px;">SABOR DE ABRAÇO</div>
        <div class="center" style="font-size:10px;">Cupom Não Fiscal</div>
        <div class="linha-dupla"></div>
        
        <div><span class="bold">Pedido:</span> #${pedido.numero}</div>
        <div><span class="bold">Data:</span> ${data}</div>
        <div><span class="bold">Atendente:</span> ${pedido.atendente}</div>
        <div><span class="bold">Cliente:</span> ${pedido.clienteNome}</div>
        
        <div class="linha-dupla"></div>
        <div class="bold" style="text-align:center;">=== ITENS DO PEDIDO ===</div>
        
        ${itensHtml}
        
        <div class="linha-dupla"></div>
        <div style="display:flex; justify-content:space-between;">
          <span>Subtotal:</span>
          <span>R$ ${pedido.subtotal.toFixed(2).replace('.',',')}</span>
        </div>
        ${pedido.desconto > 0 ? `
        <div style="display:flex; justify-content:space-between; color:#16a34a;">
          <span>Desconto:</span>
          <span>-R$ ${pedido.desconto.toFixed(2).replace('.',',')}</span>
        </div>
        ` : ''}
        <div class="total" style="display:flex; justify-content:space-between;">
          <span>TOTAL:</span>
          <span>R$ ${pedido.total.toFixed(2).replace('.',',')}</span>
        </div>
        
        <div class="linha-dupla"></div>
        <div class="center" style="font-size:10px;">
          Obrigado pela preferência!<br>
          Volte sempre!
        </div>
        
        <script>window.onload = function() { window.print(); setTimeout(() => window.close(), 500); }</script>
      </body>
      </html>
    `;
    const janela = window.open('', '_blank', 'width=350,height=600');
    janela.document.write(cupom);
    janela.document.close();
  };


  // ==========================================
  // 💬 ENVIAR VIA WHATSAPP
  // ==========================================
  const enviarWhatsApp = (pedido) => {
    if (!pedido) return;
    return compartilharNotaWhatsApp(pedido);
    
    const data = new Date(pedido.createdAt).toLocaleString('pt-BR');
    
    const itensTexto = pedido.itens.map(item => 
      `• ${item.nome}\n  ${item.quantidade} x R$ ${item.precoUnitario.toFixed(2).replace('.',',')} = R$ ${(item.quantidade * item.precoUnitario).toFixed(2).replace('.',',')}`
    ).join('\n');
    const texto = encodeURIComponent(
`🛒 *PEDIDO* #${pedido.numero}
📅 ${data}
👤 Cliente: ${pedido.clienteNome}
💼 Atendente: ${pedido.atendente}
━━━━━━━━━━━━━━━━
📦 *ITENS:*
${itensTexto}
━━━━━━━━━━━━━━━━
💰 Subtotal: R$ ${pedido.subtotal.toFixed(2).replace('.',',')}
${pedido.desconto > 0 ? `🎁 Desconto: -R$ ${pedido.desconto.toFixed(2).replace('.',',')}\n` : ''}💵 *TOTAL: R$ ${pedido.total.toFixed(2).replace('.',',')}*
Obrigado pela preferência! 🙏`
    );
    const telefone = pedido.clienteTelefone ? pedido.clienteTelefone.replace(/\D/g, '') : '';
    const url = telefone 
      ? `https://wa.me/55${telefone}?text=${texto}`
      : `https://wa.me/?text=${texto}`;
    
    window.open(url, '_blank');
  };


  // ==========================================
  // NOVA VENDA
  // ==========================================
  const novaVenda = () => {
    setModalSucesso(null);
  };


  const termoBusca = normalizarTexto(busca);
  const idsMaisVendidos = new Set(maisVendidos.map((item) => String(item.produtoId)));
  const produtosMaisVendidos = maisVendidos
    .map((item) => produtos.find((produto) => produto._id === String(item.produtoId)))
    .filter(Boolean);
  const filtrados = produtos.filter((produto) => produto.categoria !== 'Insumos').filter((produto) =>
    !termoBusca || [produto.nome, produto.codigo, produto.categoria].some((campo) => normalizarTexto(campo).includes(termoBusca))
  ).filter((produto) => {
    if (grupoAtivo === 'Todos') return true;
    if (grupoAtivo === 'Favoritos') return idsMaisVendidos.has(String(produto._id));
    return grupoProduto(produto) === grupoAtivo;
  });


  return (
    <div>
      {/* Cabeçalho PDV */}
      <div className="pdv-header-desktop page-heading">
        <div>
          <h1>☕ Atendimento</h1>
          <p>Monte o pedido e abra uma comanda.</p>
        </div>
      </div>
      <button type="button" className="pdv-mobile-cart-trigger" onClick={() => setMobileCartOpen(true)}>
        <span>🛒 Carrinho</span>
        <strong>{totalItens} {totalItens === 1 ? 'item' : 'itens'} · R$ {total.toFixed(2).replace('.', ',')}</strong>
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }} className="pdv-grid">
        {/* COLUNA PRODUTOS */}
        <div className="pdv-products-column">
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 16, padding: 16, marginBottom: 16
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }} className="busca-grid">
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Buscar produto</label>
                <input
                  placeholder="Código, nome ou categoria..." value={busca}
                  onChange={e => setBusca(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', border: '1.5px solid var(--border-color)',
                    borderRadius: 10, fontSize: 16, boxSizing: 'border-box',
                    outline: 'none', background: 'var(--input-bg)', color: 'var(--input-text)', minHeight: 48
                  }}
                />
                {clienteSelecionado && <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 9, background: 'var(--accent-light)', color: 'var(--text-secondary)', fontSize: 11 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><strong style={{ color: 'var(--text-primary)' }}>Fidelidade</strong><span>{Math.min(5, clienteSelecionado.cafesFidelidade || 0)}/5 cafés</span></div><div style={{ height: 6, borderRadius: 99, background: 'var(--bg-tertiary)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, ((clienteSelecionado.cafesFidelidade || 0) / 5) * 100)}%`, height: '100%', background: 'var(--accent-secondary)', transition: 'width .3s ease' }} /></div><span style={{ display: 'block', marginTop: 4 }}>Faltam {Math.max(0, 5 - (clienteSelecionado.cafesFidelidade || 0))} para o próximo café</span></div>}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Cliente</label>
                <select
                  ref={selectClienteRef}
                  value={clienteId}
                  onChange={e => setClienteId(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', border: '1.5px solid var(--border-color)',
                    borderRadius: 10, fontSize: 16, boxSizing: 'border-box',
                    outline: 'none', background: 'var(--input-bg)', color: 'var(--input-text)', minHeight: 48
                  }}>
                  <option value="">Cliente não identificado</option>
                  {clientes.map(c => <option key={c._id} value={c._id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Nome no atendimento</label>
                <input placeholder="Digite o nome (opcional)" value={clienteNome} onChange={e => setClienteNome(e.target.value)} style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--border-color)', borderRadius: 10, fontSize: 16, boxSizing: 'border-box', outline: 'none', background: 'var(--input-bg)', color: 'var(--input-text)', minHeight: 48 }} />
              </div>
            </div>
          </div>
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 16, padding: 16
          }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Mais pedidos</h3>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Mais vendidos no histórico</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 700 }}>ATENDIMENTO RÁPIDO</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                {produtosMaisVendidos.filter((produto) => produto.categoria !== 'Insumos' && grupoProduto(produto) !== 'Bebidas geladas').slice(0, 6).map((produto) => (
                  <button key={produto._id} onClick={() => selecionarProduto(produto)} style={{ padding: '11px 10px', minHeight: 58, textAlign: 'left', border: '1px solid var(--accent-border)', borderRadius: 10, background: 'var(--accent-light)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <strong style={{ display: 'block', fontSize: 12 }}>{produto.nome}</strong>
                    <span style={{ fontSize: 11, color: 'var(--accent-primary)' }}>R$ {produto.preco.toFixed(2).replace('.', ',')}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, marginBottom: 2 }}>
              {grupos.map((grupo) => (
                <button key={grupo} onClick={() => setGrupoAtivo(grupo)} style={{ flexShrink: 0, minHeight: 40, padding: '8px 13px', borderRadius: 20, border: grupoAtivo === grupo ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', background: grupoAtivo === grupo ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: grupoAtivo === grupo ? '#fff' : 'var(--text-secondary)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  {grupo}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Produtos</h3>
              <span style={{
                background: 'var(--accent-light)', color: 'var(--accent-primary)',
                padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600
              }}>{filtrados.length}</span>
            </div>
            {filtrados.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 20px', fontSize: 14 }}>Nenhum produto encontrado</p>
            ) : (
              <div style={{
                display: 'grid', gap: 10,
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                maxHeight: 420, overflowY: 'auto', padding: 2
              }}>
                {filtrados.map(p => {
                  const cat = corCategoria[p.categoria] || corCategoria.Outros;
                  const semEstoque = p.estoque <= 0;
                  const estoqueBaixo = p.estoque > 0 && p.estoque <= 5;
                  return (
                    <div key={p._id} onClick={() => selecionarProduto(p)} style={{
                      background: 'var(--bg-secondary)', border: `1.5px solid ${semEstoque ? 'var(--border-light)' : cat.border}`,
                      borderRadius: 14, padding: 12, cursor: semEstoque ? 'not-allowed' : 'pointer',
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                      minHeight: 120, opacity: semEstoque ? 0.5 : 1, transition: 'all .15s',
                      position: 'relative', overflow: 'hidden'
                    }} className={`product-card ${feedbackProduto === p._id ? 'product-card-added' : ''}`}>
                      <div>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                          fontSize: 10, fontWeight: 700, marginBottom: 6,
                          background: cat.bg, color: cat.txt
                        }}>{p.categoria}</span>
                        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25, color: 'var(--text-primary)' }}>{p.nome}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3, fontFamily: 'monospace' }}>Cod: {p.codigo}</div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 }}>
                        <div style={{
                          fontSize: 10, fontWeight: estoqueBaixo ? 700 : 500,
                          color: estoqueBaixo ? 'var(--error-bg)' : 'var(--text-secondary)'
                        }}>Est: {p.estoque}</div>
                        <div style={{
                          fontWeight: 700, fontSize: 16, color: semEstoque ? 'var(--text-tertiary)' : 'var(--accent-primary)',
                          fontVariantNumeric: 'tabular-nums'
                        }}>R$ {p.preco.toFixed(2).replace('.', ',')}</div>
                      </div>
                      {semEstoque && (
                        <div style={{
                          position: 'absolute', top: 6, right: 6, background: 'rgba(239, 68, 68, 0.1)',
                          color: 'var(--error-bg)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8
                        }}>SEM ESTOQUE</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {/* COLUNA CARRINHO */}
        <div className={`pdv-cart-panel ${mobileCartOpen ? 'mobile-open' : ''}`}>
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 16, padding: 16, position: 'sticky', top: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                📝 Carrinho
                {totalItens > 0 && (
                  <span style={{
                    background: 'var(--accent-primary)', color: '#fff',
                    padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700
                  }}>{totalItens}</span>
                )}
              </h3>
              <button type="button" className="pdv-mobile-cart-close" onClick={() => setMobileCartOpen(false)} aria-label="Fechar carrinho">×</button>
            </div>
            {carrinho.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)', fontSize: 14 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🛒</div>
                Carrinho vazio<br />
                <span style={{ fontSize: 12 }}>Toque nos produtos ao lado</span>
              </div>
            ) : (
              <>
                <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 14, paddingRight: 4 }}>
                  {carrinho.map((item, i) => {
                    const prod = produtos.find(p => p._id === item.produtoId);
                    return (
                      <div key={i} style={{
                        padding: '10px 0', borderBottom: '1px solid var(--border-light)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div style={{ flex: 1, paddingRight: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: 'var(--text-primary)' }}>{item.nome}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                              Cod: {item.codigo} | Disp: {prod?.estoque ?? '-'}
                            </div>
                            {item.modificadores?.length > 0 && <div style={{ fontSize: 11, color: 'var(--accent-primary)', marginTop: 4 }}>☕ {item.modificadores.join(' · ')}</div>}
                          </div>
                          <button onClick={() => removerItem(i)} style={{
                            background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error-bg)',
                            border: 'none', borderRadius: 8, padding: '6px 10px',
                            cursor: 'pointer', fontWeight: 700, fontSize: 12, minHeight: 32
                          }}>✕</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
                            <button onClick={() => alterarQtd(i, item.quantidade - (permiteFracionar(prod) ? 0.001 : 1))} style={{
                              width: 40, height: 40, background: 'transparent', border: 'none',
                              cursor: 'pointer', fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)'
                            }}>−</button>
                            <input type="number" min={permiteFracionar(prod) ? 0.001 : 1} step={permiteFracionar(prod) ? 0.001 : 1} value={item.quantidade}
                              onChange={e => alterarQtd(i, Number(e.target.value))}
                              style={{
                                width: 48, textAlign: 'center', border: 'none',
                                borderLeft: '1px solid var(--border-color)',
                                borderRight: '1px solid var(--border-color)',
                                padding: '8px 4px', fontSize: 15, fontWeight: 700,
                                background: 'var(--input-bg)', color: 'var(--input-text)'
                              }} />
                            <button onClick={() => alterarQtd(i, item.quantidade + (permiteFracionar(prod) ? 0.001 : 1))} style={{
                              width: 40, height: 40, background: 'transparent', border: 'none',
                              cursor: 'pointer', fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)'
                            }}>+</button>
                          </div>
                          <div style={{ flex: 1, textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Unitário</div>
                            <input type="number" step="0.01" min={0} value={item.precoUnitario.toFixed(2)}
                              onChange={e => setPreco(i, e.target.value)}
                              style={{
                                width: 90, textAlign: 'right', padding: '8px 10px',
                                border: '1px solid var(--border-color)', borderRadius: 8,
                                fontSize: 14, fontWeight: 700, color: 'var(--accent-primary)',
                                background: 'var(--input-bg)', minHeight: 38
                              }} />
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                          Subtotal: R$ {(item.precoUnitario * item.quantidade).toFixed(2).replace('.', ',')}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                    <span>Subtotal</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontWeight: 700, fontSize: 24, color: 'var(--accent-primary)' }}>
                    <span>Total</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>R$ {total.toFixed(2).replace('.', ',')}</span>
                  </div>
                  
                  <button onClick={finalizar} style={{
                    width: '100%', padding: '14px', background: 'var(--accent-primary)', color: '#fff',
                    border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
                    cursor: 'pointer', minHeight: 52
                  }}>☕ Abrir Comanda</button>
                  
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ==========================================
          ✅ MODAL DE SUCESSO
          ========================================== */}
      {modalSucesso && (
        <div onClick={() => setModalSucesso(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, padding: 20
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-secondary)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400,
            textAlign: 'center', boxShadow: 'var(--shadow-lg)',
            color: 'var(--text-primary)'
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
              background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36
            }}>✅</div>
            <h3 style={{ margin: '0 0 4px', fontSize: 20, color: 'var(--text-primary)' }}>Venda Finalizada!</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>
              Pedido <strong style={{ color: 'var(--text-primary)' }}>#{modalSucesso.numero}</strong>
              <br />
              Total: <strong style={{ color: 'var(--accent-primary)', fontSize: 16 }}>
                R$ {modalSucesso.total.toFixed(2).replace('.', ',')}
              </strong>
            </p>
            <div style={{ borderTop: '1px solid rgba(15,23,42,.08)', marginBottom: 20 }}></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => imprimirCupom(modalSucesso)} style={{
                width: '100%', padding: '14px', background: 'var(--brand-brown)', color: '#fff',
                border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', minHeight: 52, display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 10
              }}>🖨️ Imprimir Cupom</button>
              <button onClick={() => enviarWhatsApp(modalSucesso)} style={{
                width: '100%', padding: '14px', background: 'var(--success-bg)', color: '#fff',
                border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', minHeight: 52, display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 10
              }}>💬 Enviar pelo WhatsApp</button>
              <button onClick={novaVenda} style={{
                width: '100%', padding: '13px', background: 'var(--accent-light)', color: 'var(--accent-primary)',
                border: '1.5px solid var(--accent-border)', borderRadius: 12,
                fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48
              }}>🛒 Iniciar Nova Venda</button>
              <button onClick={() => setModalSucesso(null)} style={{
                width: '100%', padding: '10px', background: 'transparent', color: 'var(--text-secondary)',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', minHeight: 36
              }}>Fechar</button>
            </div>
          </div>
        </div>
      )}


      <style>{`
        @media (min-width: 1024px) {
          .pdv-grid { grid-template-columns: 2fr 1fr !important; }
        }
        @media (min-width: 768px) {
          .busca-grid { grid-template-columns: 1.3fr 1fr 1.1fr 1fr !important; }
          .pdv-header-desktop { display: block !important; }
        }
        @media (max-width: 767px) {
          .pdv-header-desktop { display: none !important; }
          .pdv-mobile-cart-trigger { display: flex !important; }
          .pdv-grid { gap: 10px !important; min-width: 0; }
          .pdv-grid > div { min-width: 0; }
          .pdv-cart-panel { display: none; }
          .pdv-cart-panel.mobile-open { display: block; position: fixed; inset: 0; z-index: 1200; overflow-y: auto; padding: 12px; background: var(--bg-primary); }
          .pdv-cart-panel.mobile-open > div { min-height: calc(100svh - 24px); border-radius: 14px !important; }
          .pdv-mobile-cart-close { display: inline-flex !important; }
          .pdv-grid > div > div { padding: 12px !important; border-radius: 12px !important; margin-bottom: 10px !important; }
          .pdv-grid .product-card { min-height: 96px !important; padding: 10px !important; }
          .pdv-grid [style*="max-height: 420px"] { max-height: 280px !important; }
          .pdv-grid [style*="position: sticky"] { position: static !important; }
        }
        .product-card:active { transform: scale(0.97); }
        .product-card-added { animation: item-added .35s ease; border-color: var(--accent-primary) !important; }
        .pdv-mobile-cart-trigger, .pdv-mobile-cart-close { display: none; }
        .pdv-mobile-cart-trigger { width: 100%; min-height: 50px; margin-bottom: 10px; padding: 10px 14px; align-items: center; justify-content: space-between; gap: 12px; border: 0; border-radius: 12px; background: var(--accent-primary); color: #fff; font: inherit; font-size: 14px; cursor: pointer; box-shadow: var(--shadow-sm); }
        .pdv-mobile-cart-trigger strong { font-size: 13px; white-space: nowrap; }
        .pdv-mobile-cart-close { align-items: center; justify-content: center; width: 38px; height: 38px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-tertiary); color: var(--text-primary); font-size: 24px; cursor: pointer; }
        @keyframes item-added { 50% { transform: scale(1.035); box-shadow: 0 0 0 4px var(--accent-light); } }
      `}</style>
    </div>
  );
}
