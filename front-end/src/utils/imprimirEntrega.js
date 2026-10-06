const escaparHtml = valor => String(valor ?? '').replace(/[&<>"']/g, caractere => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[caractere]);

const moeda = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function imprimirEntrega(pedido, nomeComercio = '') {
  const janela = window.open('', '_blank', 'width=420,height=640');
  if (!janela) return false;
  janela.opener = null;

  const origem = pedido.origem || {};
  const endereco = origem.endereco || {};
  const linhasItens = (pedido.itens || []).map(item => `<div class="linha"><span>${escaparHtml(item.quantidade)} × ${escaparHtml(item.descricao)}</span><b>${moeda(Number(item.quantidade || 0) * Number(item.precoUnitario || 0))}</b></div>`).join('');
  const camposEndereco = [endereco.rua, endereco.numero, endereco.complemento, endereco.bairro, endereco.referencia].filter(Boolean).map(escaparHtml).join(', ');

  janela.document.open();
  janela.document.write(`<!doctype html>
    <html lang="pt-BR"><head><meta charset="utf-8"><title>Entrega ${escaparHtml(pedido._id)}</title>
    <style>
      *{box-sizing:border-box;font-family:Arial,sans-serif}
      body{width:76mm;margin:0 auto;padding:4mm;color:#111;font-size:12px}
      h1{font-size:16px;text-align:center;margin:0 0 4px}
      h2{font-size:13px;margin:14px 0 6px}
      p{margin:5px 0;line-height:1.4}
      .centro{text-align:center}
      .linha{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px dashed #aaa}
      .total{font-size:14px;font-weight:bold;border-top:1px solid #111;margin-top:8px;padding-top:7px}
      @page{margin:0;size:80mm auto}
      @media print{body{margin:0 auto}}
    </style></head><body>
      <h1>${escaparHtml(nomeComercio || 'Delivery')}</h1>
      <p class="centro">COMPROVANTE DE ENTREGA</p>
      <p>Pedido: ${escaparHtml(pedido._id)}</p>
      <p>Status: ${escaparHtml(pedido.status)}</p>
      <p>Data: ${escaparHtml(new Date(pedido.criadoEm || Date.now()).toLocaleString('pt-BR'))}</p>
      <h2>Cliente</h2><p>${escaparHtml(origem.nomeCliente)}</p>
      <p>${escaparHtml(origem.telefone)}</p><p>${camposEndereco}</p>
      <h2>Itens</h2>${linhasItens || '<p>Itens não informados</p>'}
      <div class="linha"><span>Pedido</span><b>${moeda(pedido.valorTotal)}</b></div>
      <div class="linha"><span>Taxa de entrega</span><b>${moeda(pedido.taxaEntrega)}</b></div>
      <div class="linha total"><span>Total</span><b>${moeda(Number(pedido.valorTotal || 0) + Number(pedido.taxaEntrega || 0))}</b></div>
      <script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script>
    </body></html>`);
  janela.document.close();
  return true;
}
