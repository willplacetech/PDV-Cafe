const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Despesa = require('../models/Despesa');

const router = express.Router();
const TIME_ZONE = 'America/Sao_Paulo';
const dataHojeSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
};

const idValido = (id, res) => {
  if (mongoose.isValidObjectId(id)) return true;
  res.status(400).json({ msg: 'ID inválido' });
  return false;
};

const gerarParcelasRecorrentes = async (despesaBase) => {
  const parcelas = [];
  const baseDate = new Date(despesaBase.dataVencimento);
  for (let index = 1; index <= 12; index += 1) {
    const proximo = new Date(baseDate);
    const frequencia = despesaBase.frequenciaRecorrencia || 'mensal';
    if (frequencia === 'semanal') {
      proximo.setUTCDate(proximo.getUTCDate() + index * 7);
    } else {
      // Parte sempre da data original, mantendo o dia 31 apos meses curtos.
      const mesDestino = baseDate.getUTCMonth() + index * (frequencia === 'anual' ? 12 : 1);
      proximo.setUTCDate(1);
      proximo.setUTCMonth(mesDestino);
      const ultimoDia = new Date(Date.UTC(proximo.getUTCFullYear(), proximo.getUTCMonth() + 1, 0)).getUTCDate();
      proximo.setUTCDate(Math.min(baseDate.getUTCDate(), ultimoDia));
    }
    parcelas.push({
      descricao: despesaBase.descricao,
      categoria: despesaBase.categoria,
      fornecedor: despesaBase.fornecedor,
      valor: despesaBase.valor,
      dataVencimento: proximo,
      status: 'pendente',
      recorrente: true,
      frequenciaRecorrencia: despesaBase.frequenciaRecorrencia || 'mensal',
      usuarioCadastro: despesaBase.usuarioCadastro,
      origemRecorrencia: despesaBase._id,
    });
  }
  return parcelas;
};

router.use(auth);
router.use(auth.allowRoles('admin'));

router.get('/', async (req, res) => {
  try {
    const filtro = {};
    if (req.query.status) filtro.status = req.query.status;
    if (req.query.categoria) filtro.categoria = req.query.categoria;
    if (req.query.dataInicio || req.query.dataFim) {
      filtro.dataVencimento = {};
      if (req.query.dataInicio) filtro.dataVencimento.$gte = new Date(`${req.query.dataInicio}T00:00:00`);
      if (req.query.dataFim) filtro.dataVencimento.$lte = new Date(`${req.query.dataFim}T23:59:59`);
    }
    const despesas = await Despesa.find(filtro).sort({ dataVencimento: 1 });
    res.json(despesas);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

router.get('/resumo', async (req, res) => {
  try {
    const mes = req.query.mes || new Date().toISOString().slice(0, 7);
    const [ano, mesNumero] = mes.split('-').map(Number);
    const inicio = new Date(`${mes}-01T00:00:00-03:00`);
    const fimMes = new Date(Date.UTC(ano, mesNumero, 1, 3));
    const fimHoje = new Date(`${dataHojeSaoPaulo()}T00:00:00-03:00`);
    fimHoje.setUTCDate(fimHoje.getUTCDate() + 1);
    const fim = inicio.getTime() <= fimHoje.getTime() && fimHoje.getTime() < fimMes.getTime() ? fimHoje : fimMes;
    const [pendente, pago, atrasado, categoriaResumo] = await Promise.all([
      Despesa.aggregate([{ $match: { dataVencimento: { $gte: inicio, $lt: fim }, status: 'pendente' } }, { $group: { _id: null, total: { $sum: '$valor' } } }]),
      Despesa.aggregate([{ $match: { dataPagamento: { $gte: inicio, $lt: fim }, status: 'pago' } }, { $group: { _id: null, total: { $sum: '$valor' } } }]),
      Despesa.aggregate([{ $match: { dataVencimento: { $gte: inicio, $lt: fim }, status: 'atrasado' } }, { $group: { _id: null, total: { $sum: '$valor' } } }]),
      Despesa.aggregate([
        { $match: { dataPagamento: { $gte: inicio, $lt: fim }, status: 'pago' } },
        { $group: { _id: '$categoria', total: { $sum: '$valor' } } },
      ])
    ]);

    res.json({
      totalPendente: pendente[0]?.total || 0,
      totalPago: pago[0]?.total || 0,
      totalAtrasado: atrasado[0]?.total || 0,
      porCategoria: categoriaResumo.map((item) => ({ categoria: item._id, total: item.total })),
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

router.get('/:id', async (req, res) => {
  if (!idValido(req.params.id, res)) return;
  try {
    const despesa = await Despesa.findById(req.params.id);
    if (!despesa) return res.status(404).json({ msg: 'Despesa não encontrada' });
    res.json(despesa);
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ msg: 'ID inválido' });
    res.status(500).json({ msg: error.message });
  }
});

router.post('/', [
  body('descricao').trim().notEmpty(),
  body('categoria').isIn(['Aluguel', 'Energia', 'Água', 'Internet', 'Fornecedores/Insumos', 'Salários/Pró-labore', 'Impostos', 'Marketing', 'Manutenção', 'Transporte', 'Outros']),
  body('valor').isFloat({ min: 0.01 }),
  body('dataVencimento').optional().isISO8601(),
], async (req, res) => {
  if (!validate(req, res)) return;

  try {
    const payload = {
      ...req.body,
      valor: Number(req.body.valor),
      dataVencimento: req.body.dataVencimento ? new Date(req.body.dataVencimento) : new Date(),
      usuarioCadastro: req.user.id,
    };
    const despesa = await Despesa.create(payload);

    if (payload.recorrente) {
      const parcelas = await gerarParcelasRecorrentes(despesa);
      await Despesa.insertMany(parcelas);
    }

    res.status(201).json(despesa);
  } catch (error) {
    res.status(400).json({ msg: error.message });
  }
});

router.put('/:id', [
  body('descricao').optional().trim().notEmpty(),
  body('categoria').optional().isIn(['Aluguel', 'Energia', 'Água', 'Internet', 'Fornecedores/Insumos', 'Salários/Pró-labore', 'Impostos', 'Marketing', 'Manutenção', 'Transporte', 'Outros']),
  body('valor').optional().isFloat({ min: 0.01 }),
  body('dataVencimento').optional().isISO8601(),
  body('diaVencimento').optional().isInt({ min: 1, max: 31 }),
  body('alterarTodas').optional().isBoolean(),
], async (req, res) => {
  if (!validate(req, res)) return;
  if (!idValido(req.params.id, res)) return;
  try {
    const despesa = await Despesa.findById(req.params.id);
    if (!despesa) return res.status(404).json({ msg: 'Despesa não encontrada' });

    const camposEditaveis = ['descricao', 'categoria', 'fornecedor', 'valor'];
    const atualizacoes = {};
    camposEditaveis.forEach((campo) => {
      if (req.body[campo] !== undefined) {
        atualizacoes[campo] = campo === 'valor' ? Number(req.body[campo]) : req.body[campo];
      }
    });

    if (req.body.dataVencimento !== undefined) {
      atualizacoes.dataVencimento = new Date(req.body.dataVencimento);
    }

    if (req.body.diaVencimento !== undefined && req.body.alterarTodas !== true) {
      return res.status(400).json({ msg: 'O dia de vencimento só pode ser aplicado a toda a recorrência' });
    }

    if (req.body.alterarTodas === true) {
      if (!despesa.recorrente) {
        return res.status(400).json({ msg: 'Esta despesa não faz parte de uma recorrência' });
      }

      if (req.body.dataVencimento !== undefined && req.body.diaVencimento !== undefined) {
        return res.status(400).json({ msg: 'Informe a data completa ou o dia do vencimento, não ambos' });
      }

      const origemId = despesa.origemRecorrencia || despesa._id;
      const despesasDaSerie = await Despesa.find({
        $or: [
          { _id: origemId, status: { $ne: 'pago' } },
          { origemRecorrencia: origemId, status: { $ne: 'pago' } },
          { _id: req.params.id, status: { $ne: 'pago' } },
        ],
      });
      if (!despesasDaSerie.length) {
        return res.status(400).json({ msg: 'Não há parcelas pendentes ou atrasadas para atualizar; despesas pagas são preservadas' });
      }
      const deslocamentoVencimento = atualizacoes.dataVencimento
        ? atualizacoes.dataVencimento.getTime() - despesa.dataVencimento.getTime()
        : 0;
      const diaVencimento = req.body.diaVencimento === undefined ? null : Number(req.body.diaVencimento);

      await Promise.all(despesasDaSerie.map(async (parcela) => {
        camposEditaveis.forEach((campo) => {
          if (atualizacoes[campo] !== undefined) parcela[campo] = atualizacoes[campo];
        });
        if (atualizacoes.dataVencimento) {
          parcela.dataVencimento = new Date(parcela.dataVencimento.getTime() + deslocamentoVencimento);
        }
        if (diaVencimento !== null) {
          const ano = parcela.dataVencimento.getUTCFullYear();
          const mes = parcela.dataVencimento.getUTCMonth();
          const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
          parcela.dataVencimento = new Date(Date.UTC(ano, mes, Math.min(diaVencimento, ultimoDiaDoMes)));
        }
        await parcela.save();
      }));

      const despesaAtualizada = await Despesa.findById(req.params.id);
      return res.json({
        ...despesaAtualizada.toObject(),
        parcelasAtualizadas: despesasDaSerie.length,
      });
    }

    Object.assign(despesa, atualizacoes);
    await despesa.save();
    res.json(despesa);
  } catch (error) {
    res.status(400).json({ msg: error.message });
  }
});

router.put('/:id/pagar', async (req, res) => {
  if (!idValido(req.params.id, res)) return;
  try {
    const despesa = await Despesa.findById(req.params.id);
    if (!despesa) return res.status(404).json({ msg: 'Despesa não encontrada' });
    despesa.dataPagamento = req.body.dataPagamento ? new Date(req.body.dataPagamento) : new Date();
    despesa.status = 'pago';
    await despesa.save();
    res.json(despesa);
  } catch (error) {
    res.status(400).json({ msg: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  if (!idValido(req.params.id, res)) return;
  try {
    const despesa = await Despesa.findByIdAndDelete(req.params.id);
    if (!despesa) return res.status(404).json({ msg: 'Despesa não encontrada' });
    res.json({ msg: 'Despesa removida com sucesso' });
  } catch (error) {
    res.status(400).json({ msg: error.message });
  }
});

module.exports = router;
