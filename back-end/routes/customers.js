const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Comanda = require('../models/Comanda');
const normalizarTelefone = (telefone) => String(telefone || '').replace(/\D/g, '');

// @route   GET api/customers
// @desc    Listar clientes com busca
// @access  Privado
router.get('/', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      query = {
        $or: [
          { nome: { $regex: search, $options: 'i' } },
          { telefone: { $regex: search, $options: 'i' } },
        ],
      };
    }

    const customers = await Customer.find(query).sort({ nome: 1 });
    res.json(customers);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

router.get('/:id', auth, auth.allowRoles('admin', 'operador', 'garcom'), async (req, res) => {
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
      const telefoneNormalizado = normalizarTelefone(telefone);
      if (telefoneNormalizado && await Customer.exists({ telefone: telefoneNormalizado })) {
        return res.status(409).json({ msg: 'Telefone já cadastrado' });
      }

      const customer = new Customer({
        nome: nome.trim(),
        telefone: telefoneNormalizado,
        endereco: endereco ? endereco.trim() : '',
        aniversario: aniversario ? aniversario.trim() : '',
        cpf: cpf ? cpf.trim() : '',
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
    const { nome, telefone, endereco, cpf, aniversario } = req.body;
    const telefoneNormalizado = telefone !== undefined ? normalizarTelefone(telefone) : undefined;
    if (telefoneNormalizado && await Customer.exists({ telefone: telefoneNormalizado, _id: { $ne: req.params.id } })) {
      return res.status(409).json({ msg: 'Telefone já cadastrado' });
    }

    const updateFields = {};
    if (nome) updateFields.nome = nome.trim();
    if (telefone !== undefined) updateFields.telefone = telefoneNormalizado;
    if (endereco !== undefined) updateFields.endereco = endereco.trim();
    if (aniversario !== undefined) updateFields.aniversario = aniversario.trim();
    if (cpf !== undefined) updateFields.cpf = cpf.trim();

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
router.delete('/:id', auth, auth.allowRoles('admin'), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ msg: 'Cliente não encontrado' });
    }

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
