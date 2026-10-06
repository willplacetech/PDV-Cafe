// Produtos com peso cadastrado por unidade continuam com contagem inteira.
export const permiteFracionar = (produto) => !Number(produto?.pesoPorUnidade) && ['kg', 'L'].includes(produto?.unidadeVenda);
