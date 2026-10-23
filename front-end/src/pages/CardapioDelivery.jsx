import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { carregarCatalogoDelivery, criarPedidoDeliveryPublico } from '../services/deliveryPublicoApi.js';
import './CardapioHub.css';

export default function CardapioDelivery() {
  const [produtos, setProdutos] = useState([]); const [quantidades, setQuantidades] = useState({}); const [form, setForm] = useState({ nomeCliente: '', telefone: '', rua: '', numero: '', bairro: '' }); const [erro, setErro] = useState(''); const [enviando, setEnviando] = useState(false); const navigate = useNavigate();
  useEffect(() => { carregarCatalogoDelivery().then(data => setProdutos(data.produtos || [])).catch(error => setErro(error.response?.data?.msg || 'Não foi possível carregar o cardápio.')); }, []);
  const alterar = (codigo, delta) => setQuantidades(atual => { const n = Math.max(0, Number(atual[codigo] || 0) + delta); return { ...atual, [codigo]: n }; });
  const itens = produtos.filter(p => quantidades[p.codigo] > 0).map(p => ({ ...p, quantidade: quantidades[p.codigo] }));
  const atualizar = event => setForm(atual => ({ ...atual, [event.target.name]: event.target.value }));
  const enviar = async event => { event.preventDefault(); setEnviando(true); setErro(''); try { const data = await criarPedidoDeliveryPublico({ ...form, endereco: form, itens: itens.map(p => ({ codigo: p.codigo, quantidade: p.quantidade })) }, `delivery-${Date.now()}`); navigate(data.rastreio); } catch (error) { setErro(error.response?.data?.msg || 'Não foi possível enviar o pedido.'); } finally { setEnviando(false); } };
  return <main className="cardapio-hub"><section className="cardapio-hub__shell"><Link to="/cardapio">← Voltar ao cardápio</Link><h1>Pedido delivery</h1>{erro && <p role="alert">{erro}</p>}<div>{produtos.map(p => <p key={p.codigo}><strong>{p.nome}</strong> — R$ {Number(p.preco).toFixed(2)} <button type="button" onClick={() => alterar(p.codigo, -1)}>−</button> {quantidades[p.codigo] || 0} <button type="button" onClick={() => alterar(p.codigo, 1)}>+</button></p>)}</div><form onSubmit={enviar}><input name="nomeCliente" placeholder="Nome" value={form.nomeCliente} onChange={atualizar} required /><input name="telefone" placeholder="Telefone" value={form.telefone} onChange={atualizar} required /><input name="rua" placeholder="Rua" value={form.rua} onChange={atualizar} required /><input name="numero" placeholder="Número" value={form.numero} onChange={atualizar} required /><input name="bairro" placeholder="Bairro" value={form.bairro} onChange={atualizar} required /><button type="submit" disabled={enviando || !itens.length}>{enviando ? 'Enviando…' : 'Enviar pedido'}</button></form></section></main>;
}
