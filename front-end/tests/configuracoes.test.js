import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/context/ConfiguracoesContext.jsx', import.meta.url), 'utf8')
  .split('export const ConfiguracoesProvider = ({ children }) => {')[1].split(/\r?\n {2}return \(/)[0];
const runtime = get => {
  const states = [];
  let cursor, previousDeps, cleanup, effect;
  const bindings = {
    useContext: () => bindings.auth, AuthContext: {}, api: { get },
    useState: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = value; }];
    },
    useEffect: (run, deps) => {
      if (!previousDeps || deps.some((dep, index) => dep !== previousDeps[index])) {
        cleanup?.();
        previousDeps = deps;
        effect = run;
      }
    },
  };
  const render = new Function(...Object.keys(bindings), source);
  return {
    states,
    async render(auth) {
      bindings.auth = auth;
      cursor = 0;
      render(...Object.values(bindings));
      if (effect) { cleanup = effect(); effect = null; }
      await new Promise(resolve => setImmediate(resolve));
    },
  };
};

test('settings wait for authentication and load after admin login without remounting', async () => {
  const calls = [];
  const app = runtime(async url => {
    calls.push(url);
    return { data: { exigirAutorizacaoGerente: false, bloqueadoPorSuporte: true } };
  });
  await app.render({ user: null, loading: true });
  assert.deepEqual(calls, []);
  await app.render({ user: null, loading: false });
  assert.deepEqual(calls, []);
  await app.render({ user: { id: 'admin', role: 'admin' }, loading: false });
  assert.deepEqual(calls, ['/configuracoes']);
  assert.deepEqual(app.states, [false, true, false]);
  await app.render({ user: { id: 'admin', role: 'admin' }, loading: false });
  assert.equal(calls.length, 1);
  await app.render({ user: null, loading: false });
  assert.deepEqual(app.states, [true, false, false]);
  await app.render({ user: { id: 'operator', role: 'operador' }, loading: false });
  assert.equal(calls.length, 1);
});

test('a settings response arriving after logout cannot replace safe defaults', async () => {
  let finish;
  const app = runtime(() => new Promise(resolve => { finish = resolve; }));
  await app.render({ user: { id: 'admin', role: 'admin' }, loading: false });
  await app.render({ user: null, loading: false });
  finish({ data: { exigirAutorizacaoGerente: false, bloqueadoPorSuporte: true } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(app.states, [true, false, false]);
});
