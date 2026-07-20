const bcrypt = require('bcryptjs');
const { getPool } = require('../db/pool');
const { usernameFromEmail, ensureUniqueUsername } = require('../utils/username');
const { isValidEmail, normalizeEmail } = require('../utils/email');
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

const CLIENT_SELECT = `
  id, nome, username, email, role, ativo, must_change_password, created_at,
  plan, subscription_status, subscription_current_period_end, billing_source,
  access_grant_type
`;

function mapBillableClient(row) {
  return {
    ...mapUser(row),
    billingSource: row.billing_source || 'site',
    accessGrantType: row.access_grant_type || null,
    subscription: subscriptionService.mapSubscription(row),
  };
}

async function expireClientsBySourceIfNeeded(billingSource) {
  const pool = getPool();
  await pool.query(
    `UPDATE users
     SET plan = 'free', subscription_status = 'expired'
     WHERE billing_source = $1
       AND plan = 'pro'
       AND role != 'admin'
       AND COALESCE(access_grant_type, '') != 'lifetime'
       AND COALESCE(subscription_status, '') != 'lifetime'
       AND subscription_current_period_end IS NOT NULL
       AND subscription_current_period_end <= NOW()`,
    [billingSource],
  );
}

async function getBillableClientById(userId, billingSource) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${CLIENT_SELECT}
     FROM users
     WHERE id = $1 AND billing_source = $2
     LIMIT 1`,
    [userId, billingSource],
  );
  return rows[0] || null;
}

async function getManualClientById(userId) {
  return getBillableClientById(userId, 'manual');
}

async function listClientsBySource(billingSource) {
  await expireClientsBySourceIfNeeded(billingSource);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${CLIENT_SELECT}
     FROM users
     WHERE billing_source = $1 AND role != 'admin'
     ORDER BY created_at DESC`,
    [billingSource],
  );

  return rows.map(mapBillableClient);
}

async function listManualClients() {
  return listClientsBySource('manual');
}

async function listSiteSignups() {
  return listClientsBySource('site');
}

async function createManualClient({ nome, email, password, accessGrant = 'trial' }) {
  const pool = getPool();
  const normalizedEmail = normalizeEmail(email);
  const trimmedNome = String(nome || '').trim();
  const grantType = accessGrant === 'lifetime' ? 'lifetime' : 'trial';

  if (!trimmedNome || !normalizedEmail) {
    const err = new Error('nome e email são obrigatórios');
    err.status = 400;
    throw err;
  }

  if (!isValidEmail(normalizedEmail)) {
    const err = new Error('Informe um e-mail válido');
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
                 plan, subscription_status, subscription_current_period_end, billing_source,
                 access_grant_type`,
      [trimmedNome, finalUsername, normalizedEmail, passwordHash, true],
    );

    const userRow = insert.rows[0];
    await ensureUserSettings(client, userRow.id);
    await client.query('COMMIT');

    const periodEnd = grantType === 'lifetime'
      ? await subscriptionService.grantLifetimeAccess(userRow.id)
      : await subscriptionService.grantProAccess(userRow.id, PRO_PLAN.accessDays);

    if (grantType === 'trial') {
      await pool.query(
        `UPDATE users SET access_grant_type = 'trial' WHERE id = $1`,
        [userRow.id],
      );
    }

    const refreshed = await getManualClientById(userRow.id);
    const clientData = mapBillableClient(refreshed || userRow);

    return {
      client: clientData,
      tempPassword: generatedPassword,
      periodEnd,
      accessGrant: grantType,
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

async function registerClientPayment(userId, { days, billingSource = 'manual' } = {}) {
  const source = billingSource === 'site' ? 'site' : 'manual';
  const accessDays = Number(days) > 0 ? Number(days) : PRO_PLAN.accessDays;
  const row = await getBillableClientById(userId, source);

  if (!row) {
    const err = new Error(source === 'site' ? 'Cadastro do site não encontrado' : 'Cliente manual não encontrado');
    err.status = 404;
    throw err;
  }

  if (!row.ativo) {
    const err = new Error('Cliente inativo — reative a conta antes de registrar pagamento');
    err.status = 400;
    throw err;
  }

  if (row.access_grant_type === 'lifetime' || row.subscription_status === 'lifetime') {
    const err = new Error('Cliente com acesso vitalício — pagamento não se aplica');
    err.status = 400;
    throw err;
  }

  const periodEnd = await subscriptionService.grantProAccess(userId, accessDays, {
    accessGrantType: 'paid',
  });

  await paymentOrderService.createManualPaidOrder({
    userId,
    customerNome: row.nome,
    customerEmail: row.email,
    amountCents: MANUAL_AMOUNT_CENTS,
  });

  const refreshed = await getBillableClientById(userId, source);

  return {
    client: mapBillableClient(refreshed || row),
    periodEnd,
  };
}

async function registerManualPayment(userId, opts = {}) {
  return registerClientPayment(userId, { ...opts, billingSource: 'manual' });
}

module.exports = {
  listManualClients,
  listSiteSignups,
  createManualClient,
  registerManualPayment,
  registerClientPayment,
};
