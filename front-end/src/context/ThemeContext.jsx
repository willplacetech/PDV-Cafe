import { useState, useEffect } from 'react';

import { ThemeContext } from './ThemeContextDefinition.js';

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    // Verifica preferência salva no localStorage
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    // Fallback para preferência do sistema
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // Salva preferência no localStorage
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    // Aplica o tema ao elemento raiz
    const html = document.documentElement;
    if (isDark) {
      html.setAttribute('data-theme', 'dark');
      html.style.colorScheme = 'dark';
    } else {
      html.setAttribute('data-theme', 'light');
      html.style.colorScheme = 'light';
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
