const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const { loadEnv } = require('../config/env');

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_month VARCHAR(7) NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM'),
  saldo_conta NUMERIC(14, 2) NOT NULL DEFAULT 0,
  saldo_atualizado_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('fixa', 'variavel')),
  valor NUMERIC(14, 2) NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  mes_inicio VARCHAR(7) NOT NULL,
  duracao_meses INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS despesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('fixa', 'variavel')),
  forma_pagamento VARCHAR(20) NOT NULL CHECK (forma_pagamento IN ('avista', 'parcelado')),
  valor NUMERIC(14, 2),
  valor_total NUMERIC(14, 2),
  num_parcelas INTEGER,
  categoria VARCHAR(100) NOT NULL,
  mes_inicio VARCHAR(7) NOT NULL,
  duracao_meses INTEGER,
  dia_vencimento INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emprestimos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  valor_total NUMERIC(14, 2) NOT NULL,
  juros NUMERIC(8, 2) NOT NULL DEFAULT 0,
  num_parcelas INTEGER NOT NULL,
  mes_inicio VARCHAR(7) NOT NULL,
  categoria VARCHAR(100) NOT NULL DEFAULT 'Empréstimo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entidade VARCHAR(20) NOT NULL CHECK (entidade IN ('receita', 'despesa', 'emprestimo')),
  item_id UUID NOT NULL,
  mes VARCHAR(7) NOT NULL,
  pago BOOLEAN NOT NULL DEFAULT FALSE,
  data_hora TIMESTAMPTZ,
  comprovante_nome VARCHAR(255),
  comprovante_data TEXT,
  UNIQUE (user_id, entidade, item_id, mes)
);

CREATE TABLE IF NOT EXISTS orcamentos (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  categoria VARCHAR(100) NOT NULL,
  limite_mensal NUMERIC(14, 2) NOT NULL,
  PRIMARY KEY (user_id, categoria)
);

CREATE INDEX IF NOT EXISTS idx_receitas_user ON receitas(user_id);
CREATE INDEX IF NOT EXISTS idx_receitas_user_mes ON receitas(user_id, mes_inicio);
CREATE INDEX IF NOT EXISTS idx_despesas_user ON despesas(user_id);
CREATE INDEX IF NOT EXISTS idx_despesas_user_mes ON despesas(user_id, mes_inicio);
CREATE INDEX IF NOT EXISTS idx_emprestimos_user ON emprestimos(user_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_user_mes ON emprestimos(user_id, mes_inicio);
CREATE INDEX IF NOT EXISTS idx_pagamentos_user ON pagamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_user_mes ON pagamentos(user_id, mes);
`;

async function ensureDatabase() {
  const { pg } = loadEnv();

  const adminClient = new Client({
    host: pg.host,
    port: pg.port,
    user: pg.user,
    password: pg.password,
    database: 'postgres',
  });

  await adminClient.connect();

  const exists = await adminClient.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [pg.database],
  );

  if (exists.rowCount === 0) {
    await adminClient.query(`CREATE DATABASE "${pg.database}"`);
    console.log(`[migrate] Banco "${pg.database}" criado.`);
  }

  await adminClient.end();
}

async function runMigrations() {
  const { pg, admin } = loadEnv();

  await ensureDatabase();

  const client = new Client({
    host: pg.host,
    port: pg.port,
    user: pg.user,
    password: pg.password,
    database: pg.database,
  });

  await client.connect();
  await client.query('BEGIN');

  try {
    await client.query(SCHEMA_SQL);

    const { rows } = await client.query('SELECT COUNT(*)::int AS total FROM users');
    if (rows[0].total === 0) {
      const passwordHash = await bcrypt.hash(admin.password, 10);
      const insert = await client.query(
        `INSERT INTO users (nome, email, password_hash, role, ativo)
         VALUES ($1, $2, $3, 'admin', TRUE)
         RETURNING id`,
        ['Administrador', admin.email, passwordHash],
      );
      await client.query(
        `INSERT INTO user_settings (user_id, current_month, saldo_conta)
         VALUES ($1, to_char(NOW(), 'YYYY-MM'), 0)`,
        [insert.rows[0].id],
      );
      console.log(`[migrate] Admin seed criado: ${admin.email}`);
    }

    await client.query('COMMIT');
    console.log('[migrate] Schema OK.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

module.exports = { runMigrations };
