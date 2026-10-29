# 7 Leis de UX/UI Essenciais

## 1. Lei de Fitts (Fitts's Law)
Princípio: O tempo necessário para mover um apontador para um alvo alvo é uma função do tamanho do alvo e da distância até ele.

Equação: T = a + b * log2(D/W + 1)
- T = tempo de movimento
- D = distância até o alvo
- W = largura do alvo
- a, b = constantes

Aplicação prática:
- Botões maiores e mais próximos são mais rápidos de clicar
- Cantos e bordas da tela são 'infinitos' - menus nos cantos são fáceis de alcançar
- Áreas de toque em mobile devem ter pelo menos 44-48px
- Colocar itens de ação principal nos cantos ou bordas

## 2. Lei de Hick (Hick's Law)
Princípio: O tempo de tomada de decisão aumenta com o número e a complexidade das opções.

Fórmula: T = b * log2(n + 1)
- T = tempo de decisão
- n = número de escolhas
- b = constante

Aplicação prática:
- Reduzir opções em formulários e menus
- Agrupar opções relacionadas
- Usar progressão de etapas (wizard) em vez de mostrar tudo de uma vez
- Menus de hambúrguer podem reduzir opções visíveis, mas adicionam um passo extra
- Priorizar as ações mais frequentes

## 3. Efeito Zeigarnik (Zeigarnik Effect)
Princípio: As pessoas lembram melhor tarefas incompletas ou interrompidas do que tarefas concluídas.

Aplicação prática:
- Progress bars para indicar conclusão de tarefas
- 'Continue assistindo' em players de vídeo
- Indicadores de não-lidos em feeds
- Estados de carregamento com progresso mostram que algo está acontecendo
- Design de 'checklist' que mostra o que ficou por fazer

## 4. Lei de Jakob (Jakob's Law)
Princípio: Os usuários preferem que seus sites funcionem da mesma forma que outros sites aos quais estão acostumados.

Aplicação prática:
- Padrões de navegação consistentes
- Posição esperada de elementos (logo no topo, menu horizontal)
- Usar convenções estabelecidas em vez de inventar novos padrões
- Testar com usuários de diferentes experiências
- Consistência interna across the application

## 5. Gradiente de Meta (Goal-Gradient Effect)
Princípio: As pessoas se esforçam mais à medida que se aproxima da meta.

Aplicação prática:
- Progress bars em checkouts e cadastros
- Cartões de fidelidade 'completados' no meio incentivam mais
- Animações que mostram progresso aceleram a conclusão
- 'Faltam poucos passos' motiva mais que 'próximo passo'
- Meta visual próxima aumenta a conclusão de tarefas

## 6. Efeito Von Restorff (Von Restorff Effect)
Princípio: Um item que se destaca dos demais é mais lembrado.

Aplicação prática:
- CTA (Call-to-Action) must stand out com cores contrastantes
- Erros de validação realçados em vermelho
- Itens em destaque em listas
- Alertas e mensagens de sucesso diferenciados
- Cuidado para não over-use - tudo em destaque nada se destaca

## 7. Lei de Miller (Miller's Law)
Princípio: A memória de curto humano pode segurar aproximadamente 7±2 itens (agora estimado em 3-4 itens para informações complexas).

Aplicação prática:
- Dividir informações em chunks/groups
- Listas com no máximo 3-7 itens
- Paginação ou infinite scroll com cuidado
- Agrupar itens relacionados sob cabeçalhos
- Não sobrecarregar menus com muitas opções

---

## Aplicação no PDV-Cafe

Estas leis devem ser consideradas no design do sistema:

1. Botões de ação principal devem ser maiores e posicionados em áreas de fácil acesso (cantos/tela)
2. Menus e formulários devem ser simplificados, agrupando opções relacionadas
3. Progresso de comandas deve ser visível usando bars e indicadores
4. Padrões de interface devem seguir convenções conhecidas do mercado de food service
5. Programas de fidelidade se beneficiam de progress bars visíveis
6. CTA (como 'Fechar Comanda') devem se destacar visualmente
7. Listas de itens (produtos, mesas) devem ser agrupadas e limitadas

Risco: Sobrecarregar o sistema com muitas opções visuais pode confundir usuários em situações de alta pressão (ambiente de PDV movimentado).
