describe('Clientes e aniversário', () => {
  beforeEach(() => { cy.login(); cy.visit('/clientes'); });

  it('cadastra e apresenta aniversário no formato DD/MM/AAAA', () => {
    cy.intercept('POST', '**/api/customers').as('cliente');
    cy.get('input[placeholder="Nome completo"]').type('Cliente E2E');
    cy.contains('label', 'Telefone *').next('input').type('11999887766');
    cy.get('input[placeholder="DD/MM/AAAA"]').type('15061990').should('have.value', '15/06/1990');
    cy.contains('button', 'Cadastrar').click();
    cy.wait('@cliente').its('request.body').should('deep.include', { nome: 'Cliente E2E', aniversario: '15/06/1990' });
    cy.get('tbody').should('contain', 'Cliente E2E').and('contain', '15/06/1990');
  });

  it('mantém o aniversário e os campos estruturados de entrega', () => {
    cy.contains('label', 'Aniversário').should('exist');
    cy.get('input[placeholder="DD/MM/AAAA"]').should('be.visible');
    cy.contains('label', 'Rua').should('exist');
  });

  it('apresenta aniversário na listagem', () => {
    cy.contains('th', 'Aniv.').should('exist');
    cy.contains('th', 'Endereço').should('not.exist');
  });

  it('cancela ou confirma a exclusão do cliente no diálogo acessível', () => {
    const customer = { _id: 'feedback-delete', nome: 'Cliente para excluir', telefone: '11999887766', cafesFidelidade: 0 };
    cy.intercept('GET', '**/api/customers*', { statusCode: 200, body: [customer] }).as('customers');
    cy.intercept('DELETE', '**/api/customers/feedback-delete', { statusCode: 204 }).as('deleteCustomer');
    cy.visit('/clientes');
    cy.wait('@customers');

    cy.contains('tbody tr', customer.nome).contains('button', 'Excluir').click();
    cy.get('[role="dialog"][aria-modal="true"]').should('contain.text', 'Excluir este cliente?');
    cy.get('[role="dialog"]').contains('button', 'Cancelar').click();
    cy.get('@deleteCustomer.all').should('have.length', 0);

    cy.contains('tbody tr', customer.nome).contains('button', 'Excluir').click();
    cy.get('[role="dialog"]').contains('button', 'Excluir').click();
    cy.wait('@deleteCustomer');
    cy.get('@deleteCustomer.all').should('have.length', 1);
  });

  it('pagina a lista de clientes sem limitar os registros carregados', () => {
    const customers = Array.from({ length: 30 }, (_, index) => ({
      _id: `cliente-paginacao-${index + 1}`,
      nome: `Cliente ${index + 1}`,
      telefone: '11999887766',
      cafesFidelidade: 0,
    }));
    cy.intercept('GET', '**/api/customers*', (request) => {
      const url = new URL(request.url);
      const pagina = Number(url.searchParams.get('pagina') || 1);
      const limite = Number(url.searchParams.get('limite') || 25);
      request.reply({
        statusCode: 200,
        body: { dados: customers.slice((pagina - 1) * limite, pagina * limite), total: customers.length },
      });
    }).as('customers');
    cy.visit('/clientes');
    cy.wait('@customers');
    cy.contains('tbody tr', 'Cliente 1').should('be.visible');
    cy.contains('tbody tr', 'Cliente 26').should('not.exist');
    cy.get('.paginacao-minimalista').contains('button', '2').click();
    cy.contains('tbody tr', 'Cliente 26').should('be.visible');
    cy.contains('tbody tr', 'Cliente 1').should('not.exist');
    cy.contains('tbody tr', 'Cliente 26').contains('button', 'Editar').click();
    cy.get('input[placeholder="Nome completo"]').should('have.value', 'Cliente 26');
  });

  it('mostra skeleton e permite iniciar o cadastro após uma resposta vazia válida', () => {
    cy.intercept('GET', '**/api/customers*', { delay: 300, statusCode: 200, body: [] }).as('customers');
    cy.visit('/clientes');
    cy.get('[role="status"][aria-label="Carregando lista"]').should('be.visible');
    cy.wait('@customers');
    cy.contains('.estado-lista--vazio h3', 'Nenhum cliente cadastrado').should('be.visible');
    cy.contains('.estado-lista--vazio button', 'Cadastrar primeiro cliente').click();
    cy.get('input[placeholder="Nome completo"]').should('be.focused');
  });

  it('mostra erro de carga com retry e troca para vazio após a consulta repetir', () => {
    let attempts = 0;
    cy.intercept('GET', '**/api/customers*', (request) => {
      attempts += 1;
      request.reply(attempts <= 2
        ? { statusCode: 503, body: { msg: 'Falha temporária ao carregar clientes.' } }
        : { statusCode: 200, body: [] });
    }).as('customers');
    cy.visit('/clientes');
    cy.wait('@customers').its('response.statusCode').should('equal', 503);
    cy.get('@customers.all').should('have.length', 2);
    cy.get('[role="alert"]').should('contain.text', 'tente novamente');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@customers');
    cy.get('@customers.all').should('have.length', 3);
    cy.contains('.estado-lista--vazio h3', 'Nenhum cliente cadastrado').should('be.visible');
  });
});
