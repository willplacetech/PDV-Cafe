const mongoose = require('mongoose');
const { currentTenantId } = require('./tenantContext');

const OPERACOES_CONSULTA = [
  'count',
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'update',
  'updateMany',
  'updateOne',
];

function filtrarAtualizacao(query, tenantId) {
  const update = query.getUpdate();
  if (!update) return;

  if (Array.isArray(update)) {
    query.setUpdate([...update, { $set: { tenantId: new mongoose.Types.ObjectId(tenantId) } }]);
    return;
  }

  const replacement = Object.keys(update).every(key => !key.startsWith('$'));
  if (replacement) {
    query.setUpdate({ ...update, tenantId: new mongoose.Types.ObjectId(tenantId) });
    return;
  }

  const set = { ...(update.$set || {}), tenantId: new mongoose.Types.ObjectId(tenantId) };
  const unset = { ...(update.$unset || {}) };
  delete unset.tenantId;
  query.setUpdate({
    ...update,
    $set: set,
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  });
}

function adicionarEscopoTenant(schema) {
  if (!schema.path('tenantId')) {
    schema.add({
      tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
    });
  }

  if (!schema.indexes().some(([keys]) => keys.tenantId === 1)) {
    schema.index({ tenantId: 1 });
  }

  schema.$tenantScoped = true;
  schema.pre(OPERACOES_CONSULTA, function (next) {
    const tenantId = currentTenantId();
    if (!tenantId) return next();

    this.setQuery({
      $and: [
        this.getFilter(),
        { tenantId: new mongoose.Types.ObjectId(tenantId) },
      ],
    });
    if (['findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'update', 'updateMany', 'updateOne'].includes(this.op)) {
      try {
        filtrarAtualizacao(this, tenantId);
      } catch (error) {
        return next(error);
      }
    }
    return next();
  });

  schema.pre('validate', function () {
    const tenantId = currentTenantId();
    if (!tenantId) return;
    if (!this.isNew && !this.tenantId) {
      throw new Error('Documento sem tenant não pode ser alterado em contexto tenant-scoped');
    }
    if (this.tenantId && String(this.tenantId) !== tenantId) {
      throw new Error('Documento não pertence ao tenant autenticado');
    }
    if (this.isNew) this.tenantId = new mongoose.Types.ObjectId(tenantId);
  });

  schema.pre('insertMany', function (next, documents) {
    const tenantId = currentTenantId();
    if (!tenantId) return next();
    for (const document of documents) {
      if (document.tenantId && String(document.tenantId) !== tenantId) {
        return next(new Error('Documento não pertence ao tenant autenticado'));
      }
      document.tenantId = new mongoose.Types.ObjectId(tenantId);
    }
    return next();
  });

  schema.pre('aggregate', function () {
    const tenantId = currentTenantId();
    if (!tenantId) return;
    const pipeline = this.pipeline();
    const match = { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } };
    const firstStageMustRemainFirst = ['$geoNear', '$search', '$vectorSearch', '$documents'];
    const firstStage = pipeline[0] && Object.keys(pipeline[0])[0];
    pipeline.splice(firstStageMustRemainFirst.includes(firstStage) ? 1 : 0, 0, match);
  });

  return schema;
}

module.exports = adicionarEscopoTenant;
