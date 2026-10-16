const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const { exigirAutorizacao } = require('../middleware/exigirAutorizacao');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Comanda = require('../models/Comanda');
const { parsePagination, createPaginationResponse } = require('../utils/pagination');
const normalizarTelefone = (telefone) => String(telefone || '').replace(/\D/g, '');
const normalizarCpf = (cpf) => String(cpf || '').replace(/\D/g, '');
const filtroCpf = (cpf) => ({ $regex: `^${normalizarCpf(cpf).split('').join('\\D*')}$` });
const normalizarEnderecoEntrega = (endereco) => {
  if (endereco === undefined) return undefined;
  if (!endereco || typeof endereco !== 'object' || Array.isArray(endereco)) return null;
  const limites = { rua: 300, numero: 30, bairro: 120, complemento: 200, referencia: 200 };
  const resultado = {};
  for (const [campo, limite] of Object.entries(limites)) {
    const valor = endereco[campo] ?? '';
    if (typeof valor !== 'string' || valor.length > limite) return null;
    resultado[campo] = valor.trim();
  }
  return resultado;
};

// @route   GET api/customers
// @desc    Listar clientes com busca
// @access  Privado
router.get('/', auth, auth.allowRoles('admin', 'gerente'), async (req, res) => {
  try {
    const { search } = req.query;
    if (search !== undefined && typeof search !== 'string') return res.status(400).json({ msg: 'Busca inválida' });
    const pagination = parsePagination(req.query);
    await Customer.findOneAndUpdate(
      { clienteInterno: true },
      { $setOnInsert: { nome: 'Cliente Interno', clienteInterno: true, createdBy: req.user.id } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    let query = {};

    if (search) {
      query = {
        $or: [
          { nome: { $regex: search, $options: 'i' } },
          { telefone: { $regex: search, $options: 'i' } },
        ],
      };
    }

    const total = pagination.requested ? await Customer.countDocuments(query) : null;
    let customersQuery = Customer.find(query).sort({ nome: 1, _id: 1 });
    if (pagination.requested) {
      const totalPaginas = Math.ceil(total / pagination.limite);
      const pagina = Math.min(pagination.pagina, Math.max(1, totalPaginas));
      customersQuery = customersQuery.skip((pagina - 1) * pagination.limite).limit(pagination.limite);
    }
    const customers = await customersQuery;
    res.json(pagination.requested
      ? createPaginationResponse(customers, total, pagination)
      : customers);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ msg: err.message });
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

router.get('/pdv', auth, auth.allowRoles('admin', 'gerente', 'operador', 'garcom'), async (req, res) => {
  try {
    const { search } = req.query;
    const query = {};
    await Customer.findOneAndUpdate(
      { clienteInterno: true },
      { $setOnInsert: { nome: 'Cliente Interno', clienteInterno: true, createdBy: req.user.id } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    if (search) {
      if (typeof search !== 'string') return res.status(400).json({ msg: 'Busca inválida' });
      query.$or = [
        { nome: { $regex: search, $options: 'i' } },
        { telefone: { $regex: search, $options: 'i' } },
      ];
    }
    const customers = await Customer.find(query)
      .select('_id nome telefone enderecoEntrega cafesFidelidade clienteInterno')
      .sort({ nome: 1 });
    res.json(customers);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Erro ao buscar clientes do PDV' });
  }
});

router.get('/:id', auth, auth.allowRoles('admin', 'gerente'), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ msg: 'Cliente não encontrado' });
    res.json(customer);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Cliente não encontrado' });
    }
    res.status(500).send('Erro no servidor');
  }
});

// @route   POST api/customers
// @desc    Criar cliente
// @access  Privado
router.post(
  '/',
  [auth, auth.allowRoles('admin', 'garcom'), body('nome', 'Nome é obrigatório').not().isEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { nome, telefone, endereco, cpf, aniversario } = req.body;
      const enderecoEntrega = normalizarEnderecoEntrega(req.body.enderecoEntrega);
      if (enderecoEntrega === null) return res.status(400).json({ msg: 'Endereço de entrega inválido' });
      const telefoneNormalizado = normalizarTelefone(telefone);
      const cpfNormalizado = normalizarCpf(cpf);
      if (cpfNormalizado && cpfNormalizado.length !== 11) return res.status(400).json({ msg: 'CPF inválido' });
      if (cpfNormalizado && await Customer.exists({ cpf: filtroCpf(cpfNormalizado) })) {
        return res.status(409).json({ msg: 'CPF já cadastrado' });
      }
      if (telefoneNormalizado && await Customer.exists({ telefone: telefoneNormalizado })) {
        return res.status(409).json({ msg: 'Telefone já cadastrado' });
      }

      const customer = new Customer({
        nome: nome.trim(),
        telefone: telefoneNormalizado,
        endereco: endereco ? endereco.trim() : '',
        enderecoEntrega,
        aniversario: aniversario ? aniversario.trim() : '',
        cpf: cpfNormalizado,
        createdBy: req.user.id,
      });

      await customer.save();
      res.status(201).json(customer);
    } catch (err) {
      console.error(err.message);
      if (err.code === 11000) return res.status(409).json({ msg: 'Telefone já cadastrado' });
      res.status(500).send('Erro no servidor');
    }
  }
);

// @route   PUT api/customers/:id
// @desc    Atualizar cliente
// @access  Privado
router.put('/:id', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    if (await Customer.exists({ _id: req.params.id, clienteInterno: true })) {
      return res.status(409).json({ msg: 'O Cliente Interno é reservado para consumo da equipe e não pode ser alterado' });
    }
    const { nome, telefone, endereco, cpf, aniversario } = req.body;
    const cpfNormalizado = cpf === undefined ? undefined : normalizarCpf(cpf);
    if (cpfNormalizado && cpfNormalizado.length !== 11) return res.status(400).json({ msg: 'CPF inválido' });
    if (cpfNormalizado && await Customer.exists({ cpf: filtroCpf(cpfNormalizado), _id: { $ne: req.params.id } })) {
      return res.status(409).json({ msg: 'CPF já cadastrado' });
    }
    if (req.body.cafesFidelidade !== undefined
      && (!Number.isSafeInteger(req.body.cafesFidelidade) || req.body.cafesFidelidade < 0)) {
      return res.status(400).json({ msg: 'Total histórico de comandas deve ser um inteiro não negativo' });
    }
    const enderecoEntrega = normalizarEnderecoEntrega(req.body.enderecoEntrega);
    if (enderecoEntrega === null) return res.status(400).json({ msg: 'Endereço de entrega inválido' });
    const telefoneNormalizado = telefone !== undefined ? normalizarTelefone(telefone) : undefined;
    if (telefoneNormalizado && await Customer.exists({ telefone: telefoneNormalizado, _id: { $ne: req.params.id } })) {
      return res.status(409).json({ msg: 'Telefone já cadastrado' });
    }

    const updateFields = {};
    if (nome) updateFields.nome = nome.trim();
    if (telefone !== undefined) updateFields.telefone = telefoneNormalizado;
    if (endereco !== undefined) updateFields.endereco = endereco.trim();
    if (enderecoEntrega !== undefined) updateFields.enderecoEntrega = enderecoEntrega;
    if (aniversario !== undefined) updateFields.aniversario = aniversario.trim();
    if (cpfNormalizado !== undefined) updateFields.cpf = cpfNormalizado;
    if (req.body.cafesFidelidade !== undefined) updateFields.cafesFidelidade = req.body.cafesFidelidade;

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({ msg: 'Cliente não encontrado' });
    }

    res.json(customer);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Cliente não encontrado' });
    }
    if (err.code === 11000) return res.status(409).json({ msg: 'Telefone já cadastrado' });
    res.status(500).send('Erro no servidor');
  }
});

// @route   DELETE api/customers/:id
// @desc    Deletar cliente
// @access  Privado
router.delete('/:id', auth, auth.allowRoles('admin'), exigirAutorizacao('excluir_cliente'), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ msg: 'Cliente não encontrado' });
    }

    if (customer.clienteInterno) return res.status(409).json({ msg: 'O Cliente Interno é reservado para consumo da equipe e não pode ser excluído' });

    const [pendenciaFinanceira, comandaAberta] = await Promise.all([
      Order.exists({ clienteId: req.params.id, status: { $in: ['pendente', 'parcial'] } }),
      Comanda.exists({ clienteId: req.params.id, status: 'aberta' }),
    ]);
    if (pendenciaFinanceira || comandaAberta) {
      return res.status(409).json({ msg: 'Não é possível excluir cliente com pendências financeiras' });
    }

    await Customer.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Cliente removido com sucesso' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Cliente não encontrado' });
    }
    res.status(500).send('Erro no servidor');
  }
});

module.exports = router;
