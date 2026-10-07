import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarOperacoesFinanceiras } from '../src/utils/operacaoFinanceira.js';

const source = readFileSync(new URL('../src/pages/PDV.jsx', import.meta.url), 'utf8');

test('adicionar produto atualiza a comanda usando o setter acessível ao handler', () => {
  const pricing = source.slice(source.indexOf('  const recalcularPrecosCarrinho = '), source.indexOf('  const adicionarItem = '));
  let comanda = { tipo: 'balcao', itens: [], status: 'rascunho' };
  const product = { _id: 'cafe', preco: 6 };
  const setCarrinho = new Function('setComandaAtual', 'produtos', 'precoComDesconto', 'precoComDescontoGrupo', 'precoPorUnidade', `${pricing}; return setCarrinho;`)(
    update => { comanda = update(comanda); }, [product],
    (_product, _quantity, base) => ({ precoUnitario: base, precoNormal: base, economiaTotal: 0 }),
    () => null, product => product.preco,
  );
  setCarrinho([{ produtoId: 'cafe', quantidade: 1, precoUnitarioOriginal: 6 }]);
  assert.equal(comanda.itens[0].precoUnitario, 6);
  assert.equal(comanda.status, 'rascunho');
  setCarrinho(items => items.map(item => ({ ...item, quantidade: 2 })));
  assert.equal(comanda.itens[0].quantidade, 2);
  setCarrinho(items => items.map(item => ({ ...item, precoUnitarioManual: 0, precoUnitario: 0 })));
  assert.equal(comanda.itens[0].precoUnitario, 0, 'preço manual deve sobreviver ao recálculo');
  setCarrinho([]);
  assert.deepEqual(comanda.itens, []);
});

test('fechamento envia identificador financeiro e limpa a comanda só após confirmação', async () => {
  const context = readFileSync(new URL('../src/context/ComandaContext.jsx', import.meta.url), 'utf8');
  const code = context.slice(context.indexOf('  const fecharComanda = '), context.indexOf('  const limparComanda = '));
  let cleared = false;
  const api = { post: async (_url, payload) => {
    assert.ok(payload.operacaoId, 'backend exige operacaoId no fechamento');
    assert.equal(cleared, false);
    return { data: { pedido: { total: 6 } } };
  } };
  const operacoesFinanceiras = criarOperacoesFinanceiras(api, { storage: null });
  const close = new Function('useCallback', 'comandaAtual', 'salvarComandaAberta', 'api', 'operacoesFinanceiras', 'setComandaAtual', 'novaComanda', `${code}; return fecharComanda;`)(
    fn => fn, { _id: 'comanda-1' }, () => { throw new Error('não deve recriar comanda salva'); }, api,
    operacoesFinanceiras, () => { cleared = true; }, () => ({ itens: [] }),
  );
  const result = await close({ metodoPagamento: 'dinheiro' });
  assert.equal(result.pedido.total, 6);
  assert.equal(cleared, true);
});
