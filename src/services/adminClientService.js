const bcrypt = require('bcryptjs');
const { getPool } = require('../db/pool');
const { usernameFromEmail, ensureUniqueUsername } = require('../utils/username');
const { generateTempPassword } = require('../utils/tempPassword');
const { mapUser } = require('./profileService');
const subscriptionService = require('./subscriptionService');
const paymentOrderService = require('./paymentOrderService');
const { PRO_PLAN } = require('../config/plan');

const MANUAL_AMOUNT_CENTS = Math.round(PRO_PLAN.monthlyPriceBrl * 100);

async function ensureUserSettings(client, userId) {
  await client.query(
    `INSERT INTO user_settings (user_id, current_month, saldo_conta)
     VALUES ($1, to_char(NOW(), 'YYYY-MM'), 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

function mapManualClient(row) {
  return {
    ...mapUser(row),
    billingSource: row.billing_source || 'manual',
    subscription: subscriptionService.mapSubscription(row),
  };
}

async function expireManualClientsIfNeeded() {
  const pool = getPool();
  await pool.query(
    `UPDATE users
     SET plan = 'free', subscription_status = 'expired'
     WHERE billing_source = 'manual'
       AND plan = 'pro'
       AND role != 'admin'
       AND subscription_current_period_end IS NOT NULL
       AND subscription_current_period_end <= NOW()`,
  );
}

async function getManualClientById(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, nome, username, email, role, ativo, must_change_password, created_at,
            plan, subscription_status, subscription_current_period_end, billing_source
     FROM users
     WHERE id = $1 AND billing_source = 'manual'
     LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

async function listManualClients() {
  await expireManualClientsIfNeeded();

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, nome, username, email, role, ativo, must_change_password, created_at,
            plan, subscription_status, subscription_current_period_end, billing_source
     FROM users
     WHERE billing_source = 'manual'
     ORDER BY created_at DESC`,
  );

  return rows.map(mapManualClient);
}

async function createManualClient({ nome, email, password }) {
  const pool = getPool();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const trimmedNome = String(nome || '').trim();

  if (!trimmedNome || !normalizedEmail) {
    const err = new Error('nome e email são obrigatórios');
    err.status = 400;
    throw err;
  }

  let finalPassword = String(password || '').trim();
  let generatedPassword = null;

  if (!finalPassword) {
    finalPassword = generateTempPassword(trimmedNome);
    generatedPassword = finalPassword;
  }

  if (finalPassword.length < 6) {
    const err = new Error('Senha deve ter pelo menos 6 caracteres');
    err.status = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(finalPassword, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const finalUsername = await ensureUniqueUsername(client, usernameFromEmail(normalizedEmail));

    const insert = await client.query(
      `INSERT INTO users (
         nome, username, email, password_hash, role, ativo,
         must_change_password, billing_source
       )
       VALUES ($1, $2, $3, $4, 'user', TRUE, $5, 'manual')
       RETURNING id, nome, username, email, role, ativo, must_change_password, created_at,
                 plan, subscription_status, subscription_current_period_end, billing_source`,
      [trimmedNome, finalUsername, normalizedEmail, passwordHash, Boolean(generatedPassword)],
    );

    const userRow = insert.rows[0];
    await ensureUserSettings(client, userRow.id);
    await client.query('COMMIT');

    const periodEnd = await subscriptionService.grantProAccess(
      userRow.id,
      PRO_PLAN.accessDays,
    );

    await paymentOrderService.createManualPaidOrder({
      userId: userRow.id,
      customerNome: trimmedNome,
      customerEmail: normalizedEmail,
      amountCents: MANUAL_AMOUNT_CENTS,
    });

    const refreshed = await getManualClientById(userRow.id);
    const clientData = mapManualClient(refreshed || userRow);

    return {
      client: clientData,
      tempPassword: generatedPassword,
      periodEnd,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const msg = err.constraint && String(err.constraint).includes('username')
        ? 'Username já cadastrado'
        : 'Email já cadastrado';
      const dup = new Error(msg);
      dup.status = 409;
      throw dup;
    }
    throw err;
  } finally {
    client.release();
  }
}

async function registerManualPayment(userId, { days } = {}) {
  const accessDays = Number(days) > 0 ? Number(days) : PRO_PLAN.accessDays;
  const row = await getManualClientById(userId);

  if (!row) {
    const err = new Error('Cliente manual não encontrado');
    err.status = 404;
    throw err;
  }

  if (!row.ativo) {
    const err = new Error('Cliente inativo — reative a conta antes de registrar pagamento');
    err.status = 400;
    throw err;
  }

  const periodEnd = await subscriptionService.grantProAccess(userId, accessDays);

  await paymentOrderService.createManualPaidOrder({
    userId,
    customerNome: row.nome,
    customerEmail: row.email,
    amountCents: MANUAL_AMOUNT_CENTS,
  });

  const refreshed = await getManualClientById(userId);

  return {
    client: mapManualClient(refreshed || row),
    periodEnd,
  };
}

module.exports = {
  listManualClients,
  createManualClient,
  registerManualPayment,
};
