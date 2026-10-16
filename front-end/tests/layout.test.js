import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/components/Layout.jsx', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export default ', '');
const { code } = await transformWithOxc(source, 'Layout.jsx', { jsx: { runtime: 'classic' } });
const authContext = React.createContext({ user: { id: 'test', role: 'admin' }, logout() {} });
const themeContext = React.createContext({ isDark: false, toggleTheme() {} });
const Layout = new Function('React', 'Outlet', 'Link', 'useNavigate', 'useLocation', 'useContext', 'useState', 'useEffect', 'useCallback', 'AuthContext', 'ThemeContext', 'APP_VERSION', 'StatusConexao', 'NovidadesModal', `${code}; return Layout;`)(
  React, Outlet, Link, useNavigate, useLocation, React.useContext, React.useState, React.useEffect, React.useCallback,
  authContext, themeContext, 'test', () => null, () => null,
);

test('authenticated layout renders the nested route instead of a blank page', () => {
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/dashboard'] },
    React.createElement(Routes, null,
      React.createElement(Route, { element: React.createElement(Layout) },
        React.createElement(Route, { path: '/dashboard', element: React.createElement('h1', null, 'Dashboard') })))));
  assert.match(html, /<h1>Dashboard<\/h1>/);
});

test('layout still renders explicit children used by delivery', () => {
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Layout, null, React.createElement('h1', null, 'Entregas'))));
  assert.match(html, /<h1>Entregas<\/h1>/);
});
