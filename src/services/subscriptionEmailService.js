const { getPool } = require('../db/pool');
const { loadEnv } = require('../config/env');
const emailService = require('./emailService');

const TEMPLATE = 'subscriptionExpired';

function periodEndKey(periodEnd) {
  const date = periodEnd instanceof Date ? periodEnd : new Date(periodEnd);
  return `expired:${date.toISOString().slice(0, 10)}`;
}

async function expireAllDueSubscriptions() {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE users
     SET plan = 'free', subscription_status = 'expired'
     WHERE plan = 'pro'
       AND role != 'admin'
       AND COALESCE(access_grant_type, '') != 'lifetime'
       AND COALESCE(subscription_status, '') != 'lifetime'
       AND subscription_current_period_end IS NOT NULL
       AND subscription_current_period_end <= NOW()
     RETURNING id, email, nome, access_grant_type, subscription_current_period_end`,
  );

  return rows;
}

async function wasEmailAlreadySent(userId, dedupKey) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM email_log
     WHERE user_id = $1 AND dedup_key = $2
     LIMIT 1`,
    [userId, dedupKey],
  );
  return rows.length > 0;
}

async function logEmailSent(userId, dedupKey) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO email_log (user_id, template, dedup_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, dedup_key) DO NOTHING`,
    [userId, TEMPLATE, dedupKey],
  );
}

async function processExpiredSubscriptionEmails() {
  const config = loadEnv();
  if (!config.resend.enabled) {
    return {
      expired: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      disabled: true,
    };
  }

  const expiredUsers = await expireAllDueSubscriptions();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of expiredUsers) {
    const dedupKey = periodEndKey(user.subscription_current_period_end);

    if (await wasEmailAlreadySent(user.id, dedupKey)) {
      skipped += 1;
      continue;
    }

    const isTrial = user.access_grant_type === 'trial';

    try {
      await emailService.sendSubscriptionExpiredEmail({
        to: user.email,
        nome: user.nome,
        isTrial,
      });
      await logEmailSent(user.id, dedupKey);
      sent += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        `[subscription-email] falha user=${user.id} email=${user.email}: ${err.message}`,
      );
    }
  }

  return {
    expired: expiredUsers.length,
    sent,
    skipped,
    failed,
    disabled: false,
  };
}

module.exports = {
  periodEndKey,
  expireAllDueSubscriptions,
  processExpiredSubscriptionEmails,
};
