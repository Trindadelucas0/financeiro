const { Pool } = require('pg');
const { loadEnv } = require('../config/env');

let pool;

function getPool() {
  if (!pool) {
    const { pg } = loadEnv();
    pool = new Pool({
      host: pg.host,
      port: pg.port,
      user: pg.user,
      password: pg.password,
      database: pg.database,
    });
  }
  return pool;
}

module.exports = { getPool };
