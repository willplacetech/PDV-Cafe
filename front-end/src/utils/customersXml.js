const CAMPOS_ENDERECO_ENTREGA = ['rua', 'numero', 'bairro', 'complemento', 'referencia'];

const textoXmlSeguro = (value) => Array.from(String(value ?? ''))
  .filter((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
  })
  .join('')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const elemento = (nome, valor) => `      <${nome}>${textoXmlSeguro(valor)}</${nome}>`;

export const criarXmlClientes = (clientes, exportadoEm = new Date()) => {
  const registros = clientes.map((cliente) => {
    const enderecoEntrega = cliente.enderecoEntrega || {};
    const campos = [
      elemento('id', cliente._id),
      elemento('nome', cliente.nome),
      elemento('telefone', cliente.telefone),
      elemento('cpf', cliente.cpf),
      elemento('aniversario', cliente.aniversario),
      elemento('endereco', cliente.endereco),
      '      <enderecoEntrega>',
      ...CAMPOS_ENDERECO_ENTREGA.map((campo) => `        <${campo}>${textoXmlSeguro(enderecoEntrega[campo])}</${campo}>`),
      '      </enderecoEntrega>',
      elemento('cafesFidelidade', cliente.cafesFidelidade),
      elemento('cadastradoEm', cliente.createdAt),
    ];

    return `    <cliente>\n${campos.join('\n')}\n    </cliente>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<clientes>',
    elemento('exportadoEm', exportadoEm.toISOString()),
    elemento('total', clientes.length),
    ...(registros.length ? registros : []),
    '</clientes>',
    '',
  ].join('\n');
};
