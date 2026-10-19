# Revisão de inputs e botões

## Correção aplicada em 19/10/2026

Os formulários divergentes passaram a herdar a base já existente de 48 px, cantos de 10 px e fonte de 16 px. As ações principais usam as variantes existentes de botão; filtros e ações compactas mantêm 40 px. Foram preservados o cadastro de Clientes, contadores, cartões de mesas, botões maiores de fechamento/entregador e as ajudas dos campos. Nenhum tema ou dependência foi instalado.

Foram corrigidos checkbox/radio afetados pelo estilo de campo, alturas da paginação, bordas inline que bloqueavam o foco, contraste das ações primárias no tema escuro e sinalização de select obrigatório inválido. A fonte maior do total do Caixa foi preservada; quantidade e preço do PDV continuam com 16 px sem depender da sobrescrita global do Layout.

Verificação final:

- Build Vite e geração do service worker passaram.
- Chrome local com API simulada: **185 verificações aprovadas**, cobrindo 14 rotas em 1280 e 390 px, temas claro/escuro, medidas/fontes dos campos visíveis, foco, erro do select, hover primário, envio do valor original, ajuda mobile e preço no PDV.
- Suíte unitária: 104 de 106 testes passaram. As duas falhas de Configurações e do link do rodapé foram reproduzidas com o código anterior do HEAD.
- ESLint dos arquivos alterados: permanece um erro anterior em `TrocoAuxiliar.jsx:28`, também reproduzido no HEAD. Não foi alterada essa lógica.
- Os specs Cypress de controles e select foram adicionados/estendidos; o executável Cypress encerrou com código 1 sem iniciar a suíte. A verificação de navegador foi feita diretamente no Chrome.
- Revisão independente do diff não deixou achados pendentes. `git diff --check` passou.

Sem publicação. Safari/iPhone físico e todos os estados condicionais com dados reais não foram verificados.

## Diagnóstico anterior à correção

Data: 19/10/2026. O restante deste documento e o CSV registram o estado anterior às alterações, com linhas e medidas daquela revisão.

Revisão de código de todos os arquivos JSX de `front-end/src`, estilos globais, estilos locais e componentes compartilhados. Foram inventariadas **595 declarações de controles em 44 arquivos**: inputs, botões, textareas, selects, SearchableSelect e DateInput. São declarações no código: listas podem gerar vários controles e condições podem ocultá-los. Os wrappers e seus elementos internos aparecem separadamente; o número não representa controles visíveis únicos.

O [inventário individual](revisao-inputs-botoes.csv) identifica arquivo, linha, tipo, classe e estilo de cada declaração. Links usados como botões em Rastreio e Entregador foram conferidos à parte e não entram nessa contagem. O template independente em `scripts/deliverylink-hub-template` está fora do escopo.

## Referência existente

`front-end/src/main.jsx:6` carrega `styles/theme.css`. `index.css` e `App.css` não são importados pela aplicação; suas regras não devem ser usadas como prova do comportamento atual.

| Propriedade | Campo padrão / `.input-field` | Botão padrão / `.btn` |
| --- | --- | --- |
| Altura mínima | 48 px | 48 px |
| Cantos | 10 px | 10 px |
| Espaçamento interno | 12 px × 14 px | 12 px × 16 px |
| Fonte | 16 px | 14 px, peso 700 |
| Borda | 1,5 px, `--input-border` | Conforme variante |

Fonte: `theme.css:134–227`. Há variantes pequenas, chips e abas: diferenças de função são válidas. O problema é a combinação de definições próprias, conflitos entre regras e estilos distintos para campos equivalentes.

## Achados prioritários

1. **Pouco contraste nos botões do tema escuro.** `theme.css:65–80,220` combina fundo `--accent-primary: #e7a35d` com texto branco: contraste calculado de **2,14:1**; no claro, a mesma variante chega a 5,47:1. Os botões de impressão que usam `--brand-brown` com branco chegam a **1,44:1** no escuro (`PagamentoResultadoModal.jsx:25`, `PDV.jsx:1310`). Isso dificulta ler a ação. Correção mínima: definir uma cor de texto adequada ao fundo da ação por tema e aplicá-la aos botões equivalentes; manter os estados de sucesso e exclusão próprios.

2. **Checkbox recebe medidas de campo de texto.** `theme.css:134–146` estiliza todos os inputs. `Configuracoes.jsx:112` define checkbox de 16 × 16 px, mas não neutraliza o mínimo de 48 px. A caixa do elemento mede 48 px de altura no Chrome; a aparência do marcador nativo depende do navegador. Correção mínima: limitar o estilo de campos aos tipos adequados e definir separadamente checkbox/radio, preservando uma área clicável confortável no label. Casos semelhantes merecem conferência em Comandas, Contas a Receber, Mesas e Usuários.

3. **Paginação desalinhada por conflito de altura.** `Paginacao.jsx:87–107` define seletor com mínimo de 32 px e botões com `height:32px`, sem redefinir `min-height`. O mínimo global de 48 px vence a altura declarada dos botões. Resultado medido: seletor 32 px, botão 48 px. Correção mínima: usar uma altura coerente nos dois, com área de toque adequada; alinhar o componente compartilhado corrige seus consumidores.

4. **Formulários equivalentes usam medidas diferentes.** Produtos usa 42 px/cantos de 8 px (`Products.jsx:761`); Clientes usa 48 px/10 px (`Customers.jsx:207`, `.input-field`); Auditoria usa 40 px/8 px (`Auditoria.jsx:10`); Produção usa mínimo de 44 px/8 px (`Production.jsx:363`); Login usa mínimos de 50–52 px/12 px (`Login.jsx:157–203`). Correção mínima: reutilizar as classes existentes nos formulários comuns e manter somente as exceções justificadas pela função. As medidas declaradas como mínimas não garantem a altura final quando fonte e padding exigem mais espaço.

5. **Bordas inline impedem a troca de cor padrão no foco.** Exemplos: `Users.jsx:308`, `Auditoria.jsx:10` e `ContasReceber.jsx:704`. A declaração inline de `border` prevalece sobre `border-color` do CSS de foco. O halo continua disponível, mas a borda não acompanha o padrão; o caso foi reproduzido com a mesma declaração. Correção mínima: remover a borda inline e usar a classe de campo. Preservar as bordas que sinalizam erro ou somente leitura.

6. **O Layout sobrescreve tamanhos de fonte intencionais.** `Layout.jsx:764` aplica `font-size:16px!important` a todos os campos. O total contado do Caixa declara 18 px (`Caixa.jsx:138`), mas recebe 16 px. Isso também impede avaliar uma fonte local apenas pela declaração da página. Correção mínima: colocar 16 px como base compartilhada e permitir exceções explícitas sem depender de `!important`.

7. **O select pesquisável não recebe a mesma marcação visual de obrigatório inválido.** `SearchableSelect.jsx:110–132` mostra um input com `aria-required`, enquanto o `required` real fica no select oculto. `theme.css:157–162` depende de `:required:user-invalid`; o input visível não casa com essa regra. A validação nativa continua ativa e o componente direciona o foco; a divergência é a sinalização visual. Correção mínima: refletir a invalidez no input visível com `aria-invalid`/classe e limpar esse estado após seleção válida. Este achado foi conferido no código, sem submissão real no navegador.

## Conferência por tela

Valores abaixo são declarações CSS; somente as medidas identificadas na validação foram verificadas no navegador. Os componentes compartilhados também afetam as telas que os usam.

| Tela / arquivo em `front-end/src/pages` | Inputs e seletores | Botões / resultado |
| --- | --- | --- |
| Auditoria | Mínimo 40 px, cantos 8 px, borda 1 px inline | Atualizar com mínimo 40 px/8 px. Diverge da base; foco afetado pela borda inline. |
| Caixa | Mínimos de 38, 40, 42 e 44 px; cantos 7–8 px | Ações com 40–42 px/8 px. Fonte de 18 px do total é sobrescrita. |
| Comandas | Classe própria e campos inline; contador possui dimensões próprias | Ações de 44–50 px, cantos 10–12 px, pesos 700–800; secundários diferem da variante global. Revisar checkbox sem confundir contador com formulário. |
| Configurações | Textarea com mínimo 80 px, raio 9 px; checkbox sofre mínimo global | Modal usa mínimo 44 px/9 px, peso 800. Corrigir checkbox antes de ajustes cosméticos. |
| ContasReceber | Bordas inline de 1 px e cantos 9–10 px; novo pedido tem regra própria | Ações com raios 8–10 px, fontes 12–14 px e vários estilos de recebimento. Seleção por checkbox e foco precisam revisão. |
| Customers | Usa `.input-field`, inclusive endereço; referência mais próxima da base | Usa `.btn` e variantes pequenas para ações da lista. Consistente com as variantes existentes; herda problemas globais de contraste/paginação. |
| Dashboard | Filtros com mínimos de 36–38 px e cantos 8 px | Ações com mínimos de 32–42 px e cantos 7–8 px. Separar filtros compactos das ações de formulário antes de uniformizar. |
| DeliveryAdmin | Regras de `.delivery-app`: mínimo 46 px/10 px, cores fixas claras | Variante verde própria. Arquivo sem rota direta atual; `/DeliveryAdmin` redireciona a Entregas. |
| DeliveryEntregador | Login fornecido por DeliveryPortal, mínimo 46 px | Ações grandes de 56 px são uma exceção funcional para uso na rua; estilo verde próprio. Link de ligação usa `delivery-button`. |
| DeliveryEntry | Não declara controles: escolhe Layout/Entregas ou redireciona | Conferido pelo destino Entregas. |
| DeliveryPlataforma | Regras de DeliveryPortal, cores claras fixas | Variante verde própria. `/plataforma` redireciona a Entregas; sem rota direta atual para esse componente. |
| Entregas | `.delivery-board` usa tokens do tema, cantos 8 px; herda mínimo 46 px de delivery | Botões com cantos 9 px e estilos próprios. Compartilha cores do PDV, mas não todas as medidas. |
| FichasTecnicas | Mínimo 42 px/cantos 8 px no formulário | Variantes `.primary/.secondary/.danger`, filtros com mínimo 38 px. Renderizado dentro de Produção; revisar as duas folhas juntas. |
| Financeiro | Mínimo 42 px/8 px, fundo terciário; checkbox possui exceção própria | Ações com mínimos 36–42 px, pesos/tipos próprios. Cores de exclusão parcialmente fixas. |
| Kitchen | Não declara campos | Ação de pronto com mínimo 48 px/10 px; verde de sucesso é semanticamente adequado. Herda variantes dos componentes compartilhados. |
| Login | Mínimo 50 px/12 px, padding próprio | Envio com mínimo 52 px/12 px. Indicadores de imagem têm altura explícita de 6 px, sem área maior de clique. |
| Mesas | Não declara controles nativos; delega ao MesasDrawer | Sem rota direta atual em App; drawer também é usado pelo PDV. |
| MesasCadastro | Mínimos de 42 e 46 px; cantos 10 px | Adicionar com mínimo 46 px; salvar 48 px; editar com raio 8 px. Checkbox sem exceção completa do mínimo global. |
| Orders | Campos usam classes da base | Detalhes com mínimo 34 px/8 px, fechar com mínimo 44 px; sem rota/importação atual em App. Não confundir com o histórico do Dashboard. |
| PaymentSettings | Mínimo 46 px/9 px, borda 1 px | Mínimo 44 px/9 px e peso 800, em vez das variantes globais. |
| PDV | Campos principais próximos da base; pagamento com mínimo 46 px/9 px; quantidade/desconto próprios | Concluir e comprovantes usam mínimos 50–52 px/12 px; demais ações 32–48 px. Contador é uma exceção funcional; pagamento diverge de outros formulários. |
| Production | Mínimo 44 px/8 px em formulários | Variantes com mínimo 38 px/8 px e abas 42 px. Ver também FichasTecnicas, montado na mesma página. |
| Products | Campos de 42 px/8 px; filtros com mínimo 40 px/9 px; checkbox/radio têm estilos próprios | Envio 44 px/9 px, mobile 46 px; chips 40 px; estilos próprios apesar das classes globais disponíveis. |
| Purchases | Mínimo 42 px/8 px; modal tem regras de mínimo 44 px | Variantes locais com mínimo 38 px; modal usa 42 px/8 px e 44 px no mobile. |
| RastreioEntrega | Não declara inputs/botões nativos | Link “Fazer novo pedido” tem aparência de botão delivery; segue identidade verde clara própria. |
| Users | Fonte 16 px, borda 1 px inline, cantos 9 px | Ações principais têm fonte 15 px/raio 10 px; secundários e exclusão têm mínimo 36 px/8 px. Foco e checkbox merecem revisão. |

## Componentes compartilhados

| Componente | Resultado |
| --- | --- |
| DateInput | Repassa `style`/demais props; aparência depende do chamador. Não padroniza medidas sozinho. |
| SearchableSelect | Reutiliza estilo de input e navegação própria; estado visual inválido diverge. Lista é desenhada por portal com tokens do tema. |
| FieldLabel | Padrão existente de ajuda inline no desktop e flutuante no mobile deve ser preservado; não foi revalidado funcionalmente nesta revisão. |
| Paginacao | Conflito confirmado entre seletor 32 px e botão 48 px. |
| AutorizarGerente | Senha declara fonte 14 px/raio 8 px; Layout impõe 16 px nas telas internas. Botões com mínimo 44 px/10 px. |
| ConfirmarAcao / NovidadesModal | Botões semelhantes de mínimo 44 px/10 px, mas duplicam estilos em vez das variantes existentes. |
| PagamentoResultadoModal | Imprimir com fundo `--brand-brown` e texto branco perde contraste no tema escuro. |
| TrocoAuxiliar | Fonte 16 px/raio 10 px, mas padding e borda diferentes da base. |
| DeliveryPDV | Mínimo 44 px/8 px; aparência difere dos campos principais do PDV. |
| DeliveryPortal | Identidade delivery própria; login, sair e ações usam CSS delivery, inclusive na área do entregador. |
| ImpressoraManager | Campos com mínimos 38–40 px, botões 42 px/9 px, em vez da base. |
| ProductSalesHistory | Filtros com mínimo 40 px/8 px; navegação declara altura 40 px sem neutralizar mínimo global. |
| CentralDoDia | Reposição com mínimo 42 px/8 px; botões de mínimo 36 px/8 px. |
| DashboardTabs / DeliveryAnalytics | Variantes de abas e filtros; diferenças de função válidas, mas várias medidas próprias. |
| AlertasModal | Fechar declara 44 × 44 px sem neutralizar mínimo global de 48 px. |
| MesasDrawer | Seleção de mesa tem apresentação própria; não substituir cartões de seleção por botões comuns. |
| Layout | Base de fonte da aplicação interna e regra global `16px!important`; botões de menu, tema e sair têm estilos próprios. |
| EstadoLista / ErrorBoundary / StatusConexao | Ações auxiliares seguem estilos locais ou a regra global; incluir na futura padronização das ações de tentar novamente. |

## Validação e limites

- Parser JSX percorreu todos os arquivos de `front-end/src` e produziu o inventário individual, sem instalar dependências.
- Chrome headless executou uma página isolada com o CSS real de theme, Produtos, Configurações, Caixa, Paginação e a regra de fonte do Layout. **16 verificações passaram**, oito em cada tema. Transições foram desativadas somente nessa página de teste para medir os valores finais.
- Foram confirmados: Produtos 42 px, campo padrão 48 px, checkbox 48 px, seletor da paginação 32 px, botão da paginação 48 px, fonte do Caixa sobrescrita para 16 px, borda inline preservada ao focar e cores da ação primária nos dois temas.
- Contraste foi calculado diretamente a partir das cores declaradas; não é uma auditoria completa de contraste de todos os estados e fundos.
- Cypress não iniciou: retorno do processo `3221225501`, mensagem `Could not find Cypress test run results`. Nenhum teste Cypress desta tarefa foi concluído. A validação em Chrome foi um teste isolado da cascata CSS, não navegação autenticada pelas telas.
- Não foram feitos testes completos de cliques, submissão, foco por teclado, mobile real, Safari, todos os estados condicionais ou todos os tamanhos de tela. Não foram alterados componentes, regras CSS, dados ou APIs.

Recomendação: corrigir primeiro contraste, checkbox, paginação e estado inválido; depois reutilizar `.input-field` e `.btn` nos formulários equivalentes. Preservar contadores, cartões de mesa, abas e ações maiores do entregador como variantes funcionais.
