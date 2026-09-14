import { useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api.jsx';
import { useToast } from '../components/Toast.jsx';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { buildNotaVendaHtml, compartilharNotaWhatsApp } from '../utils/notaVenda.js';
import DashboardInsights from '../components/DashboardInsights.jsx';
import DashboardTabs from '../components/DashboardTabs.jsx';
import ProductSalesHistory from '../components/ProductSalesHistory.jsx';
import DateInput from '../components/DateInput.jsx';

const money = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const labels = { dia: 'Hoje', semana: 'Esta semana', mes: 'Este mês' };
const paymentLabels = { dinheiro: 'Dinheiro', pix: 'Pix', credito_loja: 'Credito na loja', cartao_credito: 'Cartao de credito', cartao_debito: 'Cartao de debito' };
const statusLabels = { aberta: 'Aberta', fechada: 'Fechada', cancelada: 'Cancelada' };
const variacao = (atual, anterior) => anterior ? ((atual - anterior) / Math.abs(anterior)) * 100 : (atual ? 100 : 0);

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [quadrosAbertos, setQuadrosAbertos] = useState({ estoque: false, clientes: false, mensal: false, pedidos: false, comandas: false });
  const [comandas, setComandas] = useState([]);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [carregandoComandas, setCarregandoComandas] = useState(false);
  const [comandaSelecionada, setComandaSelecionada] = useState(null);
  const [telefoneComanda, setTelefoneComanda] = useState('');
  const [nomeComanda, setNomeComanda] = useState('');
  const [dashboardTab, setDashboardTab] = useState('vendas');
  const [comparacaoTipo, setComparacaoTipo] = useState('mes');
  const [comparacaoMesA, setComparacaoMesA] = useState(new Date().toISOString().slice(0, 7));
  const [comparacaoMesB, setComparacaoMesB] = useState(() => { const data = new Date(); data.setMonth(data.getMonth() - 1); return data.toISOString().slice(0, 7); });
  const [comparacaoSemanaA, setComparacaoSemanaA] = useState(() => { const data = new Date(); data.setDate(data.getDate() - data.getDay() + 1); return data.toISOString().slice(0, 10); });
  const [comparacaoSemanaB, setComparacaoSemanaB] = useState(() => { const data = new Date(); data.setDate(data.getDate() - data.getDay() - 6); return data.toISOString().slice(0, 10); });
  const [comparacaoVendas, setComparacaoVendas] = useState(null);
  const [alertasCusto, setAlertasCusto] = useState({ semCusto: [], reajuste: [] });
  const [productionData, setProductionData] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (user?.role !== 'admin') return;
    Promise.all([api.get('/dashboard'), api.get('/products'), api.get('/comandas'), api.get('/production/dashboard'), api.get('/products/sem-custo'), api.get('/products/reajuste-recomendado')])
      .then(([dashboardResponse, productsResponse, comandasResponse, productionResponse, semCustoResponse, reajusteResponse]) => {
        setData(dashboardResponse.data);
        setProdutos(productsResponse.data);
        setComandas(comandasResponse.data);
        setProductionData(productionResponse.data);
        setAlertasCusto({ semCusto: semCustoResponse.data || [], reajuste: reajusteResponse.data || [] });
      })
      .catch((error) => showToast(error.response?.data?.msg || 'Não foi possível carregar o dashboard', 'error'));
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    const params = comparacaoTipo === 'mes'
      ? { tipo: 'mes', periodoA: comparacaoMesA, periodoB: comparacaoMesB }
      : { tipo: 'semana', periodoA: comparacaoSemanaA, periodoB: comparacaoSemanaB };
    api.get('/dashboard/comparar-vendas', { params })
      .then((response) => setComparacaoVendas(response.data))
      .catch((error) => showToast(error.response?.data?.msg || 'Não foi possível comparar as vendas', 'error'));
  }, [comparacaoMesA, comparacaoMesB, comparacaoSemanaA, comparacaoSemanaB, comparacaoTipo, showToast, user?.role]);

  useEffect(() => {
    const selecionarComanda = (event) => {
      const item = event.target.closest('.dashboard-comanda');
      if (!item) return;
      const numero = item.querySelector('strong')?.textContent.replace('#', '').trim();
      const comanda = comandas.find((registro) => registro.numero === numero);
      if (comanda) {
        setComandaSelecionada(comanda);
        setNomeComanda(comanda.clienteNome || '');
        setTelefoneComanda('');
      }
    };
    document.addEventListener('click', selecionarComanda);
    return () => document.removeEventListener('click', selecionarComanda);
  }, [comandas]);

  if (user?.role !== 'admin') return <Navigate to="/pdv" replace />;

  if (!data) return <div className="dashboard-page"><div className="dashboard-loading">☕ Carregando acompanhamento...</div></div>;
  const pedidosHoje = data.pedidosHoje || [];
  const vendasHoje = data.vendasHoje || { pedidos: 0, itens: 0, total: 0, recebido: 0, pendente: 0 };
  const relatorioMes = data.relatorioMes || { pedidos: 0, vendas: 0, itens: 0, total: 0, recebido: 0, pendente: 0, ticketMedio: 0, status: {}, pagamentos: [], produtos: [], clientes: 0, vendasPorDia: [] };
  const relatorioClientes = data.relatorioClientes || { periodo: '', totalCadastrados: 0, clientesComCompra: 0, totalVendido: 0, totalRecebido: 0, totalPendente: 0, clientes: [] };
  const insights = data.insights || {};
  const estoque = [...produtos].sort((a, b) => Number(a.estoque || 0) - Number(b.estoque || 0));
  const estoquePorCategoria = estoque.reduce((grupos, produto) => {
    const categoria = produto.categoria || 'Outros';
    grupos[categoria] = [...(grupos[categoria] || []), produto];
    return grupos;
  }, {});
  const dataLocal = (() => { const agora = new Date(); return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`; })();
  const percentualEstoque = (produto) => {
    const estoqueInicial = produto.estoqueInicialData === dataLocal ? Number(produto.estoqueInicialDia) : Number(produto.estoque);
    return Math.min(100, Math.round((Number(produto.estoque || 0) / Math.max(0.001, estoqueInicial || 1)) * 100));
  };
  const classeEstoque = (percentual) => percentual > 60 ? 'stock-good' : percentual >= 25 ? 'stock-warning' : 'stock-danger';
  const alternarQuadro = (quadro) => setQuadrosAbertos((atuais) => ({ ...atuais, [quadro]: !atuais[quadro] }));
  const consultarComandas = async (event) => {
    event.preventDefault();
    setCarregandoComandas(true);
    try {
      const response = await api.get('/comandas', { params: { dataInicio, dataFim } });
      setComandas(response.data);
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível consultar as comandas', 'error');
    } finally {
      setCarregandoComandas(false);
    }
  };
  const comandasPorData = comandas.reduce((grupos, comanda) => {
    const data = new Date(comanda.createdAt);
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    grupos[chave] = [...(grupos[chave] || []), comanda];
    return grupos;
  }, {});
  const formatarDataComandas = (chave) => new Date(`${chave}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const pedidoDaComanda = comandaSelecionada ? {
    numero: comandaSelecionada.numero,
    createdAt: comandaSelecionada.createdAt,
    clienteNome: nomeComanda || comandaSelecionada.clienteNome,
    atendente: comandaSelecionada.atendente,
    itens: comandaSelecionada.itens || [],
    subtotal: (comandaSelecionada.itens || []).reduce((total, item) => total + Number(item.precoUnitario || 0) * Number(item.quantidade || 0), 0),
    desconto: Number(comandaSelecionada.desconto || 0),
    utilizacaoInterna: Boolean(comandaSelecionada.utilizacaoInterna),
    total: (comandaSelecionada.itens || []).reduce((total, item) => total + Number(item.precoUnitario || 0) * Number(item.quantidade || 0), 0) - Number(comandaSelecionada.desconto || 0),
    pagamentos: [],
  } : null;
  const imprimirComanda = () => {
    const janela = window.open('', '_blank', 'width=420,height=700');
    janela.document.write(buildNotaVendaHtml(pedidoDaComanda, { comandaNumero: comandaSelecionada.numero, titulo: 'VISUALIZAÇÃO DA COMANDA' }));
    janela.document.close();
  };
  const enviarComandaWhatsApp = async () => {
    if (!telefoneComanda.trim()) return showToast('Informe o telefone para enviar pelo WhatsApp', 'warning');
    try {
      await api.patch(`/comandas/${comandaSelecionada._id}/cliente`, { telefone: telefoneComanda, nome: nomeComanda });
      const comandaAtualizada = { ...comandaSelecionada, clienteNome: nomeComanda || comandaSelecionada.clienteNome };
      setComandaSelecionada(comandaAtualizada);
      await compartilharNotaWhatsApp({ ...pedidoDaComanda, clienteNome: comandaAtualizada.clienteNome }, { comandaNumero: comandaAtualizada.numero, titulo: 'VISUALIZAÇÃO DA COMANDA' }, telefoneComanda);
      showToast('Cliente salvo e comprovante enviado pelo WhatsApp', 'success');
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível salvar o cliente ou enviar o WhatsApp', 'error'); }
  };

  const imprimirRelatorioMes = () => {
    const pagamentos = relatorioMes.pagamentos.map((pagamento) => `<div class="linha"><span>${paymentLabels[pagamento.tipo] || pagamento.tipo}</span><b>R$ ${money(pagamento.total)}</b></div>`).join('');
    const produtos = relatorioMes.produtos.map((produto) => `<div class="linha"><span>${produto.quantidade}x ${produto.nome}</span><b>R$ ${money(produto.total)}</b></div>`).join('');
    const dias = relatorioMes.vendasPorDia.map((dia) => `<div class="linha"><span>${dia.dia}</span><b>R$ ${money(dia.total)}</b></div>`).join('');
    const janela = window.open('', '_blank', 'width=420,height=700');
    janela.document.write(`<!DOCTYPE html><html><head><title>Fechamento Mensal</title><style>*{box-sizing:border-box;font-family:'Courier New',monospace;font-size:12px}body{width:76mm;margin:0;padding:4mm;color:#000}.center{text-align:center}.marca{font-size:16px;font-weight:bold}.separador{border-top:1px dashed #000;margin:8px 0}.linha{display:flex;justify-content:space-between;gap:8px;padding:3px 0}.titulo{font-weight:bold;margin:6px 0}.total{border-top:2px solid #000;padding-top:7px;margin-top:6px;font-weight:bold;font-size:14px}@media print{@page{margin:0;size:80mm auto}body{margin:4mm}}</style></head><body><div class="center marca">SABOR DE ABRACO</div><div class="center">FECHAMENTO MENSAL</div><div class="center">${relatorioMes.periodo || ''}</div><div class="separador"></div><div class="titulo">RESUMO</div><div class="linha"><span>Pedidos:</span><b>${relatorioMes.pedidos}</b></div><div class="linha"><span>Clientes:</span><b>${relatorioMes.clientes}</b></div><div class="linha"><span>Itens vendidos:</span><b>${relatorioMes.itens}</b></div><div class="linha"><span>Ticket medio:</span><b>R$ ${money(relatorioMes.ticketMedio)}</b></div><div class="linha total"><span>VENDAS:</span><b>R$ ${money(relatorioMes.total)}</b></div><div class="linha"><span>Recebido:</span><b>R$ ${money(relatorioMes.recebido)}</b></div><div class="linha"><span>A receber:</span><b>R$ ${money(relatorioMes.pendente)}</b></div><div class="separador"></div><div class="titulo">STATUS DOS PEDIDOS</div>${Object.entries(relatorioMes.status).map(([status, total]) => `<div class="linha"><span>${status}</span><b>${total}</b></div>`).join('')}<div class="separador"></div><div class="titulo">FORMAS DE PAGAMENTO</div>${pagamentos || '<div>Nenhum pagamento registrado</div>'}<div class="separador"></div><div class="titulo">PRODUTOS MAIS VENDIDOS</div>${produtos || '<div>Nenhuma venda registrada</div>'}<div class="separador"></div><div class="titulo">VENDAS POR DIA</div>${dias || '<div>Nenhuma venda registrada</div>'}<div class="separador"></div><div class="center"><b>Sabor de Abraço</b><br>Agradece a Preferência!<br>Volte sempre!</div><script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script></body></html>`);
    janela.document.close();
  };

  const imprimirRelatorioClientes = () => {
    const clientes = relatorioClientes.clientes.map((cliente) => `<div class="cliente"><span>${cliente.nome}</span><span>${cliente.telefone || 'Nao informado'}</span></div>`).join('');
    const janela = window.open('', '_blank', 'width=420,height=700');
    janela.document.write(`<!DOCTYPE html><html><head><title>Base de Clientes</title><style>*{box-sizing:border-box;font-family:'Courier New',monospace;font-size:12px}body{width:76mm;margin:0;padding:4mm;color:#000}.center{text-align:center}.marca{font-size:16px;font-weight:bold}.separador{border-top:1px dashed #000;margin:8px 0}.cabecalho,.cliente{display:grid;grid-template-columns:1fr 100px;gap:8px;padding:6px 0}.cabecalho{font-weight:bold;border-bottom:1px solid #000}.cliente{border-bottom:1px dashed #999}.cliente span:last-child{text-align:right}@media print{@page{margin:0;size:80mm auto}body{margin:4mm}}</style></head><body><div class="center marca">SABOR DE ABRACO</div><div class="center">BASE DE CLIENTES</div><div class="separador"></div><div class="cabecalho"><span>Nome</span><span>Telefone</span></div>${clientes || '<div>Nenhum cliente cadastrado</div>'}<div class="separador"></div><div class="center">Sabor de Abraço<br>Agradece a Preferência!<br>Volte sempre!</div><script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script></body></html>`);
    janela.document.close();
  };

  const exportarClientesMailing = () => {
    const escaparCsv = (valor) => `"${String(valor || '').replace(/"/g, '""')}"`;
    const linhas = [
      ['Nome', 'Telefone'],
      ...relatorioClientes.clientes.map((cliente) => [cliente.nome, cliente.telefone || '']),
    ].map((linha) => linha.map(escaparCsv).join(';'));
    const blob = new Blob([`\uFEFF${linhas.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientes-mailing-${dataLocal}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (dashboardTab === 'producao') return <div className="dashboard-page">
    <div className="dashboard-heading page-heading"><div><span className="dashboard-eyebrow">GESTÃO DA CASA</span><h1>Dashboard</h1><p>Indicadores de produção e disponibilidade de insumos.</p></div><div className="dashboard-open">Produção própria</div></div>
    <DashboardTabs value={dashboardTab} onChange={setDashboardTab} />
    <section className="dashboard-production-grid"><div className="dashboard-production-summary"><span>Insumos abaixo do mínimo</span><b>{productionData?.baixoEstoque?.length || 0}</b></div><div className="dashboard-production-summary"><span>Receitas disponíveis</span><b>{productionData?.receitasPossiveis?.filter((recipe) => recipe.producoesPossiveis > 0).length || 0}</b></div><div className="dashboard-production-summary"><span>Produções recentes</span><b>{productionData?.producoesRecentes?.length || 0}</b></div></section>
    <section className="dashboard-production-panel"><h2>Podem ser produzidas agora</h2>{productionData?.receitasPossiveis?.length ? productionData.receitasPossiveis.map((recipe) => <div className="dashboard-production-row" key={String(recipe.receitaId)}><span><strong>{recipe.receitaNome}</strong><small>{recipe.produtoNome} · rende {recipe.rendimentoPorProducao} {recipe.unidade}</small></span><b>{recipe.producoesPossiveis > 0 ? `${recipe.producoesPossiveis} produção(ões)` : 'Insumos insuficientes'}</b></div>) : <p>Nenhuma receita cadastrada.</p>}</section>
    <section className="dashboard-production-panel"><h2>Alertas de insumos</h2>{productionData?.baixoEstoque?.length ? productionData.baixoEstoque.map((product) => <div className="dashboard-production-row" key={product._id}><span><strong>{product.nome}</strong><small>Código {product.codigo}</small></span><b>{product.estoqueInsumos} / mínimo {product.estoqueMinimoInsumos} {product.unidadeVenda}</b></div>) : <p>Nenhum insumo abaixo do mínimo.</p>}</section>
    <style>{`.dashboard-production-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.dashboard-production-summary,.dashboard-production-panel{margin-top:16px;padding:18px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);box-shadow:var(--shadow-sm)}.dashboard-production-summary span,.dashboard-production-summary b{display:block}.dashboard-production-summary span{color:var(--text-secondary);font-size:11px}.dashboard-production-summary b{margin-top:7px;color:var(--accent-primary);font-size:22px}.dashboard-production-panel h2{margin:0 0 10px;color:var(--text-primary);font-size:18px}.dashboard-production-panel p{color:var(--text-secondary);font-size:12px}.dashboard-production-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light);font-size:12px}.dashboard-production-row span{display:grid;gap:4px}.dashboard-production-row small{color:var(--text-secondary);font-size:11px}.dashboard-production-row b{color:var(--accent-primary);font-size:12px;text-align:right}@media(max-width:900px){.dashboard-production-grid{grid-template-columns:1fr}}@media(max-width:640px){.dashboard-production-row{align-items:flex-start;flex-direction:column}.dashboard-production-row b{text-align:left}}`}</style>
  </div>;

  return <div className="dashboard-page">
    <div className="dashboard-heading page-heading"><div><span className="dashboard-eyebrow">GESTÃO DA CASA</span><h1>Dashboard</h1><p>Acompanhe o ritmo do Sabor de Abraço.</p></div><div className="dashboard-open">{data.comandasAbertas} comandas abertas</div></div>
    <DashboardTabs value={dashboardTab} onChange={setDashboardTab} />
    <div className="dashboard-periods">{['dia', 'semana', 'mes'].map((periodo) => { const metric = data.periodos[periodo]; return <section className="dashboard-period" key={periodo}><div className="dashboard-period-title"><h2>{labels[periodo]}</h2><span>{metric.pedidos} pedidos</span></div><strong className="dashboard-total">{money(metric.total)}</strong><div className="dashboard-stats"><span><b>{metric.itens}</b> itens</span><span><b>{money(metric.ticketMedio)}</b> ticket médio</span></div><div className="dashboard-products"><h3>Mais pedidos</h3>{metric.maisVendidos.length ? metric.maisVendidos.map((product) => <div className="dashboard-product" key={product.nome}><span>{product.nome}</span><b>{product.quantidade}</b></div>) : <p>Nenhum pedido no período.</p>}</div></section>; })}</div>
    <section className="dashboard-comparison">
      <div className="dashboard-section-heading"><div><span className="dashboard-eyebrow">ANÁLISE DE VENDAS</span><h2>Comparar períodos</h2><p>Escolha semanas ou meses para analisar a evolução das vendas.</p></div></div>
      <div className="dashboard-comparison-controls">
        <div className="dashboard-comparison-modes"><button type="button" className={comparacaoTipo === 'semana' ? 'active' : ''} onClick={() => setComparacaoTipo('semana')}>Semana a semana</button><button type="button" className={comparacaoTipo === 'mes' ? 'active' : ''} onClick={() => setComparacaoTipo('mes')}>Mês a mês</button></div>
        {comparacaoTipo === 'mes' ? <><label>Período principal<input type="month" value={comparacaoMesA} onChange={(event) => setComparacaoMesA(event.target.value)} /></label><label>Comparar com<input type="month" value={comparacaoMesB} onChange={(event) => setComparacaoMesB(event.target.value)} /></label></> : <><label>Semana principal<DateInput value={comparacaoSemanaA} onChange={setComparacaoSemanaA} /></label><label>Comparar com<DateInput value={comparacaoSemanaB} onChange={setComparacaoSemanaB} /></label></>}
      </div>
      {comparacaoVendas && <div className="dashboard-comparison-table-wrap"><table className="dashboard-comparison-table"><thead><tr><th>Indicador</th><th>{comparacaoVendas.periodoA.rotulo}</th><th>{comparacaoVendas.periodoB.rotulo}</th><th>Variação</th></tr></thead><tbody>{[['Receita', comparacaoVendas.periodoA.total, comparacaoVendas.periodoB.total, true], ['Pedidos', comparacaoVendas.periodoA.pedidos, comparacaoVendas.periodoB.pedidos, false], ['Itens vendidos', comparacaoVendas.periodoA.itens, comparacaoVendas.periodoB.itens, false], ['Ticket médio', comparacaoVendas.periodoA.ticketMedio, comparacaoVendas.periodoB.ticketMedio, true]].map(([nome, atual, anterior, monetario]) => <tr key={nome}><th>{nome}</th><td>{monetario ? money(atual) : atual}</td><td>{monetario ? money(anterior) : anterior}</td><td className={variacao(atual, anterior) >= 0 ? 'comparison-up' : 'comparison-down'}>{variacao(atual, anterior) >= 0 ? '+' : ''}{variacao(atual, anterior).toFixed(1)}%</td></tr>)}</tbody></table></div>}
    </section>
    {(alertasCusto.semCusto.length > 0 || alertasCusto.reajuste.length > 0) && <section className="dashboard-cost-alerts"><div className="dashboard-section-heading"><div><span className="dashboard-eyebrow">ATENÇÃO OPERACIONAL</span><h2>Alertas de custos</h2></div><a href="/producao">Abrir Produção</a></div><div className="dashboard-cost-alert-grid"><a href="/producao"><strong>{alertasCusto.semCusto.length}</strong><span>produtos sem custo cadastrado</span></a><a href="/producao"><strong>{alertasCusto.reajuste.length}</strong><span>produtos com reajuste recomendado</span></a></div></section>}
    <ProductSalesHistory products={produtos} topProducts={data.periodos?.mes?.maisVendidos || []} />
    <DashboardInsights insights={insights} />
    <section className="dashboard-comandas"><div className="dashboard-section-heading"><div><span className="dashboard-eyebrow">HISTÓRICO DE COMANDAS</span><h2>Comandas geradas</h2><p>Consulte comandas abertas, fechadas ou canceladas por período.</p></div><div className="dashboard-report-actions"><span className="dashboard-orders-count">{comandas.length}</span><button className="dashboard-toggle-button" onClick={() => alternarQuadro('comandas')}>{quadrosAbertos.comandas ? 'Ocultar' : 'Consultar'}</button></div></div>{quadrosAbertos.comandas && <><form className="dashboard-comandas-filter" onSubmit={consultarComandas}><label>De<input type="date" value={dataInicio} onChange={(event) => setDataInicio(event.target.value)} /></label><label>Até<input type="date" value={dataFim} onChange={(event) => setDataFim(event.target.value)} /></label><button className="dashboard-toggle-button" type="submit" disabled={carregandoComandas}>{carregandoComandas ? 'Consultando...' : 'Filtrar'}</button></form>{comandas.length ? <div className="dashboard-comandas-list">{Object.entries(comandasPorData).map(([data, comandasDoDia]) => <details className="dashboard-comandas-day" key={data}><summary><strong>{formatarDataComandas(data)}</strong><span>{comandasDoDia.length} comanda(s)</span></summary><div className="dashboard-comandas-day-list">{comandasDoDia.map((comanda) => { const total = comanda.itens?.reduce((sum, item) => sum + Number(item.precoUnitario || 0) * Number(item.quantidade || 0), 0); return <div className="dashboard-comanda" key={comanda._id}><div><strong>#{comanda.numero}</strong><span>{comanda.clienteNome || 'Cliente não identificado'}</span><div style={{ display: 'grid', gap: 3 }}><small>{new Date(comanda.createdAt).toLocaleString('pt-BR')} · {comanda.itens?.length || 0} itens · {comanda.atendente || 'Atendente não informado'}</small>{(Number(comanda.desconto || 0) > 0 || Boolean(comanda.utilizacaoInterna)) && <small style={{ display: 'block', color: 'var(--accent-primary)', fontWeight: 700 }}>{Number(comanda.desconto || 0) > 0 ? `Desconto: -${money(comanda.desconto)}` : ''}{Number(comanda.desconto || 0) > 0 && Boolean(comanda.utilizacaoInterna) ? ' · ' : ''}{Boolean(comanda.utilizacaoInterna) ? 'Uso interno' : ''}</small>}</div></div><div><b>{money(total)}</b><span className={`dashboard-comanda-status comanda-status-${comanda.status}`}>{statusLabels[comanda.status] || comanda.status}</span></div></div>; })}</div></details>)}</div> : <p className="dashboard-empty-orders">Nenhuma comanda encontrada no período.</p>}</>}</section>
    <section className="dashboard-stock"><div className="dashboard-section-heading"><div><span className="dashboard-eyebrow">RELATÓRIO DIÁRIO DE ESTOQUE</span><h2>Posição de estoque</h2><p>Abastecimento informado antes das 8h = 100% do dia.</p></div><div className="dashboard-report-actions"><span className="dashboard-orders-count">{produtos.length}</span><button className="dashboard-toggle-button" onClick={() => alternarQuadro('estoque')}>{quadrosAbertos.estoque ? 'Ocultar' : 'Mostrar'}</button></div></div>{quadrosAbertos.estoque && <><div className="dashboard-stock-legend"><span><i className="stock-good" /> Acima de 60%</span><span><i className="stock-warning" /> De 25% a 60%</span><span><i className="stock-danger" /> Abaixo de 25%</span></div>{estoque.length ? <div className="dashboard-stock-categories">{Object.entries(estoquePorCategoria).map(([categoria, itens]) => <div className="dashboard-stock-category" key={categoria}><h3>{categoria}<small>{itens.length} produto(s)</small></h3><div className="dashboard-stock-list">{itens.map((produto) => { const percentual = percentualEstoque(produto); const estoqueInicial = produto.estoqueInicialData === dataLocal ? produto.estoqueInicialDia : produto.estoque; return <div className="dashboard-stock-item" key={produto._id}><div><strong>{produto.nome}</strong><small>Código {produto.codigo} · {produto.estoque} de {estoqueInicial} un. no início do dia</small><div className="dashboard-stock-bar"><span className={classeEstoque(percentual)} style={{ width: `${percentual}%` }} /></div></div><b className={classeEstoque(percentual)}>{percentual}%</b></div>; })}</div></div>)}</div> : <p className="dashboard-empty-orders">Nenhum produto cadastrado.</p>}</>}</section>
    <section className="dashboard-customers"><div className="dashboard-section-heading"><div><span className="dashboard-eyebrow">BASE DE CLIENTES</span><h2>Clientes cadastrados</h2><p>Nome e telefone para futuras ações de marketing.</p></div><div className="dashboard-report-actions"><span className="dashboard-orders-count">{relatorioClientes.totalCadastrados || data.clientesCadastrados || 0}</span><button className="dashboard-print-button" onClick={exportarClientesMailing}>⬇️ Exportar</button><button className="dashboard-print-button" onClick={imprimirRelatorioClientes}>🖨️ Imprimir</button><button className="dashboard-toggle-button" onClick={() => alternarQuadro('clientes')}>{quadrosAbertos.clientes ? 'Ocultar' : 'Mostrar'}</button></div></div>{quadrosAbertos.clientes && <div className="dashboard-customer-list">{relatorioClientes.clientes.length ? relatorioClientes.clientes.map((cliente) => <div className="dashboard-customer" key={String(cliente.id)}><strong>{cliente.nome}</strong><span>{cliente.telefone || 'Telefone não informado'}</span></div>) : <p className="dashboard-empty-orders">Nenhum cliente cadastrado.</p>}</div>}</section>
    <section className="dashboard-monthly"><div className="dashboard-section-heading"><div><span className="dashboard-eyebrow">FECHAMENTO DO MÊS</span><h2>Relatório mensal completo</h2><p>{relatorioMes.periodo || 'Período atual'} · vendas, recebimentos e pendências.</p></div><div className="dashboard-report-actions"><button className="dashboard-print-button" onClick={imprimirRelatorioMes}>🖨️ Imprimir relatório</button><button className="dashboard-toggle-button" onClick={() => alternarQuadro('mensal')}>{quadrosAbertos.mensal ? 'Ocultar' : 'Mostrar'}</button></div></div>{quadrosAbertos.mensal && <><div className="dashboard-monthly-summary"><div><small>Vendas</small><b>{money(relatorioMes.total)}</b></div><div><small>Recebido</small><b className="sales-received">{money(relatorioMes.recebido)}</b></div><div><small>A receber</small><b className="sales-pending">{money(relatorioMes.pendente)}</b></div><div><small>Pedidos</small><b>{relatorioMes.pedidos}</b></div><div><small>Clientes</small><b>{relatorioMes.clientes}</b></div></div><div className="dashboard-monthly-columns"><div><h3>Formas de pagamento</h3>{relatorioMes.pagamentos.length ? relatorioMes.pagamentos.map((pagamento) => <div className="dashboard-monthly-row" key={pagamento.tipo}><span>{paymentLabels[pagamento.tipo] || pagamento.tipo}</span><b>{money(pagamento.total)}</b></div>) : <p className="dashboard-empty-orders">Nenhum pagamento registrado.</p>}</div><div><h3>Produtos mais vendidos</h3>{relatorioMes.produtos.length ? relatorioMes.produtos.slice(0, 5).map((produto) => <div className="dashboard-monthly-row" key={produto.nome}><span>{produto.quantidade}x {produto.nome}</span><b>{money(produto.total)}</b></div>) : <p className="dashboard-empty-orders">Nenhuma venda registrada.</p>}</div></div></>}</section>
    <section className="dashboard-orders"><div className="dashboard-section-heading"><div><span className="dashboard-eyebrow">ACOMPANHAMENTO DO DIA</span><h2>Pedidos e vendas de hoje</h2><p>Resumo financeiro e movimento mais recente da casa.</p></div><div className="dashboard-report-actions"><strong className="dashboard-sales-total">{money(vendasHoje.total)}</strong><span className="dashboard-orders-count">{pedidosHoje.length}</span><button className="dashboard-toggle-button" onClick={() => alternarQuadro('pedidos')}>{quadrosAbertos.pedidos ? 'Ocultar' : 'Mostrar'}</button></div></div>{quadrosAbertos.pedidos && <><div className="dashboard-sales-summary"><div><small>Pedidos</small><b>{vendasHoje.pedidos}</b></div><div><small>Itens vendidos</small><b>{vendasHoje.itens}</b></div><div><small>Ticket médio</small><b>{money(vendasHoje.pedidos ? vendasHoje.total / vendasHoje.pedidos : 0)}</b></div><div><small>Recebido</small><b className="sales-received">{money(vendasHoje.recebido)}</b></div><div><small>A receber</small><b className="sales-pending">{money(vendasHoje.pendente)}</b></div></div>{pedidosHoje.length ? <div className="dashboard-orders-list">{pedidosHoje.map((pedido) => <div className="dashboard-order" key={pedido._id}><div><strong>#{pedido.numero}</strong><span>{pedido.clienteNome || 'Cliente não identificado'}</span><small>{new Date(pedido.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {pedido.itens?.length || 0} itens</small></div><div><b>{money(pedido.total)}</b><span className={`dashboard-order-status status-${pedido.status}`}>{pedido.status}</span></div></div>)}</div> : <p className="dashboard-empty-orders">Nenhum pedido registrado hoje.</p>}</>}</section>
    {comandaSelecionada && <div className="dashboard-comanda-modal" onClick={() => setComandaSelecionada(null)}><div className="dashboard-comanda-receipt" onClick={(event) => event.stopPropagation()}><div className="dashboard-receipt-header"><strong>SABOR DE ABRAÇO</strong><span>COMANDA #{comandaSelecionada.numero}</span><small>{new Date(comandaSelecionada.createdAt).toLocaleString('pt-BR')}</small></div><div className="dashboard-receipt-meta"><div>Cliente: <b>{comandaSelecionada.clienteNome || 'Cliente não identificado'}</b></div><div>Atendente: <b>{comandaSelecionada.atendente || 'Não informado'}</b></div>{comandaSelecionada.observacao && <div>Observação: <b>{comandaSelecionada.observacao}</b></div>}</div><div className="dashboard-receipt-items">{(comandaSelecionada.itens || []).map((item) => <div className="dashboard-receipt-item" key={item._id}><span>{item.quantidade}x {item.nome}<small>{money(item.precoUnitario)} cada</small></span><b>{money(Number(item.precoUnitario || 0) * Number(item.quantidade || 0))}</b></div>)}</div><div className="dashboard-receipt-total"><span>TOTAL</span><b>{money((comandaSelecionada.itens || []).reduce((total, item) => total + Number(item.precoUnitario || 0) * Number(item.quantidade || 0), 0))}</b></div><div className="dashboard-receipt-status">Status: {statusLabels[comandaSelecionada.status] || comandaSelecionada.status}</div><div className="dashboard-receipt-contact"><label>Nome do cliente<input value={nomeComanda} onChange={(event) => setNomeComanda(event.target.value)} placeholder="Nome do cliente" /></label><label>Telefone para WhatsApp<input type="tel" value={telefoneComanda} onChange={(event) => setTelefoneComanda(event.target.value)} placeholder="(00) 00000-0000" /></label></div><div className="dashboard-receipt-actions"><button className="dashboard-receipt-print" onClick={imprimirComanda}>🖨️ Imprimir</button><button className="dashboard-receipt-whatsapp" onClick={enviarComandaWhatsApp}>💬 WhatsApp</button></div><button className="dashboard-toggle-button" onClick={() => setComandaSelecionada(null)}>Fechar</button></div></div>}
    <style>{`
      .dashboard-page { color: var(--text-primary); }
      .dashboard-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:20px; }
      .dashboard-eyebrow { color:var(--accent-primary); font-size:10px; font-weight:800; letter-spacing:.1em; }
      .dashboard-heading p { margin:0; color:var(--text-secondary); font-size:13px; }
      .dashboard-open { padding:10px 13px; border:1px solid var(--accent-border); border-radius:10px; background:var(--accent-light); color:var(--accent-primary); font-size:12px; font-weight:800; }
      .dashboard-periods { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; }
      .dashboard-period { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; padding:18px; box-shadow:var(--shadow-sm); }
      .dashboard-comparison { margin-top:16px; padding:18px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; box-shadow:var(--shadow-sm); }
      .dashboard-comparison-controls { display:grid; grid-template-columns:auto repeat(2, minmax(0, 1fr)); align-items:end; gap:12px; margin-bottom:16px; }
      .dashboard-comparison-controls label { display:grid; gap:5px; color:var(--text-secondary); font-size:11px; font-weight:700; }
      .dashboard-comparison-controls input { min-height:38px; padding:8px 10px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-tertiary); color:var(--text-primary); }
      .dashboard-comparison-modes { display:flex; gap:6px; }
      .dashboard-comparison-modes button { min-height:38px; padding:8px 11px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-tertiary); color:var(--text-secondary); font-weight:700; cursor:pointer; white-space:nowrap; }
      .dashboard-comparison-modes button.active { border-color:var(--accent-primary); background:var(--accent-primary); color:#fff; }
      .dashboard-comparison-table-wrap { overflow-x:auto; }
      .dashboard-comparison-table { width:100%; min-width:620px; border-collapse:collapse; }
      .dashboard-comparison-table th, .dashboard-comparison-table td { padding:11px 10px; border-bottom:1px solid var(--border-light); text-align:right; font-size:12px; }
      .dashboard-comparison-table th:first-child, .dashboard-comparison-table td:first-child { text-align:left; }
      .dashboard-comparison-table th { color:var(--text-secondary); font-size:11px; text-transform:uppercase; }
      .dashboard-comparison-table td { color:var(--text-primary); }
      .comparison-up { color:var(--success-bg) !important; font-weight:800; }
      .comparison-down { color:var(--error-bg) !important; font-weight:800; }
      .dashboard-cost-alerts { margin-top:16px; padding:18px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; box-shadow:var(--shadow-sm); }
      .dashboard-cost-alerts a { color:var(--accent-primary); font-size:12px; font-weight:700; text-decoration:none; }
      .dashboard-cost-alert-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
      .dashboard-cost-alert-grid a { display:grid; gap:4px; padding:12px; border:1px solid var(--accent-border); border-radius:10px; background:var(--accent-light); }
      .dashboard-cost-alert-grid strong { font-size:22px; }
      .dashboard-cost-alert-grid span { color:var(--text-secondary); }
      .dashboard-period-title { display:flex; justify-content:space-between; align-items:center; gap:8px; }
      .dashboard-period-title h2 { margin:0; font-size:16px; color:var(--text-primary); }
      .dashboard-period-title span { color:var(--text-secondary); font-size:11px; }
      .dashboard-total { display:block; margin:18px 0 12px; color:var(--accent-primary); font-size:28px; font-variant-numeric:tabular-nums; }
      .dashboard-stats { display:flex; gap:14px; padding-bottom:16px; border-bottom:1px solid var(--border-light); color:var(--text-secondary); font-size:11px; }
      .dashboard-stats b { display:block; color:var(--text-primary); font-size:14px; }
      .dashboard-products h3 { margin:16px 0 8px; font-size:12px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.06em; }
      .dashboard-product { display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px solid var(--border-light); font-size:12px; }
      .dashboard-product b { color:var(--accent-primary); }
      .dashboard-products p, .dashboard-loading { color:var(--text-secondary); font-size:13px; }
      .dashboard-orders { margin-top:16px; padding:18px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; box-shadow:var(--shadow-sm); }
      .dashboard-comandas { margin-top:16px; padding:18px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; box-shadow:var(--shadow-sm); }
      .dashboard-comandas-filter { display:flex; align-items:flex-end; gap:10px; margin-bottom:14px; }
      .dashboard-comandas-filter label { display:grid; gap:4px; color:var(--text-secondary); font-size:11px; font-weight:700; }
      .dashboard-comandas-filter input { min-height:36px; padding:7px 9px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-tertiary); color:var(--text-primary); }
      .dashboard-comandas-list { display:grid; gap:8px; }
      .dashboard-comandas-day { border:1px solid var(--border-light); border-radius:10px; background:var(--bg-tertiary); overflow:hidden; }
      .dashboard-comandas-day summary { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:13px 14px; cursor:pointer; color:var(--text-primary); list-style-position:inside; }
      .dashboard-comandas-day summary::marker { color:var(--accent-primary); }
      .dashboard-comandas-day summary span { color:var(--text-secondary); font-size:12px; }
      .dashboard-comandas-day-list { display:grid; gap:8px; padding:0 8px 8px; }
      .dashboard-comanda { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:12px; border:1px solid var(--border-light); border-radius:10px; background:var(--bg-tertiary); }
      .dashboard-comanda { cursor:pointer; }
      .dashboard-comanda:hover { border-color:var(--accent-primary); }
      .dashboard-comanda > div { display:flex; align-items:center; gap:10px; min-width:0; }
      .dashboard-comanda > div:first-child { flex:1; }
      .dashboard-comanda strong, .dashboard-comanda b { color:var(--accent-primary); }
      .dashboard-comanda span { color:var(--text-primary); font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .dashboard-comanda small { color:var(--text-secondary); font-size:11px; }
      .dashboard-comanda b { white-space:nowrap; }
      .dashboard-comanda-status { padding:4px 8px; border-radius:20px; background:var(--accent-light); color:var(--accent-primary) !important; font-size:10px !important; font-weight:800; }
      .comanda-status-fechada { background:rgba(22,163,74,.12); color:var(--success-bg) !important; }
      .comanda-status-cancelada { background:rgba(220,38,38,.12); color:var(--error-bg) !important; }
      .dashboard-comanda-modal { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(20,14,10,.62); }
      .dashboard-comanda-receipt { width:100%; max-width:390px; max-height:calc(100vh - 36px); overflow:auto; padding:24px 20px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-secondary); color:var(--text-primary); box-shadow:var(--shadow-lg); font-family:'Courier New', monospace; }
      .dashboard-receipt-header { display:grid; gap:4px; padding-bottom:14px; border-bottom:1px dashed var(--border-color); text-align:center; }
      .dashboard-receipt-header::before { content:''; display:block; width:52px; height:52px; margin:0 auto 4px; background:url('/Abraco1.png') center/contain no-repeat; }
      .dashboard-receipt-header strong { font-size:17px; }
      .dashboard-receipt-header span { font-size:14px; font-weight:700; }
      .dashboard-receipt-header small, .dashboard-receipt-meta { color:var(--text-secondary); font-size:11px; }
      .dashboard-receipt-meta { display:grid; gap:5px; padding:14px 0; border-bottom:1px dashed var(--border-color); }
      .dashboard-receipt-meta b { color:var(--text-primary); }
      .dashboard-receipt-items { padding:8px 0; }
      .dashboard-receipt-item, .dashboard-receipt-total { display:flex; justify-content:space-between; gap:12px; padding:8px 0; }
      .dashboard-receipt-item { border-bottom:1px dotted var(--border-light); font-size:12px; }
      .dashboard-receipt-item span { display:grid; gap:3px; }
      .dashboard-receipt-item small { color:var(--text-secondary); font-size:10px; }
      .dashboard-receipt-item b, .dashboard-receipt-total b { white-space:nowrap; }
      .dashboard-receipt-total { margin-top:4px; border-top:2px solid var(--text-primary); font-size:16px; font-weight:700; }
      .dashboard-receipt-status { margin:8px 0 18px; color:var(--text-secondary); font-size:11px; text-align:center; }
      .dashboard-receipt-contact { display:grid; gap:9px; margin-bottom:14px; font-family:inherit; }
      .dashboard-receipt-contact label { display:grid; gap:4px; color:var(--text-secondary); font-size:11px; font-weight:700; }
      .dashboard-receipt-contact input { width:100%; box-sizing:border-box; min-height:38px; padding:8px 10px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-tertiary); color:var(--text-primary); font-family:inherit; }
      .dashboard-receipt-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
      .dashboard-receipt-actions button { min-height:42px; border:0; border-radius:8px; color:#fff; font-weight:700; cursor:pointer; }
      .dashboard-receipt-print { background:var(--brand-brown, #7c4b1e); }
      .dashboard-receipt-whatsapp { background:#25d366; }
      .dashboard-comanda-modal .dashboard-toggle-button { width:100%; }
      .dashboard-stock { margin-top:16px; padding:18px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; box-shadow:var(--shadow-sm); }
      .dashboard-customers, .dashboard-sales { margin-top:16px; padding:18px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; box-shadow:var(--shadow-sm); }
      .dashboard-monthly { margin-top:16px; padding:18px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; box-shadow:var(--shadow-sm); }
      .dashboard-client-report { margin-top:16px; padding:18px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; box-shadow:var(--shadow-sm); }
      .dashboard-report-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
      .dashboard-client-report-list { display:grid; gap:8px; }
      .dashboard-client-report-row { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:11px 12px; border:1px solid var(--border-light); border-radius:10px; background:var(--bg-tertiary); }
      .dashboard-client-report-row strong, .dashboard-client-report-row small { display:block; }
      .dashboard-client-report-row strong { color:var(--text-primary); font-size:13px; }
      .dashboard-client-report-row small { margin-top:4px; color:var(--text-secondary); font-size:11px; }
      .dashboard-client-report-row b { color:var(--accent-primary); white-space:nowrap; }
      .dashboard-print-button { border:1px solid var(--accent-border); border-radius:8px; padding:8px 11px; background:var(--accent-light); color:var(--accent-primary); font-weight:700; cursor:pointer; white-space:nowrap; }
      .dashboard-toggle-button { border:1px solid var(--accent-primary); border-radius:8px; padding:8px 11px; background:var(--accent-primary); color:#fff; font-weight:700; cursor:pointer; white-space:nowrap; }
      .dashboard-monthly-summary { display:grid; grid-template-columns:repeat(5, 1fr); gap:8px; margin-bottom:14px; }
      .dashboard-monthly-summary div { padding:10px; border:1px solid var(--border-light); border-radius:10px; background:var(--bg-tertiary); }
      .dashboard-monthly-summary small, .dashboard-monthly-summary b { display:block; }
      .dashboard-monthly-summary small { color:var(--text-secondary); font-size:11px; }
      .dashboard-monthly-summary b { margin-top:4px; color:var(--text-primary); font-size:14px; }
      .dashboard-monthly-summary .sales-received { color:var(--success-bg); }
      .dashboard-monthly-summary .sales-pending { color:var(--warning-bg); }
      .dashboard-monthly-columns { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
      .dashboard-monthly-columns h3 { margin:0 0 8px; color:var(--text-secondary); font-size:12px; text-transform:uppercase; }
      .dashboard-monthly-row { display:flex; justify-content:space-between; gap:8px; padding:7px 0; border-bottom:1px solid var(--border-light); color:var(--text-primary); font-size:12px; }
      .dashboard-monthly-row b { color:var(--accent-primary); white-space:nowrap; }
      .dashboard-customer-list, .dashboard-sales-list { display:grid; gap:8px; }
      .dashboard-customer, .dashboard-sale { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:11px 12px; border:1px solid var(--border-light); border-radius:10px; background:var(--bg-tertiary); }
      .dashboard-customer strong, .dashboard-customer small { display:block; }
      .dashboard-customer strong { color:var(--text-primary); font-size:13px; }
      .dashboard-customer small { margin-top:4px; color:var(--text-secondary); font-size:11px; }
      .dashboard-customer > span { color:var(--accent-primary); font-size:11px; font-weight:700; white-space:nowrap; }
      .dashboard-sales-total { color:var(--accent-primary); font-size:20px; white-space:nowrap; }
      .dashboard-sales-summary { display:grid; grid-template-columns:repeat(5, 1fr); gap:8px; margin-bottom:14px; }
      .dashboard-sales-summary div { padding:10px; border:1px solid var(--border-light); border-radius:10px; background:var(--bg-tertiary); }
      .dashboard-sales-summary small, .dashboard-sales-summary b { display:block; }
      .dashboard-sales-summary small { color:var(--text-secondary); font-size:11px; }
      .dashboard-sales-summary b { margin-top:4px; color:var(--text-primary); font-size:15px; }
      .dashboard-sales-summary .sales-received { color:var(--success-bg); }
      .dashboard-sales-summary .sales-pending { color:var(--warning-bg); }
      .dashboard-sale span { color:var(--text-primary); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .dashboard-sale strong { color:var(--accent-primary); margin-right:8px; }
      .dashboard-sale b { color:var(--accent-primary); white-space:nowrap; }
      .sale-status { font-size:10px; font-weight:600; text-transform:uppercase; }
      .sale-status-pendente, .sale-status-parcial { color:var(--warning-bg) !important; }
      .sale-status-pago { color:var(--success-bg) !important; }
      .dashboard-stock-list { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px; }
      .dashboard-stock-item { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px; border:1px solid var(--border-light); border-radius:10px; background:var(--bg-tertiary); }
      .dashboard-stock-item strong, .dashboard-stock-item small { display:block; }
      .dashboard-stock-item strong { color:var(--text-primary); font-size:13px; }
      .dashboard-stock-item small { margin-top:4px; color:var(--text-secondary); font-size:11px; }
      .dashboard-stock-item b { color:var(--accent-primary); white-space:nowrap; }
      .dashboard-stock-category h3 { display:flex; justify-content:space-between; margin:0 0 8px; color:var(--text-primary); font-size:13px; }
      .dashboard-stock-category h3 small { color:var(--text-secondary); font-size:11px; font-weight:400; }
      .dashboard-stock-categories { display:grid; gap:18px; }
      .dashboard-stock-legend { display:flex; flex-wrap:wrap; gap:12px; margin:-4px 0 16px; color:var(--text-secondary); font-size:11px; }
      .dashboard-stock-legend span { display:flex; align-items:center; gap:5px; }
      .dashboard-stock-legend i { width:9px; height:9px; border-radius:50%; display:inline-block; }
      .dashboard-stock-legend .stock-good { background:var(--success-bg); }
      .dashboard-stock-legend .stock-warning { background:var(--warning-bg); }
      .dashboard-stock-legend .stock-danger { background:var(--error-bg); }
      .dashboard-stock-bar { height:6px; margin-top:7px; overflow:hidden; border-radius:6px; background:var(--border-light); }
      .dashboard-stock-bar span { display:block; height:100%; border-radius:inherit; }
      .dashboard-stock-item .stock-good { color:var(--success-bg); background:var(--success-bg); }
      .dashboard-stock-item .stock-warning { color:var(--warning-bg); background:var(--warning-bg); }
      .dashboard-stock-item .stock-danger { color:var(--error-bg); background:var(--error-bg); }
      .dashboard-section-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px; }
      .dashboard-section-heading h2 { margin:4px 0; font-size:18px; color:var(--text-primary); }
      .dashboard-section-heading p { margin:0; color:var(--text-secondary); font-size:12px; }
      .dashboard-orders-count { min-width:30px; padding:5px 9px; border-radius:20px; background:var(--accent-light); color:var(--accent-primary); font-weight:800; text-align:center; }
      .dashboard-orders-list { display:grid; gap:8px; }
      .dashboard-order { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:12px; border:1px solid var(--border-light); border-radius:10px; background:var(--bg-tertiary); }
      .dashboard-order > div { display:flex; align-items:center; gap:10px; min-width:0; }
      .dashboard-order > div:first-child { flex:1; }
      .dashboard-order strong { color:var(--accent-primary); }
      .dashboard-order span { color:var(--text-primary); font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .dashboard-order small { color:var(--text-secondary); font-size:11px; }
      .dashboard-order b { color:var(--accent-primary); white-space:nowrap; }
      .dashboard-order-status { padding:4px 8px; border-radius:20px; background:var(--accent-light); color:var(--accent-primary) !important; font-size:10px !important; font-weight:800; }
      .status-pago { background:rgba(22,163,74,.12); color:var(--success-bg) !important; }
      .status-cancelado { background:rgba(220,38,38,.12); color:var(--error-bg) !important; }
      .dashboard-empty-orders { margin:0; color:var(--text-secondary); font-size:13px; }
      .dashboard-loading { padding:40px; text-align:center; }
      @media (max-width:900px) { .dashboard-periods { grid-template-columns:1fr; } }
      @media (max-width:900px) { .dashboard-comparison-controls { grid-template-columns:1fr 1fr; } .dashboard-comparison-modes { grid-column:1 / -1; } }
      @media (max-width:520px) { .dashboard-heading { align-items:flex-start; flex-direction:column; } .dashboard-order { align-items:flex-start; flex-direction:column; gap:8px; } .dashboard-order > div:last-child { width:100%; justify-content:space-between; } }
      @media (max-width:900px) { .dashboard-sales-summary { grid-template-columns:repeat(3, 1fr); } }
      @media (max-width:520px) { .dashboard-sales-summary { grid-template-columns:1fr; } .dashboard-section-heading { flex-wrap:wrap; } }
      @media (max-width:900px) { .dashboard-monthly-summary { grid-template-columns:repeat(3, 1fr); } .dashboard-monthly-columns { grid-template-columns:1fr; } }
      @media (max-width:520px) { .dashboard-monthly-summary { grid-template-columns:1fr; } .dashboard-print-button { width:100%; } }
      @media (max-width:520px) { .dashboard-cost-alert-grid { grid-template-columns:1fr; } }
      @media (max-width:520px) { .dashboard-comparison-controls { grid-template-columns:1fr; } .dashboard-comparison-modes { display:grid; grid-template-columns:1fr 1fr; } .dashboard-comparison-modes button { width:100%; } }
      @media (max-width:520px) { .dashboard-comandas-filter { align-items:stretch; flex-direction:column; } .dashboard-comandas-filter input, .dashboard-comandas-filter button { width:100%; box-sizing:border-box; } .dashboard-comandas-day summary { align-items:flex-start; flex-direction:column; gap:4px; } .dashboard-comanda { align-items:flex-start; flex-direction:column; gap:8px; } .dashboard-comanda > div:last-child { width:100%; justify-content:space-between; } }
    `}</style>
  </div>;
}
