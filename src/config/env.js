require('dotenv').config();

const REQUIRED = [
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'PORT',
];

function loadEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key] || String(process.env[key]).trim() === '');
  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}`);
  }

  const port = Number(process.env.PORT);
  const pgPort = Number(process.env.PGPORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve ser um número de porta válido');
  }

  if (!Number.isInteger(pgPort) || pgPort < 1 || pgPort > 65535) {
    throw new Error('PGPORT deve ser um número de porta válido');
  }

  if (process.env.JWT_SECRET.length < 8) {
    throw new Error('JWT_SECRET deve ter pelo menos 8 caracteres');
  }

  return {
    pg: {
      host: process.env.PGHOST,
      port: pgPort,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN,
    },
    admin: {
      email: process.env.ADMIN_EMAIL.trim().toLowerCase(),
      password: process.env.ADMIN_PASSWORD,
    },
    port,
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

module.exports = { loadEnv };
