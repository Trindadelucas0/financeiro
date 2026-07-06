const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const { loadEnv } = require('../config/env');
const { usernameFromEmail, ensureUniqueUsername } = require('../utils/username');

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(255) NOT NULL,
  username VARCHAR(30) NOT NULL UNIQUE,
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
  dia_vencimento INTEGER,
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

CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('sugestao', 'bug', 'outro')),
  mensagem TEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'lido')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(status);

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(10) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  order_nsu VARCHAR(64) NOT NULL UNIQUE,
  invoice_slug VARCHAR(64),
  transaction_nsu VARCHAR(64),
  amount_cents INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  customer_nome VARCHAR(255),
  customer_email VARCHAR(255),
  checkout_source VARCHAR(20) NOT NULL DEFAULT 'profile' CHECK (checkout_source IN ('guest', 'profile')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
`;

const MIGRATION_SQL = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(30);

CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('sugestao', 'bug', 'outro')),
  mensagem TEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'lido')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(status);

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(10) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  order_nsu VARCHAR(64) NOT NULL UNIQUE,
  invoice_slug VARCHAR(64),
  transaction_nsu VARCHAR(64),
  amount_cents INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  customer_nome VARCHAR(255),
  customer_email VARCHAR(255),
  checkout_source VARCHAR(20) NOT NULL DEFAULT 'profile' CHECK (checkout_source IN ('guest', 'profile')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS customer_nome VARCHAR(255);
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS checkout_source VARCHAR(20) NOT NULL DEFAULT 'profile';
ALTER TABLE payment_orders ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE emprestimos ADD COLUMN IF NOT EXISTS dia_vencimento INTEGER;

ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_source VARCHAR(20) NOT NULL DEFAULT 'site';

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'payment_orders'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%checkout_source%'
  LOOP
    EXECUTE format('ALTER TABLE payment_orders DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$ BEGIN
  ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_checkout_source_check
    CHECK (checkout_source IN ('guest', 'profile', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_billing_source ON users(billing_source);

ALTER TABLE users ADD COLUMN IF NOT EXISTS access_grant_type VARCHAR(20);
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_access_grant_type_check
    CHECK (access_grant_type IS NULL OR access_grant_type IN ('trial', 'lifetime', 'paid'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

async function backfillUsernames(client) {
  const { rows } = await client.query(
    'SELECT id, email FROM users WHERE username IS NULL OR username = \'\'',
  );

  for (const row of rows) {
    const base = usernameFromEmail(row.email);
    const username = await ensureUniqueUsername(client, base, row.id);
    await client.query('UPDATE users SET username = $1 WHERE id = $2', [username, row.id]);
  }

  if (rows.length > 0) {
    console.log(`[migrate] Usernames gerados para ${rows.length} usuário(s).`);
  }
}

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
    await client.query(MIGRATION_SQL);
    await backfillUsernames(client);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE users ALTER COLUMN username SET NOT NULL;
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);

    const { rows } = await client.query('SELECT COUNT(*)::int AS total FROM users');
    if (rows[0].total === 0) {
      const passwordHash = await bcrypt.hash(admin.password, 10);
      const adminUsername = await ensureUniqueUsername(client, usernameFromEmail(admin.email));
      const insert = await client.query(
        `INSERT INTO users (nome, username, email, password_hash, role, ativo)
         VALUES ($1, $2, $3, $4, 'admin', TRUE)
         RETURNING id`,
        ['Administrador', adminUsername, admin.email, passwordHash],
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

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] Falha:', err.message);
      process.exit(1);
    });
}
