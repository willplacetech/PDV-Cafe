const pagamentoLabels = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartao de credito',
  cartao_debito: 'Cartao de debito',
  credito_loja: 'Credito na loja',
};

const dinheiro = (value) => Number(value || 0).toFixed(2).replace('.', ',');
export const textoSeguro = (value) => String(value ?? '').replace(/[<&>"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[char]));
const logoUrl = () => typeof window !== 'undefined' ? `${window.location.origin}/Abraco1.png` : '/Abraco1.png';

export const totalPago = (pedido) => (Array.isArray(pedido?.pagamentos)
  ? pedido.pagamentos.reduce((total, pagamento) => total + (Number(pagamento.valorRecebido) || 0), 0)
  : 0);

export function buildNotaVendaHtml(pedido, { comandaNumero, titulo = 'NOTA DE VENDA' } = {}) {
  if (!pedido) return '';
  const pago = totalPago(pedido);
  const falta = Math.max(0, Number(pedido.total || 0) - pago);
  const utilizacaoInterna = Boolean(pedido.utilizacaoInterna);
  const itens = (pedido.itens || []).map((item) => `
    <tr>
      <td>${textoSeguro(item.quantidade)}x</td>
      <td>${textoSeguro(item.nome)}${item.modificadores?.length ? `<small>${textoSeguro(item.modificadores.join(' | '))}</small>` : ''}</td>
      <td>R$ ${dinheiro(item.precoUnitario)}</td>
      <td>R$ ${dinheiro(Number(item.quantidade) * Number(item.precoUnitario))}</td>
    </tr>`).join('');
  const pagamentos = (pedido.pagamentos || []).map((pagamento) => `
    <div class="linha"><span>${textoSeguro(pagamentoLabels[pagamento.tipo] || pagamento.tipo)}</span><span>R$ ${dinheiro(pagamento.valorRecebido)}</span></div>`).join('');

  return `<!DOCTYPE html><html><head><title>${titulo} #${textoSeguro(pedido.numero)}</title>
    <style>
      * { box-sizing:border-box; font-family:'Courier New',monospace; font-size:12px; }
      body { width:76mm; margin:0; padding:4mm; color:#000; }
      .center { text-align:center; } .bold { font-weight:bold; }
      .logo { display:block; width:52px; height:52px; object-fit:contain; margin:0 auto 4px; }
      .marca { font-size:16px; font-weight:bold; letter-spacing:.4px; }
      .subtitulo { font-size:11px; margin-top:2px; }
      .linha, .separador { border-top:1px dashed #000; margin:8px 0; }
      .dados { display:grid; grid-template-columns:82px 1fr; gap:3px 6px; }
      .dados span:nth-child(odd) { font-weight:bold; }
      table { width:100%; border-collapse:collapse; margin-top:6px; }
      th { border-bottom:1px solid #000; padding:3px 0; text-align:left; font-size:10px; }
      td { padding:4px 0; border-bottom:1px dashed #999; vertical-align:top; }
      th:first-child, td:first-child { width:28px; } th:nth-child(3), td:nth-child(3), th:last-child, td:last-child { text-align:right; white-space:nowrap; }
      td:nth-child(2) { padding-right:4px; } td small { display:block; font-size:10px; margin-top:2px; }
      .totais { margin-top:8px; } .linha { display:flex; justify-content:space-between; gap:8px; border:0; margin:3px 0; }
      .total { border-top:2px solid #000; padding-top:7px; margin-top:6px; font-weight:bold; font-size:14px; }
      .pendencia { font-weight:bold; margin-top:5px; }
      .rodape { margin-top:14px; font-size:11px; line-height:1.5; }
      @media print { @page { margin:0; size:80mm auto; } body { margin:4mm; } }
    </style></head><body>
    <div class="center"><img class="logo" src="${logoUrl()}" alt="Sabor de Abraço"><div class="marca">SABOR DE ABRACO</div></div>
    <div class="center subtitulo">${titulo}</div>
    <div class="separador"></div>
    <div class="dados">
      <span>Pedido:</span><span>#${textoSeguro(pedido.numero)}</span>
      ${comandaNumero ? `<span>Comanda:</span><span>#${textoSeguro(comandaNumero)}</span>` : ''}
      <span>Data:</span><span>${new Date(pedido.createdAt || Date.now()).toLocaleString('pt-BR')}</span>
      <span>Cliente:</span><span>${textoSeguro(pedido.clienteNome || 'Cliente nao identificado')}</span>
      ${pedido.atendente ? `<span>Atendente:</span><span>${textoSeguro(pedido.atendente)}</span>` : ''}
    </div>
    <div class="separador"></div>
    <div class="bold center">ITENS DO PEDIDO</div>
    <table><thead><tr><th>Qtd</th><th>Item</th><th>Unit.</th><th>Total</th></tr></thead><tbody>${itens}</tbody></table>
    <div class="separador"></div>
    <div class="totais">
      <div class="linha"><span>Subtotal:</span><span>R$ ${dinheiro(pedido.subtotal || pedido.total)}</span></div>
      ${Number(pedido.taxaEntrega) > 0 ? `<div class="linha"><span>Taxa de entrega:</span><span>R$ ${dinheiro(pedido.taxaEntrega)}</span></div>` : ''}
      ${Number(pedido.desconto) > 0 ? `<div class="linha"><span>Desconto:</span><span>-R$ ${dinheiro(pedido.desconto)}</span></div>` : ''}
      ${utilizacaoInterna ? `<div class="linha"><span>Uso interno:</span><span>SIM</span></div>` : ''}
      <div class="linha total"><span>TOTAL:</span><span>R$ ${dinheiro(pedido.total)}</span></div>
      ${pagamentos ? `<div class="separador"></div><div class="bold">PAGAMENTOS</div>${pagamentos}` : ''}
      ${pago > 0 && falta > 0 ? `<div class="linha pendencia"><span>FALTA:</span><span>R$ ${dinheiro(falta)}</span></div>` : ''}
    </div>
    <div class="separador"></div>
    <div class="center bold rodape">Sabor de Abraço<br>Agradece a Preferência!<br>Volte sempre!</div>
    <script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}</script>
    </body></html>`;
}

export function buildNotaVendaTexto(pedido, opcoes = {}) {
  return buildNotaVendaTextoBase(pedido, opcoes);
}

export function compartilharNotaWhatsApp(pedido, opcoes = {}, telefone = '') {
  if (!pedido) return;
  const texto = buildNotaVendaTexto(pedido, opcoes);
  const fone = telefone ? telefone.replace(/\D/g, '') : (pedido.clienteTelefone || '').replace(/\D/g, '');
  const encodedText = encodeURIComponent(texto);
  const appUrl = fone
    ? `whatsapp://send?phone=55${fone}&text=${encodedText}`
    : `whatsapp://send?text=${encodedText}`;
  const webUrl = fone
    ? `https://wa.me/55${fone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;

  const openApp = () => {
    const link = document.createElement('a');
    link.href = appUrl;
    link.rel = 'noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openWeb = () => {
    window.open(webUrl, '_blank');
  };

  let fallbackFired = false;
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(fallbackTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const fallbackTimer = setTimeout(() => {
    if (!fallbackFired) {
      fallbackFired = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      openWeb();
    }
  }, 1500);

  openApp();
}

function buildNotaVendaTextoBase(pedido, { comandaNumero, titulo = 'NOTA DE VENDA' } = {}) {
  if (!pedido) return '';
  const pago = totalPago(pedido);
  const falta = Math.max(0, Number(pedido.total || 0) - pago);
  const largura = 22;
  const linha = (label, valor) => `${label.padEnd(largura, ' ')}${valor}`;
  const utilizacaoInterna = Boolean(pedido.utilizacaoInterna);
  const itens = (pedido.itens || []).map((item) => {
    const nome = item.modificadores?.length ? `${item.nome} (${item.modificadores.join(' | ')})` : item.nome;
    return `${item.quantidade}x ${nome}\n${' '.repeat(3)}${linha('Unitario:', `R$ ${dinheiro(item.precoUnitario)}`)}\n${' '.repeat(3)}${linha('Total:', `R$ ${dinheiro(Number(item.quantidade) * Number(item.precoUnitario))}`)}`;
  }).join('\n');
  const pagamentos = (pedido.pagamentos || []).map((pagamento) => `- ${linha(pagamentoLabels[pagamento.tipo] || pagamento.tipo, `R$ ${dinheiro(pagamento.valorRecebido)}`)}`).join('\n');

  return `*SABOR DE ABRAÇO*\n${titulo}\n--------------------------------\n${linha('Pedido:', `#${pedido.numero}`)}${comandaNumero ? `\n${linha('Comanda:', `#${comandaNumero}`)}` : ''}\n${linha('Data:', new Date(pedido.createdAt || Date.now()).toLocaleString('pt-BR'))}\n${linha('Cliente:', pedido.clienteNome || 'Cliente não identificado')}${pedido.atendente ? `\n${linha('Atendente:', pedido.atendente)}` : ''}\n--------------------------------\n*ITENS DO PEDIDO*\n${itens}\n--------------------------------\n${linha('Subtotal:', `R$ ${dinheiro(pedido.subtotal || pedido.total)}`)}${Number(pedido.taxaEntrega) > 0 ? `\n${linha('Taxa de entrega:', `R$ ${dinheiro(pedido.taxaEntrega)}`)}` : ''}${Number(pedido.desconto) > 0 ? `\n${linha('Desconto:', `-R$ ${dinheiro(pedido.desconto)}`)}` : ''}${utilizacaoInterna ? `\n${linha('Uso interno:', 'SIM')}` : ''}\n*${linha('TOTAL:', `R$ ${dinheiro(pedido.total)}`)}*${pagamentos ? `\n--------------------------------\n*PAGAMENTOS*\n${pagamentos}` : ''}${pago > 0 && falta > 0 ? `\n${linha('FALTA:', `R$ ${dinheiro(falta)}`)}` : ''}\n--------------------------------\n*Sabor de Abraço*\nAgradece a Preferência!\nVolte sempre!`;
}
