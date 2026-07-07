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

  const appUrl = (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, '');

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
    infinitePay: {
      enabled: Boolean(process.env.INFINITEPAY_HANDLE && String(process.env.INFINITEPAY_HANDLE).trim()),
      handle: (process.env.INFINITEPAY_HANDLE || '').trim().replace(/^\$/, ''),
      appUrl,
    },
    appUrl,
    port,
    nodeEnv: process.env.NODE_ENV || 'development',
    gemini: {
      apiKey: (process.env.GEMINI_API_KEY || '').trim(),
      model: (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim(),
      enabled: Boolean((process.env.GEMINI_API_KEY || '').trim()),
    },
    vapid: {
      publicKey: (process.env.VAPID_PUBLIC_KEY || '').trim(),
      privateKey: (process.env.VAPID_PRIVATE_KEY || '').trim(),
      subject: (process.env.VAPID_SUBJECT || 'mailto:suporte@homefinancas.com').trim(),
      enabled: Boolean(
        (process.env.VAPID_PUBLIC_KEY || '').trim()
        && (process.env.VAPID_PRIVATE_KEY || '').trim(),
      ),
    },
  };
}

module.exports = { loadEnv };
