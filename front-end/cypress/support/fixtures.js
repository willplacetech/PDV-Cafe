export const cafe = {
  _id: 'cafe-e2e', codigo: '1', nome: 'Café', categoria: 'Bebidas Quentes',
  tipo: 'venda', tipoProduto: 'revenda', preco: 16, estoque: 100, unidadeVenda: 'un',
  ativo: true, grupoDesconto: { nome: 'Cafés', ativo: true, quantidadeMinima: 3, precoPromocional: 14 },
};
const metric = { total: 0, pedidos: 0, itens: 0, ticketMedio: 0, maisVendidos: [] };

export function instalarApiLocal() {
  let appWindow;
  let customers = [];
  let products = [cafe, { _id: 'insumo-e2e', nome: 'Farinha', tipo: 'insumo', categoria: 'Insumos' }];
  let comandas = [];
  cy.on('window:before:load', win => { appWindow = win; });
  // Unmatched requests fail locally instead of reaching a real API.
  cy.intercept('**/api/**', req => {
    const path = new URL(req.url).pathname.replace(/^\/api/, '');
    if (/^\/(auth|delivery|entregador)\/refresh$/.test(path)) {
      const key = path.startsWith('/auth/') ? 'pdv_user' : path.startsWith('/delivery/') ? 'delivery_admin' : 'delivery_entregador';
      const cached = JSON.parse(appWindow?.localStorage.getItem(key) || 'null');
      const user = key === 'pdv_user' ? cached : cached?.user;
      return req.reply(user ? { user, token: 'isolated-access-token' } : { statusCode: 401, body: { msg: 'Sem sessão de teste' } });
    }
    if (path === '/auth/logout') return req.reply({ statusCode: 204 });
    if (req.method === 'GET') {
      const responses = {
        '/products': products, '/products/pdv': products.filter(product => product.tipo === 'venda'),
        '/products/mais-vendidos': [], '/products/sem-custo': [], '/products/reajuste-recomendado': [],
        '/customers': customers, '/comandas': comandas, '/orders': [],
        '/mesas': { mesas: [], oferecerBalcao: true },
        '/payment-settings': { formasPagamento: [{ value: 'dinheiro', label: 'Dinheiro' }, { value: 'pix', label: 'Pix' }, { value: 'credito_loja', label: 'Crédito na loja' }] },
        '/dashboard': { comandasAbertas: 0, periodos: { dia: metric, semana: metric, mes: metric } },
        '/dashboard/comparar-vendas': { periodoA: metric, periodoB: metric },
        '/dashboard/receita-7-dias': [], '/dashboard/urgencias': [], '/estoque/baixo': [],
        '/contas-receber/resumo': { total: 0, clientes: [] }, '/despesas/central-resumo': { total: 0, proximas: [] },
        '/dashboard/historico-produtos': { pontos: [], resumo: { quantidade: 0, total: 0, pedidos: 0 } },
        '/dashboard/delivery': { totalPedidos: 0, receitaTotal: 0, porEntregador: [] },
        '/production/dashboard': { receitasPossiveis: [], baixoEstoque: [], producoesRecentes: [] },
        '/recipes': [], '/fiscal/config': { habilitado: false, faltantes: [] },
        '/entregas/estatisticas': { prontos: 0, despachados: 0 },
      };
      if (path in responses) return req.reply(responses[path]);
    }
    if (req.method === 'POST' && path === '/customers') {
      const customer = { ...req.body, _id: 'customer-e2e' };
      customers = [...customers, customer];
      return req.reply({ statusCode: 201, body: customer });
    }
    if (req.method === 'POST' && path === '/products') {
      const product = { ...req.body, _id: 'created-product-e2e' };
      products = [...products, product];
      return req.reply({ statusCode: 201, body: product });
    }
    if (req.method === 'POST' && path === '/comandas') {
      const itens = req.body.itens.map((item, index) => ({ ...item, _id: `item-${index}`, nome: cafe.nome, precoUnitario: cafe.preco }));
      const command = { ...req.body, _id: 'comanda-e2e', numero: '1', status: 'aberta', itens,
        valorTotal: itens.reduce((sum, item) => sum + item.quantidade * item.precoUnitario, 0), historicoPagamentos: [] };
      comandas = [...comandas, command];
      return req.reply({ statusCode: 201, body: command });
    }
    return req.reply({ statusCode: 501, body: { msg: `Fixture ausente: ${req.method} ${path}` } });
  });
}
