// dbName explícito prevalece sobre o banco da URI; nunca registra credenciais.
module.exports = (env = process.env) => {
  const name = env.MONGO_DB_NAME;
  if (name === undefined || name === '') return {};
  if (typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,63}$/.test(name)) {
    throw new Error('MONGO_DB_NAME inválido: use de 1 a 63 letras ASCII, números, hífen ou sublinhado');
  }
  return { dbName: name };
};
