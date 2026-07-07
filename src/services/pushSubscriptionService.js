const { getPool } = require('../db/pool');

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

const DEFAULT_PREFERENCES = {
  enabled: true,
  vencimentos: true,
  atrasados: true,
  orcamento: true,
  assinatura: true,
  saudacoes: true,
  timezone: DEFAULT_TIMEZONE,
};

function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 64) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeTimezone(tz) {
  const value = String(tz || DEFAULT_TIMEZONE).trim();
  if (!isValidTimezone(value)) {
    const err = new Error('Fuso horário inválido');
    err.status = 400;
    throw err;
  }
  return value;
}

function mapPreferences(row) {
  if (!row) return { ...DEFAULT_PREFERENCES };
  return {
    enabled: row.enabled,
    vencimentos: row.vencimentos,
    atrasados: row.atrasados,
    orcamento: row.orcamento,
    assinatura: row.assinatura,
    saudacoes: row.saudacoes !== false,
    timezone: row.timezone || DEFAULT_TIMEZONE,
  };
}

async function ensurePreferences(userId) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO notification_preferences (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

async function upsertSubscription(userId, subscription, userAgent, timezone) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    const err = new Error('Subscription inválida');
    err.status = 400;
    throw err;
  }

  const pool = getPool();
  await ensurePreferences(userId);

  if (timezone) {
    const tz = normalizeTimezone(timezone);
    await pool.query(
      'UPDATE notification_preferences SET timezone = $2 WHERE user_id = $1',
      [userId, tz],
    );
  }

  const { rows } = await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent
     RETURNING id, endpoint, created_at`,
    [
      userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      userAgent || null,
    ],
  );

  return rows[0];
}

async function removeSubscription(userId, endpoint) {
  if (!endpoint) {
    const err = new Error('Endpoint obrigatório');
    err.status = 400;
    throw err;
  }

  const pool = getPool();
  await pool.query(
    'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
    [userId, endpoint],
  );
}

async function removeSubscriptionByEndpoint(endpoint) {
  const pool = getPool();
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

async function getSubscriptionsForUser(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, endpoint, p256dh, auth, user_agent, created_at
     FROM push_subscriptions WHERE user_id = $1`,
    [userId],
  );
  return rows;
}

async function getPreferences(userId) {
  await ensurePreferences(userId);
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT enabled, vencimentos, atrasados, orcamento, assinatura, saudacoes, timezone
     FROM notification_preferences WHERE user_id = $1`,
    [userId],
  );
  return mapPreferences(rows[0]);
}

async function updatePreferences(userId, prefs) {
  await ensurePreferences(userId);
  const pool = getPool();

  const current = await getPreferences(userId);
  const next = {
    enabled: prefs.enabled !== undefined ? Boolean(prefs.enabled) : current.enabled,
    vencimentos: prefs.vencimentos !== undefined ? Boolean(prefs.vencimentos) : current.vencimentos,
    atrasados: prefs.atrasados !== undefined ? Boolean(prefs.atrasados) : current.atrasados,
    orcamento: prefs.orcamento !== undefined ? Boolean(prefs.orcamento) : current.orcamento,
    assinatura: prefs.assinatura !== undefined ? Boolean(prefs.assinatura) : current.assinatura,
    saudacoes: prefs.saudacoes !== undefined ? Boolean(prefs.saudacoes) : current.saudacoes,
    timezone: prefs.timezone !== undefined
      ? normalizeTimezone(prefs.timezone)
      : current.timezone,
  };

  const { rows } = await pool.query(
    `UPDATE notification_preferences
     SET enabled = $2, vencimentos = $3, atrasados = $4, orcamento = $5,
         assinatura = $6, saudacoes = $7, timezone = $8
     WHERE user_id = $1
     RETURNING enabled, vencimentos, atrasados, orcamento, assinatura, saudacoes, timezone`,
    [
      userId,
      next.enabled,
      next.vencimentos,
      next.atrasados,
      next.orcamento,
      next.assinatura,
      next.saudacoes,
      next.timezone,
    ],
  );

  return mapPreferences(rows[0]);
}

async function listUsersForDispatch() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT ps.user_id
     FROM push_subscriptions ps
     LEFT JOIN notification_preferences np ON np.user_id = ps.user_id
     WHERE COALESCE(np.enabled, TRUE) = TRUE`,
  );
  return rows.map((r) => r.user_id);
}

async function wasAlreadySent(userId, dedupKey) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT 1 FROM notification_log WHERE user_id = $1 AND dedup_key = $2 LIMIT 1',
    [userId, dedupKey],
  );
  return rows.length > 0;
}

async function logSent(userId, { dedupKey, type, title, body }) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO notification_log (user_id, dedup_key, type, title, body)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, dedup_key) DO NOTHING`,
    [userId, dedupKey, type, title, body],
  );
}

module.exports = {
  DEFAULT_PREFERENCES,
  DEFAULT_TIMEZONE,
  isValidTimezone,
  normalizeTimezone,
  upsertSubscription,
  removeSubscription,
  removeSubscriptionByEndpoint,
  getSubscriptionsForUser,
  getPreferences,
  updatePreferences,
  listUsersForDispatch,
  wasAlreadySent,
  logSent,
};
