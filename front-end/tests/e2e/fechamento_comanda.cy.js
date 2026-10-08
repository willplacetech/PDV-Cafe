const product = { _id: 'cafe-1', nome: 'Café de teste', codigo: '1', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 6, estoque: 20, unidadeVenda: 'un' };
const profile = { id: 'admin-teste', role: 'admin', username: 'teste', tenantId: 'tenant-teste' };

describe('Fechamento completo da comanda', () => {
  let command;
  beforeEach(() => {
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/**', req => {
      const path = new URL(req.url).pathname;
      if (path.endsWith('/products') || path.endsWith('/products/pdv')) return req.reply([product]);
      if (path.endsWith('/mesas')) return req.reply({ mesas: [] });
      return req.reply([]);
    });
    cy.intercept('POST', '**/api/comandas', req => {
      command = { ...req.body, _id: 'comanda-1', numero: '1', status: 'aberta', valorTotal: 6, itens: req.body.itens.map(item => ({ ...item, nome: product.nome, precoUnitario: 6 })) };
      req.reply({ statusCode: 201, body: command });
    });
    cy.intercept('PATCH', '**/api/comandas/*/cliente', {});
    cy.visit('/pdv', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_user', JSON.stringify(profile));
      cy.stub(win, 'open').as('whatsapp');
      cy.stub(win.HTMLAnchorElement.prototype, 'click').as('appWhatsApp');
    } });
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').contains('button', 'Fechar venda').click();
    cy.get('.pdv-payment-dialog').within(() => {
      cy.contains('label', 'Desconto (R$)').find('input').clear().type('1');
      cy.contains('label', 'Nome do cliente').find('input').clear().type('Maria');
      cy.contains('label', 'Telefone').find('input').clear().type('11988887777');
      cy.contains('label', 'Forma de pagamento').find('select').select('dinheiro');
      cy.contains('Total a cobrar').parent().should('contain', '5,00');
      cy.contains(/UTILIZAÇÃO INTERNA/i).should('not.exist');
    });
  });

  const reply = req => req.reply({ comanda: { ...command, status: 'fechada' }, pedido: { ...command, total: 5, subtotal: 6, desconto: 1, clienteNome: 'Maria', clienteTelefone: '11988887777', pagamentos: [{ tipo: 'dinheiro', valorRecebido: 5 }] } });

  it('aplica desconto e usa o telefone informado no comprovante WhatsApp', () => {
    cy.intercept('POST', '**/api/comandas/*/fechar', req => {
      expect(req.body).to.include({ desconto: 1, nome: 'Maria', telefone: '11988887777', metodoPagamento: 'dinheiro' });
      reply(req);
    }).as('close');
    cy.get('.pdv-payment-dialog').contains('button', 'Confirmar Fechamento').click();
    cy.wait('@close');
    cy.contains('button', 'WhatsApp').click();
    cy.get('@whatsapp').should('have.been.calledWithMatch', 'https://wa.me/5511988887777?text=');
  });

  it('mantém desconto e contato na retomada de uma resposta incerta', () => {
    let firstBody;
    cy.intercept('POST', '**/api/comandas/*/fechar', req => {
      if (!firstBody) {
        firstBody = req.body;
        return req.reply({ statusCode: 503, body: { msg: 'Falha temporária' } });
      }
      expect(req.body).to.deep.equal(firstBody);
      reply(req);
    }).as('close');
    cy.get('.pdv-payment-dialog').contains('button', 'Confirmar Fechamento').click();
    cy.wait('@close');
    cy.get('.pdv-cart-panel').contains('button', 'Cancelar comanda').should('be.disabled');
    cy.get('.pdv-payment-dialog').within(() => {
      cy.get('input').should('be.disabled');
      cy.contains('button', 'Voltar').click();
    });
    cy.get('.pdv-cart-panel').contains('button', 'Retomar pagamento').click();
    cy.get('.pdv-payment-dialog').contains('button', 'Confirmar Fechamento').click();
    cy.wait('@close');
    cy.contains('Comanda Fechada!').should('be.visible');
  });

  it('salva o nome informado mesmo sem telefone', () => {
    cy.get('.pdv-payment-dialog').contains('label', 'Telefone').find('input').clear();
    cy.intercept('POST', '**/api/comandas', req => {
      expect(req.body.clienteNome).to.equal('Maria');
      command = { ...req.body, _id: 'comanda-1', numero: '1', valorTotal: 6, itens: req.body.itens.map(item => ({ ...item, nome: product.nome, precoUnitario: 6 })) };
      req.reply({ statusCode: 201, body: command });
    }).as('saveName');
    cy.intercept('POST', '**/api/comandas/*/fechar', req => {
      expect(req.body.nome).to.equal('Maria');
      expect(req.body.telefone).to.equal('');
      reply(req);
    });
    cy.get('.pdv-payment-dialog').contains('button', 'Confirmar Fechamento').click();
    cy.wait('@saveName');
    cy.contains('Comanda Fechada!').should('be.visible');
  });

  it('oferece telefone após fechar e emissão fiscal como na branch Compras', () => {
    cy.get('.pdv-payment-dialog').contains('label', 'Telefone').find('input').clear();
    cy.intercept('POST', '**/api/comandas/*/fechar', req => req.reply({
      comanda: { ...command, status: 'fechada' },
      pedido: { ...command, _id: 'pedido-1', numero: '10', total: 5, clienteNome: 'Maria', clienteTelefone: '' },
    })).as('close');
    cy.intercept('PATCH', '**/api/comandas/comanda-1/cliente', req => {
      expect(req.body).to.include({ nome: 'Maria', telefone: '11988887777' });
      req.reply({});
    }).as('contact');
    cy.intercept('POST', '**/api/fiscal/orders/pedido-1/emitir', { order: { _id: 'pedido-1', numero: '10', total: 5, clienteNome: 'Maria', nfce: { status: 'autorizada', chaveAcesso: '1234', danfePdf: 'dGVzdGU=' } } }).as('fiscal');
    cy.get('.pdv-payment-dialog').contains('button', 'Confirmar Fechamento').click();
    cy.wait('@close');
    cy.contains('Comanda Fechada!').should('be.visible');
    cy.get('.pdv-success-dialog').contains('label', 'WhatsApp').find('input').type('11988887777');
    cy.contains('button', 'WhatsApp').click();
    cy.wait('@contact');
    cy.get('@whatsapp').should('have.been.calledWithMatch', 'https://wa.me/5511988887777?text=');
    cy.contains('button', 'Emitir NFC-e').click();
    cy.wait('@fiscal');
    cy.contains('NFC-e: Autorizada').should('be.visible');
    cy.contains('button', 'Abrir DANFE PDF').should('be.visible');
  });

  it('exige escolher a forma de pagamento antes de salvar e fechar', () => {
    cy.get('.pdv-payment-dialog').contains('label', 'Forma de pagamento').find('select').select('');
    cy.get('.pdv-payment-dialog').contains('button', 'Confirmar Fechamento').click();
    cy.contains('Escolha a forma de pagamento.').should('be.visible');
    cy.get('.pdv-payment-dialog').should('be.visible');
  });

  it('mostra o saldo após desconto e recebimento parcial', () => {
    cy.get('.pdv-payment-dialog').contains('button', 'Voltar').click();
    cy.intercept('POST', '**/api/comandas', req => {
      command = { ...req.body, _id: 'comanda-1', numero: '1', status: 'aberta', valorTotal: 6, historicoPagamentos: [{ formaPagamento: 'pix', valor: 3 }], itens: req.body.itens.map(item => ({ ...item, nome: product.nome, precoUnitario: 6 })) };
      req.reply({ statusCode: 201, body: command });
    }).as('partial');
    cy.get('.pdv-cart-panel').contains('button', 'Salvar em aberto').click();
    cy.wait('@partial');
    cy.get('.pdv-cart-panel').contains('button', 'Fechar venda').click();
    cy.get('.pdv-payment-dialog').within(() => {
      cy.contains('label', 'Desconto').find('input').clear().type('1');
      cy.contains('Saldo em aberto').parent().should('contain', '2,00').and('contain', 'já recebido R$ 3,00');
      cy.contains('label', 'Desconto').find('input').clear().type('5');
      cy.contains('label', 'Forma de pagamento').find('select').select('dinheiro');
      cy.contains('button', 'Confirmar Fechamento').click();
    });
    cy.contains('O desconto não pode reduzir o total abaixo do valor já recebido.').should('be.visible');
    cy.get('.pdv-payment-dialog').should('be.visible');
  });

  it('resposta fiscal atrasada não substitui o comprovante da próxima comanda', () => {
    let closes = 0;
    let liberarFiscal;
    cy.intercept('POST', '**/api/comandas/*/fechar', req => {
      closes++;
      req.reply({ comanda: { ...command, status: 'fechada' }, pedido: { ...command, _id: `pedido-${closes}`, numero: String(closes * 10), total: 5 } });
    });
    cy.intercept('POST', '**/api/fiscal/orders/pedido-1/emitir', req => new Promise(resolve => {
      liberarFiscal = () => {
        req.reply({ order: { _id: 'pedido-1', numero: '10', total: 5, nfce: { status: 'autorizada' } } });
        resolve();
      };
    })).as('lateFiscal');
    cy.get('.pdv-payment-dialog').contains('button', 'Confirmar Fechamento').click();
    cy.contains('button', 'Emitir NFC-e').click();
    cy.contains('button', 'Emitindo NFC-e...').should('be.disabled');
    cy.get('.pdv-success-dialog').contains('button', /^Fechar$/).click();
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').contains('button', 'Fechar venda').click();
    cy.get('.pdv-payment-dialog').contains('label', 'Forma de pagamento').find('select').select('dinheiro');
    cy.get('.pdv-payment-dialog').contains('button', 'Confirmar Fechamento').click();
    cy.get('.pdv-success-dialog').should('contain', '#20');
    cy.then(() => liberarFiscal());
    cy.wait('@lateFiscal');
    cy.get('.pdv-success-dialog').should('contain', '#20').and('not.contain', 'NFC-e: Autorizada');
  });
});
