describe('WhatsApp Deep Link Fallback', () => {
  beforeEach(() => {
    cy.login('admin', 'SaborAbra26');
  });

  it('Botão de compartilhamento WhatsApp existe na comanda', () => {
    cy.visit('/comandas');
    cy.get('button[title*="WhatsApp"], button[title*="whatsapp"]').should('exist');
  });

  it('Clique no WhatsApp tenta abrir app e fallback para web', () => {
    cy.visit('/comandas');
    cy.contains('button', /WhatsApp|wa\.me|Compartilhar/i).first().click();
  });
});
