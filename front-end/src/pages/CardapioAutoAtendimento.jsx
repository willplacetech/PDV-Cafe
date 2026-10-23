import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  carregarCardapio,
  cotarPedidoAutoAtendimento,
  enviarPedidoAutoAtendimento,
} from '../services/cardapioAutoAtendimento.js';

const chaveCliente = (mesaToken) => `pdv-cardapio-cliente:${mesaToken}`;
const somenteDigitos = (valor) => valor.replace(/\D/g, '').slice(0, 13);
const formatarTelefone = (valor) => {
  const digitos = somenteDigitos(valor);
  const nacional = digitos.length > 11 ? digitos.slice(-11) : digitos;
  const codigoPais = digitos.length > 11 ? `+${digitos.slice(0, -11)} ` : '';
  if (nacional.length < 3) return codigoPais + nacional;
  const ddd = nacional.slice(0, 2);
  const numero = nacional.slice(2);
  if (numero.length <= 4) return `${codigoPais}(${ddd}) ${numero}`;
  const tamanhoPrefixo = numero.length > 8 ? 5 : 4;
  return `${codigoPais}(${ddd}) ${numero.slice(0, tamanhoPrefixo)}-${numero.slice(tamanhoPrefixo)}`;
};
const formatarPreco = (valor) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(valor || 0));
const gerarChaveIdempotencia = () => Array.from(
  window.crypto.getRandomValues(new Uint8Array(16)),
  (byte) => byte.toString(16).padStart(2, '0'),
).join('');

export default function CardapioAutoAtendimento() {
  const { mesaToken = '' } = useParams();
  const [dadosIniciais] = useState(() => {
    try {
      const salvo = window.sessionStorage.getItem(chaveCliente(mesaToken));
      if (!salvo) return { cliente: { nome: '', telefone: '' }, feedback: '' };
      const dados = JSON.parse(salvo);
      if (typeof dados.nome === 'string' && typeof dados.telefone === 'string') {
        return {
          cliente: { nome: dados.nome, telefone: formatarTelefone(dados.telefone) },
          feedback: '',
        };
      }
    } catch {
      return {
        cliente: { nome: '', telefone: '' },
        feedback: 'Não foi possível recuperar os dados desta sessão. Confira seu nome e telefone.',
      };
    }
    return { cliente: { nome: '', telefone: '' }, feedback: '' };
  });
  const [cliente, setCliente] = useState(dadosIniciais.cliente);
  const [etapa, setEtapa] = useState('identificacao');
  const [cardapio, setCardapio] = useState(null);
  const [carrinho, setCarrinho] = useState({});
  const [cotacao, setCotacao] = useState(null);
  const [erroCotacao, setErroCotacao] = useState('');
  const [tentativaCotacao, setTentativaCotacao] = useState(0);
  const [consentimento, setConsentimento] = useState(false);
  const [feedback, setFeedback] = useState(dadosIniciais.feedback);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pedidoConfirmado, setPedidoConfirmado] = useState(null);
  const [tentativaCardapio, setTentativaCardapio] = useState(0);
  const idempotencia = useRef(null);

  useEffect(() => {
    if (etapa !== 'cardapio') return undefined;
    let ativo = true;
    carregarCardapio(mesaToken)
      .then((dados) => {
        if (ativo) setCardapio(dados);
      })
      .catch((error) => {
        if (ativo) setFeedback(error.response?.data?.msg || 'Não foi possível carregar o cardápio. Tente novamente.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => { ativo = false; };
  }, [etapa, mesaToken, tentativaCardapio]);

  const itensCarrinho = useMemo(() => Object.values(carrinho), [carrinho]);
  const assinaturaCotacao = JSON.stringify(itensCarrinho.map((item) => ({
    produtoId: item.produto.produtoId,
    quantidade: item.quantidade,
  })));
  const cotacaoAtual = cotacao?.assinatura === assinaturaCotacao ? cotacao : null;
  const cotacaoPendente = itensCarrinho.length > 0 && !cotacaoAtual && !erroCotacao;
  const itensCotados = useMemo(
    () => new Map((cotacaoAtual?.itens || []).map((item) => [item.produtoId, item])),
    [cotacaoAtual],
  );

  useEffect(() => {
    if (etapa !== 'cardapio') return undefined;
    if (assinaturaCotacao === '[]') return undefined;

    let ativo = true;
    const itens = JSON.parse(assinaturaCotacao);
    const timer = setTimeout(() => {
      cotarPedidoAutoAtendimento(mesaToken, itens)
        .then((dados) => {
          if (ativo) setCotacao({ ...dados, assinatura: assinaturaCotacao });
        })
        .catch((error) => {
          if (ativo) setErroCotacao(error.response?.data?.msg || 'Não foi possível atualizar os preços. Tente novamente.');
        });
    }, 250);

    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [etapa, mesaToken, assinaturaCotacao, tentativaCotacao]);

  const avancarParaCardapio = (event) => {
    event.preventDefault();
    setFeedback('');
    const nome = cliente.nome.trim();
    const telefone = somenteDigitos(cliente.telefone);
    if (!nome || nome.length > 120) {
      setFeedback('Informe um nome válido.');
      return;
    }
    if (telefone.length < 10 || telefone.length > 13) {
      setFeedback('Informe um telefone válido com pelo menos 10 dígitos.');
      return;
    }
    const dados = { nome, telefone };
    try {
      window.sessionStorage.setItem(chaveCliente(mesaToken), JSON.stringify(dados));
    } catch {
      setFeedback('Não foi possível salvar seus dados nesta sessão. Mantenha esta página aberta para continuar.');
    }
    setCarregando(true);
    setCliente({ nome, telefone: formatarTelefone(telefone) });
    setEtapa('cardapio');
  };

  const tentarCarregarCardapio = () => {
    setFeedback('');
    setCarregando(true);
    setTentativaCardapio((atual) => atual + 1);
  };

  const alterarQuantidade = (produto, diferenca) => {
    setCotacao(null);
    setErroCotacao('');
    setCarrinho((atual) => {
      const quantidade = (atual[produto.produtoId]?.quantidade || 0) + diferenca;
      const proximo = { ...atual };
      if (quantidade <= 0) delete proximo[produto.produtoId];
      else {
        proximo[produto.produtoId] = {
          produto,
          quantidade: Math.min(99, quantidade),
          observacao: atual[produto.produtoId]?.observacao || '',
        };
      }
      return proximo;
    });
  };

  const editarObservacao = (produtoId, observacao) => {
    setCarrinho((atual) => ({
      ...atual,
      [produtoId]: { ...atual[produtoId], observacao: observacao.slice(0, 250) },
    }));
  };

  const finalizarPedido = async (event) => {
    event.preventDefault();
    if (!itensCarrinho.length) {
      setFeedback('Adicione pelo menos um item ao pedido.');
      return;
    }
    if (!cotacaoAtual) {
      setFeedback('Aguarde a atualização dos preços antes de confirmar o pedido.');
      return;
    }
    if (!consentimento) {
      setFeedback('Aceite as atualizações do pedido por WhatsApp para continuar.');
      return;
    }
    const payload = {
      mesaToken,
      clienteNome: cliente.nome.trim(),
      clienteTelefone: somenteDigitos(cliente.telefone),
      consentimentoWhatsApp: true,
      cotacaoToken: cotacaoAtual.cotacaoToken,
      itens: itensCarrinho.map((item) => ({
        produtoId: item.produto.produtoId,
        quantidade: item.quantidade,
        observacao: item.observacao.trim(),
      })),
    };
    const assinatura = JSON.stringify(payload);
    if (idempotencia.current?.assinatura !== assinatura) {
      idempotencia.current = { assinatura, chave: gerarChaveIdempotencia() };
    }
    setEnviando(true);
    setFeedback('');
    try {
      const confirmacao = await enviarPedidoAutoAtendimento(payload, idempotencia.current.chave);
      try {
        window.sessionStorage.removeItem(chaveCliente(mesaToken));
      } catch {
        setFeedback('Pedido enviado. Não foi possível limpar os dados salvos nesta sessão; feche esta aba ao terminar.');
      }
      setPedidoConfirmado(confirmacao);
      setEtapa('confirmado');
      idempotencia.current = null;
    } catch (error) {
      if (error.response?.data?.code === 'COTACAO_DESATUALIZADA') {
        setCotacao(null);
        setErroCotacao('');
        setTentativaCotacao((atual) => atual + 1);
      }
      setFeedback(error.response?.data?.msg || 'Não foi possível enviar o pedido. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="qr-menu-page">
      <style>{styles}</style>
      <section className="qr-menu-shell">
        <header className="qr-menu-heading">
          <span className="qr-menu-eyebrow">SABOR DE ABRAÇO</span>
          <h1>{etapa === 'identificacao' ? 'Antes de pedir' : etapa === 'confirmado' ? 'Pedido enviado' : 'Cardápio'}</h1>
          {cardapio?.mesa && etapa !== 'identificacao' && <p>{cardapio.mesa.nome} · Mesa {cardapio.mesa.numero}</p>}
        </header>

        {feedback && <p className="qr-menu-feedback" role="alert">{feedback}</p>}

        {etapa === 'identificacao' && (
          <form className="qr-menu-form" onSubmit={avancarParaCardapio}>
            <p>Informe seus dados para fazer o pedido na mesa.</p>
            <label>
              Nome
              <input
                autoComplete="name"
                name="clienteNome"
                maxLength={120}
                value={cliente.nome}
                onChange={(event) => setCliente((atual) => ({ ...atual, nome: event.target.value }))}
                required
              />
            </label>
            <label>
              Telefone
              <input
                autoComplete="tel"
                inputMode="tel"
                name="clienteTelefone"
                type="tel"
                value={cliente.telefone}
                onChange={(event) => setCliente((atual) => ({ ...atual, telefone: formatarTelefone(event.target.value) }))}
                required
              />
            </label>
            <button className="qr-menu-primary" type="submit">Continuar</button>
          </form>
        )}

        {etapa === 'cardapio' && (
          <>
            {carregando && <p role="status">Carregando cardápio...</p>}
            {!carregando && !cardapio && (
              <button className="qr-menu-primary" type="button" onClick={tentarCarregarCardapio}>
                Tentar novamente
              </button>
            )}
            {cardapio && (
              <form onSubmit={finalizarPedido}>
                <div className="qr-menu-products">
                  {cardapio.produtos.map((produto) => {
                    const itemCarrinho = carrinho[produto.produtoId];
                    return (
                      <article className="qr-menu-product" data-testid={`produto-qr-${produto.produtoId}`} key={produto.produtoId}>
                        <div className="qr-menu-product-heading">
                          <div><h2>{produto.nome}</h2><small>{produto.categoria}</small></div>
                          <strong>{formatarPreco(produto.preco)} <small>preço base</small></strong>
                        </div>
                        {itemCarrinho ? (
                          <div className="qr-menu-item-controls">
                            <div className="qr-menu-quantity">
                              <button type="button" aria-label={`Remover uma unidade de ${produto.nome}`} onClick={() => alterarQuantidade(produto, -1)}>−</button>
                              <output aria-label={`Quantidade de ${produto.nome}`}>{itemCarrinho.quantidade}</output>
                              <button type="button" aria-label={`Adicionar uma unidade de ${produto.nome}`} onClick={() => alterarQuantidade(produto, 1)}>+</button>
                            </div>
                            <label>
                              Observação
                              <textarea
                                aria-label={`Observação ${produto.nome}`}
                                maxLength={250}
                                value={itemCarrinho.observacao}
                                onChange={(event) => editarObservacao(produto.produtoId, event.target.value)}
                                placeholder="Ex.: sem cebola"
                              />
                            </label>
                          </div>
                        ) : (
                          <button className="qr-menu-add" type="button" onClick={() => alterarQuantidade(produto, 1)}>Adicionar</button>
                        )}
                      </article>
                    );
                  })}
                </div>

                <section className="qr-menu-summary" aria-label="Resumo do pedido">
                  <strong>Resumo</strong>
                  {itensCarrinho.map((item) => (
                    <p key={item.produto.produtoId}>
                      {item.quantidade} × {item.produto.nome}
                      <span>
                        {cotacaoAtual
                          ? formatarPreco(itensCotados.get(item.produto.produtoId)?.total)
                          : 'Calculando...'}
                      </span>
                    </p>
                  ))}
                  <p className="qr-menu-total">
                    <strong>Total do pedido</strong>
                    <strong>{cotacaoAtual ? formatarPreco(cotacaoAtual.total) : 'Calculando...'}</strong>
                  </p>
                  {erroCotacao && (
                    <div role="alert">
                      <p>{erroCotacao}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setCotacao(null);
                          setErroCotacao('');
                          setTentativaCotacao((atual) => atual + 1);
                        }}
                      >
                        Tentar atualizar os preços
                      </button>
                    </div>
                  )}
                  {cotacaoPendente && <p role="status">Atualizando preços...</p>}
                </section>

                <label className="qr-menu-consent">
                  <input
                    checked={consentimento}
                    name="consentimentoWhatsApp"
                    onChange={(event) => setConsentimento(event.target.checked)}
                    required
                    type="checkbox"
                  />
                  <span>Aceito receber atualizações do meu pedido por WhatsApp</span>
                </label>
                <button
                  className="qr-menu-primary"
                  type="submit"
                  disabled={enviando || cotacaoPendente || !cotacaoAtual || !itensCarrinho.length}
                >
                  {enviando ? 'Enviando...' : 'Finalizar pedido'}
                </button>
              </form>
            )}
          </>
        )}

        {etapa === 'confirmado' && pedidoConfirmado && (
          <section className="qr-menu-confirmation" role="status">
            <p>Seu pedido foi enviado para a equipe.</p>
            <strong>Pedido #{pedidoConfirmado.numero}</strong>
            <span>Status: {pedidoConfirmado.status === 'aberta' ? 'recebido' : pedidoConfirmado.status}</span>
          </section>
        )}
      </section>
    </main>
  );
}

const styles = `
.qr-menu-page{min-height:100vh;padding:24px 16px;background:var(--bg-primary);color:var(--text-primary)}
.qr-menu-shell{max-width:680px;margin:0 auto;padding:24px;border:1px solid var(--border-color);border-radius:18px;background:var(--bg-secondary);box-shadow:var(--shadow-md)}
.qr-menu-heading{margin-bottom:20px}
.qr-menu-eyebrow{color:var(--accent-primary);font-size:11px;font-weight:800;letter-spacing:.12em}
.qr-menu-heading h1{margin:6px 0;font-size:28px}
.qr-menu-heading p,.qr-menu-form>p{margin:0;color:var(--text-secondary)}
.qr-menu-form,.qr-menu-products{display:grid;gap:14px}
.qr-menu-form label,.qr-menu-product label{display:grid;gap:6px;font-weight:700}
.qr-menu-form input,.qr-menu-product textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--input-bg);color:var(--text-primary);font:inherit}
.qr-menu-product textarea{min-height:72px;resize:vertical}
.qr-menu-primary,.qr-menu-add{min-height:48px;padding:12px 16px;border:0;border-radius:10px;background:var(--accent-primary);color:var(--accent-text);font:inherit;font-weight:800;cursor:pointer}
.qr-menu-primary:disabled{opacity:.55;cursor:not-allowed}
.qr-menu-feedback{padding:12px;border-radius:10px;background:var(--warning-light,var(--bg-tertiary));color:var(--text-primary)}
.qr-menu-products{margin:18px 0}
.qr-menu-product{padding:16px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-primary)}
.qr-menu-product-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.qr-menu-product h2{margin:0 0 5px;font-size:17px}
.qr-menu-product small{color:var(--text-secondary)}
.qr-menu-product-heading>strong{white-space:nowrap}
.qr-menu-add{min-height:40px;margin-top:14px;padding:8px 14px}
.qr-menu-item-controls{display:grid;gap:12px;margin-top:14px}
.qr-menu-quantity{display:flex;align-items:center;gap:12px}
.qr-menu-quantity button{width:42px;height:42px;border:1px solid var(--border-color);border-radius:9px;background:var(--bg-secondary);color:var(--text-primary);font-size:20px;cursor:pointer}
.qr-menu-quantity output{min-width:24px;text-align:center;font-weight:800}
.qr-menu-summary{margin:18px 0;padding:16px;border:1px solid var(--border-color);border-radius:12px}
.qr-menu-summary>strong{font-size:17px}
.qr-menu-summary p{display:flex;justify-content:space-between;gap:12px;color:var(--text-secondary)}
.qr-menu-summary .qr-menu-total{padding-top:12px;border-top:1px solid var(--border-color);color:var(--text-primary)}
.qr-menu-consent{display:flex;align-items:flex-start;gap:10px;margin:18px 0;font-weight:600;line-height:1.5}
.qr-menu-consent input{width:20px;height:20px;flex:0 0 auto;accent-color:var(--accent-primary)}
.qr-menu-confirmation{display:grid;gap:8px;padding:18px;border-radius:12px;background:var(--accent-light);text-align:center}
.qr-menu-confirmation p{margin:0}
.qr-menu-confirmation strong{font-size:24px;color:var(--accent-primary)}
@media(max-width:520px){.qr-menu-page{padding:12px 10px}.qr-menu-shell{padding:18px 14px}.qr-menu-heading h1{font-size:24px}}
`;
