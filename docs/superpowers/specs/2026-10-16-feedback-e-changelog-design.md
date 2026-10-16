# Feedback consistente, versão e novidades

**Data:** 2026-10-16  
**Projeto:** Sabor de Abraço PDV

## Entendimento do pedido

Padronizar feedback nas telas de operação sem enfraquecer a estabilidade do
PDV em produção; apresentar versão SemVer e data no menu; disponibilizar um
histórico curto de novidades com base no changelog mantido no repositório.

O escopo funcional é o aplicativo inteiro, incluindo PDV, cadastro, gestão e
Delivery. Alterações existentes em `front-end/src/pages/PDV.jsx` e
`front-end/tests/regressions.test.js` são preexistentes e não fazem parte deste
trabalho, exceto onde uma integração diretamente relacionada seja necessária.

## Decisões de design

### 1. Feedback e estados de listagem

- Reutilizar e consolidar `ToastProvider`, `ConfirmarAcao`, `Skeleton` e
  componentes de interface já existentes antes de criar novos mecanismos.
- Toasts são para resultados de ações (sucesso/erro/aviso), com semântica
  acessível (`status` para mensagens ordinárias e `alert` para erros).
  Falhas não devem ser ocultadas ou convertidas em sucesso.
- Eliminar `window.alert()` e `window.confirm()` das ações destrutivas.
  Confirmações destrutivas usam um diálogo modal compartilhado, cancelável e
  acessível. Confirmações de transições de atendimento não destrutivas
  permanecem como estão até validação individual do fluxo; não mudar
  semântica de vendas, entregas, caixa ou estoque.
- Em cada lista assíncrona, distinguir carregando, erro, vazio e dados:
  skeleton local enquanto busca, estado vazio com ícone/texto e ação
  contextual, erro com botão “Tentar novamente”, e conteúdo somente após
  resposta válida. A ação vazia respeita permissões: criar/adicionar quando
  disponível; navegar para filtro/limpeza quando aplicável. Em áreas somente
  de consulta, a ação pode levar à origem dos dados.
- Toasts podem confirmar o resultado de uma ação, mas erros de carga ficam
  junto à lista e não dependem de toast. Retry repete a consulta sem recarregar
  a página inteira.
- Preservar carregamentos de servidor, atualizações periódicas, filtros,
  paginação, operações em lote e contratos de API existentes. Listas já
  paginadas na API não ganham uma segunda camada client-side.
- Não substituir os estados locais apropriados por overlay ou loading global.

### 2. Versão, data e changelog

- `package.json` da raiz será a fonte do SemVer exibido e injetado no bundle.
  O estado atual precisa ser reconciliado: a raiz declara `1.0.0`, enquanto a
  entrada mais recente de `CHANGELOG.md` é `2.0.0`. A implementação alinhará a
  versão da raiz à release documentada, sem inventar uma release nova.
- O rodapé do menu mostra `vX.Y.Z · dd/mm/aaaa`. A data é a data de release da
  entrada correspondente no `CHANGELOG.md`, em data civil (não a data do
  relógio do cliente nem a data de compilação).
- O SHA do commit continua sendo o identificador de build publicado em
  `version.json` e usado pelo mecanismo de atualização do PWA. Versão SemVer e
  SHA são valores distintos e não se substituem.
- Adicionar ao menu um link/botão “Novidades”, disponível nas variantes desktop
  e mobile, que abre um diálogo acessível com no máximo as cinco entradas mais
  recentes de `CHANGELOG.md`. Cada entrada inclui versão, data e notas.
- Ler o changelog existente em build/compile time; não manter outra lista
  hardcoded de releases. Uma entrada ausente ou malformada para a versão ativa
  deve ser reportada no build/teste, não mascarada por uma data arbitrária.
- Manter separado o modal automático de “nova versão disponível” do PWA: ele
  continua oferecendo a atualização técnica e não é substituído pelo modal
  de histórico.

## Componentes e responsabilidades

- `ToastProvider` / `useToast`: feedback transitório acessível de ações.
- `ConfirmarAcao` ou abstração compartilhada equivalente: diálogo de
  confirmação para operações destrutivas, sem `window.confirm()`.
- Componentes compartilhados de estado de lista: skeleton, vazio contextual e
  erro com retry, com estilos alinhados aos tokens creme/marrom existentes.
- Proprietários das listas: cada tela mantém a consulta, aplica seus filtros
  atuais e fornece ação de retry; não esconder erro nem renderizar vazio
  enquanto a primeira consulta está pendente.
- `vite.config.js` / serviço de versão: injetar SemVer/data de release sem
  alterar o campo SHA consumido pelo atualizador PWA.
- `Layout.jsx` e novo conteúdo/modal de novidades: link nas navegações desktop
  e mobile e leitura das cinco últimas releases do changelog.

## Fora de escopo

- Mudanças nos contratos das APIs, paginação de servidor, autenticação,
  autorização, regras de negócio ou fluxo de venda/recebimento.
- Reformulação da identidade visual, mudança de versão major por conveniência
  ou substituição do mecanismo existente de atualização PWA.
- Converter toda mensagem inline operacional em toast quando a mensagem
  precisar permanecer visível junto ao formulário/lista.

## Critérios de aceitação

1. Ações de sucesso e falha comunicam resultado por toast acessível; a busca
   no código não encontra `window.alert()` de interface.
2. Toda ação destrutiva relevante apresenta diálogo modal customizado, e não
   `window.confirm()`. Cancelar o diálogo não executa a operação.
3. Listas assíncronas não mostram estado vazio durante carregamento; exibem
   skeleton e mantêm ações/seleções existentes após carregar.
4. Estados vazios são amigáveis, com ícone, texto e ação coerente com a
   permissão/fluxo da tela.
5. Falhas de rede/API em consultas de lista têm mensagem próxima da lista e
   “Tentar novamente”; retry não recarrega o documento nem apaga filtros.
6. Nenhuma lista de servidor é paginada novamente no cliente.
7. Rodapé usa versão SemVer do package raiz e a data civil correspondente no
   changelog; em 2026-10-16, a release documentada existente é `2.0.0` com
   data `15/10/2026`.
8. “Novidades” abre as cinco entradas mais recentes do changelog tanto no
   menu desktop como no mobile; atualização automática do PWA permanece
   funcional e independente.
9. Build, lint focado, testes unitários de componentes/parsing e testes E2E
   representativos das listas, ações destrutivas, rodapé e modal passam.

## Riscos e validações

- Existem confirmações nativas tanto destrutivas quanto de transição de fluxo;
  inventariá-las e substituir somente as destrutivas sem alterar a sequência
  de venda/entrega.
- `ToastProvider` já está integrado em múltiplas telas; testes precisam cobrir
  repetição e acessibilidade sem duplicar mensagens.
- O componente `SkeletonLista.jsx` existente precisa ser verificado quanto à
  compilação/acessibilidade; preferir corrigir ou reaproveitar somente se
  seguro. A API final deve permitir placeholders representativos sem alturas
  arbitrárias inválidas.
- A atualização PWA compara o identificador de build publicado. Alterar seu
  formato para SemVer faria builds diferentes parecerem iguais; preservar
  integralmente o SHA e cobrir isso em teste.
- O processamento de Markdown deve aceitar apenas o formato de cabeçalhos de
  release adotado no changelog, sem parser genérico ou dependência adicional.
- Testar navegação por teclado, fechamento por Escape, foco e rótulos do modal
  de novidades e do diálogo destrutivo.
