const profile = { id: 'admin-alertas', role: 'admin', username: 'teste' };
const alertas = Array.from({ length: 15 }, (_, index) => ({ tipo: 'estoque', severidade: index % 2 ? 'hoje' : 'atrasado', titulo: `Alerta ${index + 1} de produto com nome longo`, subtitulo: `Detalhes do alerta ${index + 1}`, link: '/produtos' }));

describe('Lista completa de alertas', () => {
  beforeEach(() => {
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/**', req => {
      const path = new URL(req.url).pathname;
      const metric = { total: 0, pedidos: 0, itens: 0, ticketMedio: 0, maisVendidos: [] };
      if (path.endsWith('/dashboard/urgencias')) return req.reply(alertas);
      if (path === '/api/dashboard') return req.reply({ comandasAbertas: 0, periodos: { dia: metric, semana: metric, mes: metric } });
      if (path.endsWith('/dashboard/comparar-vendas')) return req.reply({ periodoA: { ...metric, rotulo: 'Atual' }, periodoB: { ...metric, rotulo: 'Anterior' } });
      return req.reply([]);
    });
    cy.visit('/dashboard', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });
    cy.get('.day-urgency-list').should('be.visible');
  });

  it('abre todos os alertas no mobile sem navegar e fecha pelo X', () => {
    cy.viewport(390, 844);
    cy.contains('button', 'Ver mais 7 alertas').click();
    cy.location('pathname').should('equal', '/dashboard');
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[role="dialog"] .day-urgency-list li').should('have.length', 15);
    cy.get('[role="dialog"]').then(dialog => {
      const rect = dialog[0].getBoundingClientRect();
      expect(rect.left).to.be.at.least(0);
      expect(rect.right).to.be.at.most(390);
      expect(rect.bottom).to.be.at.most(844);
    });
    cy.get('[role="dialog"] .day-urgency-list').scrollTo('bottom');
    cy.get('[role="dialog"]').contains('Alerta 15 de produto com nome longo').should('be.visible');
    cy.get('button[aria-label="Fechar alertas"]').should('be.visible').click();
    cy.get('[role="dialog"]').should('not.exist');
    cy.contains('button', 'Ver mais 7 alertas').should('be.focused');
  });

  it('fecha com Esc, ao tocar fora e ao abrir um alerta', () => {
    cy.contains('button', 'Ver mais 7 alertas').click();
    cy.get('button[aria-label="Fechar alertas"]').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
    cy.contains('button', 'Ver mais 7 alertas').click();
    cy.get('[role="dialog"]').click(-5, -5, { force: true });
    cy.get('[role="dialog"]').should('not.exist');
    cy.contains('button', 'Ver mais 7 alertas').click();
    cy.get('[role="dialog"]').contains('a', alertas[0].titulo).click();
    cy.location('pathname').should('equal', '/produtos');
    cy.get('[role="dialog"]').should('not.exist');
    cy.get('body').should('not.have.css', 'overflow', 'hidden');
  });
});
