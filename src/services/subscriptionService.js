const { getPool } = require('../db/pool');
const { PRO_PLAN } = require('../config/plan');

const PRO_ACCESS_DAYS = PRO_PLAN.accessDays;

function isPeriodActive(periodEnd) {
  if (!periodEnd) return false;
  return new Date(periodEnd) > new Date();
}

function mapSubscription(row) {
  if (!row) {
    return { plan: 'free', status: null, isPro: false, currentPeriodEnd: null };
  }

  const active = isPeriodActive(row.subscription_current_period_end);
  const isPro = row.role === 'admin' || (row.plan === 'pro' && active);

  return {
    plan: isPro ? 'pro' : (row.plan || 'free'),
    status: active ? 'active' : (row.subscription_status || null),
    isPro,
    currentPeriodEnd: row.subscription_current_period_end || null,
  };
}

async function expireIfNeeded(userId) {
  const pool = getPool();
  await pool.query(
    `UPDATE users
     SET plan = 'free', subscription_status = 'expired'
     WHERE id = $1
       AND plan = 'pro'
       AND role != 'admin'
       AND subscription_current_period_end IS NOT NULL
       AND subscription_current_period_end <= NOW()`,
    [userId],
  );
}

async function getSubscription(userId) {
  await expireIfNeeded(userId);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, role, plan, subscription_status, subscription_current_period_end
     FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );

  if (rows.length === 0) {
    const err = new Error('Usuário não encontrado');
    err.status = 404;
    throw err;
  }

  return mapSubscription(rows[0]);
}

async function isProUser(userId) {
  const sub = await getSubscription(userId);
  return sub.isPro;
}

async function getUserPaymentContext(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, email, nome, plan, subscription_status, subscription_current_period_end
     FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );

  if (rows.length === 0) {
    const err = new Error('Usuário não encontrado');
    err.status = 404;
    throw err;
  }

  return rows[0];
}

async function grantProAccess(userId, days = PRO_ACCESS_DAYS) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE users
     SET plan = 'pro',
         subscription_status = 'active',
         subscription_current_period_end = GREATEST(
           COALESCE(subscription_current_period_end, NOW()),
           NOW()
         ) + ($2 || ' days')::interval
     WHERE id = $1
     RETURNING subscription_current_period_end`,
    [userId, String(days)],
  );

  if (rows.length === 0) {
    const err = new Error('Usuário não encontrado');
    err.status = 404;
    throw err;
  }

  return rows[0].subscription_current_period_end;
}

module.exports = {
  mapSubscription,
  getSubscription,
  isProUser,
  getUserPaymentContext,
  grantProAccess,
  PRO_ACCESS_DAYS,
};
