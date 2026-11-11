import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as roleAccess from '../src/permissions/roleAccess.js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/components/Layout.jsx', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export default ', '');
const { code } = await transformWithOxc(source, 'Layout.jsx', { jsx: { runtime: 'classic' } });
const authContext = React.createContext({ user: { id: 'test', role: 'admin' }, logout() {} });
const themeContext = React.createContext({ isDark: false, toggleTheme() {} });
const openGroups = { atendimento: true, cadastro: true, compras: true, producao: true, financeiro: true, pessoas: true, configuracoes: true };
const staticUseState = (initial) => [
  initial && typeof initial === 'object' && Object.hasOwn(initial, 'atendimento') ? openGroups : initial,
  () => {},
];
const Layout = new Function('React', 'Outlet', 'Link', 'useNavigate', 'useLocation', 'useContext', 'useState', 'useEffect', 'useCallback', 'AuthContext', 'ThemeContext', 'roleAccess', 'APP_GIT_HASH', 'StatusConexao', 'NovidadesModal', `${code}; return Layout;`)(
  React, Outlet, Link, useNavigate, useLocation, React.useContext, staticUseState, () => {}, callback => callback,
  authContext, themeContext, roleAccess, 'test', () => null, () => null,
);

const renderLayoutForRole = (role) => renderToStaticMarkup(React.createElement(
  authContext.Provider,
  { value: { user: { id: 'test', role, tenantId: null }, logout() {} } },
  React.createElement(themeContext.Provider, { value: { isDark: false, toggleTheme() {} } },
    React.createElement(MemoryRouter, null, React.createElement(Layout))),
));

test('authenticated layout renders the nested route instead of a blank page', () => {
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/dashboard'] },
    React.createElement(Routes, null,
      React.createElement(Route, { element: React.createElement(Layout) },
        React.createElement(Route, { path: '/dashboard', element: React.createElement('h1', null, 'Dashboard') })))));
  assert.match(html, /<h1>Dashboard<\/h1>/);
});

test('footer shows the short git hash and links to the changelog', () => {
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Layout)));
  assert.match(html, /Sabor de Abraço · vtest/);
  assert.match(html, /href="\/CHANGELOG\.md"[^>]*>Novidades<\/a>/);
});

test('layout still renders explicit children used by delivery', () => {
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Layout, null, React.createElement('h1', null, 'Entregas'))));
  assert.match(html, /<h1>Entregas<\/h1>/);
});

test('navigation links follow the role access matrix', () => {
  const expectedLinks = {
    admin: ['/produtos', '/clientes', '/producao', '/caixa', '/comandas', '/cadastro/mesas', '/cozinha', '/producao/fichas'],
    gerente: ['/produtos', '/clientes', '/producao', '/caixa', '/comandas'],
    operador: ['/comandas', '/cozinha'],
    garcom: ['/comandas'],
    cozinha: ['/comandas', '/cozinha', '/producao/fichas'],
  };
  const allLinks = [...new Set(Object.values(expectedLinks).flat())];

  for (const [role, allowedLinks] of Object.entries(expectedLinks)) {
    const html = renderLayoutForRole(role);
    for (const path of allLinks) {
      assert.equal(html.includes(`href="${path}"`), allowedLinks.includes(path), `${role} link ${path}`);
    }
  }
});
