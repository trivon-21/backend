const mongoose = require('mongoose');

/**
 * Runs `work` inside a Mongo session/transaction when the connection supports
 * one, and falls back to running it without a session on a standalone mongod
 * (transactions require a replica set). `externalSession`, when provided,
 * means the caller already owns a transaction — reuse it instead of nesting.
 */
async function runInTransaction(work, externalSession) {
  if (externalSession !== undefined) {
    return await work(externalSession);
  }
  if (typeof mongoose.connection?.transaction === 'function' && mongoose.connection.readyState === 1) {
    try {
      return await mongoose.connection.transaction(work);
    } catch (err) {
      if (
        err.message?.includes('Transaction numbers are only allowed on a replica set') ||
        err.message?.includes('replica set') ||
        err.codeName === 'IllegalOperation' ||
        err.code === 20
      ) {
        return await work(null);
      }
      throw err;
    }
  }
  return await work(null);
}

module.exports = { runInTransaction };
