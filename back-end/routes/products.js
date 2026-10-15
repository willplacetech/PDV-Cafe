const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const auth = require('../middleware/auth');

// GET /api/products
// Query parameters:
//   pagina: number (default 1)
//   limite: number (default 25, max 100)
//   busca: string (for searching in nome, codigo, categoria)
//   sort: string (field to sort by, default: '-createdAt' for descending date)
//   categoria: string (filter by category)
//   tipo: string (filter by tipo: "venda" or "insumo")
//   estoqueBaixo: boolean (if true, only products with low stock)
//   disponivel: boolean (if true, only products with stock > 0)
router.get('/', auth, async (req, res) => {
  try {
    const pagina = parseInt(req.query.pagina) || 1;
    const limite = Math.min(parseInt(req.query.limite) || 25, 100); // max 100
    const busca = req.query.busca || '';
    const sortParam = req.query.sort || '-createdAt'; // default sort by createdAt descending
    const categoria = req.query.categoria || '';
    const tipo = req.query.tipo || '';
    const estoqueBaixo = req.query.estoqueBaixo === 'true';
    const disponivel = req.query.disponivel === 'true';

    // Build filter object
    const filtro = {};
    if (busca) {
      filtro.$or = [
        { nome: { $regex: busca, $options: 'i' } },
        { codigo: { $regex: busca, $options: 'i' } },
        { categoria: { $regex: busca, $options: 'i' } }
      ];
    }
    if (categoria) filtro.categoria = categoria;
    if (tipo) filtro.tipo = tipo;
    if (estoqueBaixo) filtro.$expr = { $lte: ['$estoque', 5] }; // assuming low stock threshold is 5
    if (disponivel) filtro.estoque = { $gt: 0 };

    // Execute query with pagination
    const [docs, total] = await Promise.all([
      Product.find(filtro)
        .sort(sortParam)
        .skip((pagina - 1) * limite)
        .limit(limite)
        .lean(),
      Product.countDocuments(filtro)
    ]);

    const totalPaginas = Math.ceil(total / limite);

    res.json({
      dados: docs,
      total,
      pagina,
      limite,
      totalPaginas
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ msg: 'Erro ao buscar produtos' });
  }
});

module.exports = router;
