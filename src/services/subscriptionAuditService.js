const { getPool } = require('../db/pool');
const { TRIAL_PLAN } = require('../config/plan');

const AUDIT_SELECT = `
  SELECT
    id,
    email,
    nome,
    billing_source,
    access_grant_type,
    plan,
    subscription_status,
    created_at,
    subscription_current_period_end AS vence_em,
    CASE
      WHEN access_grant_type = 'lifetime' OR subscription_status = 'lifetime' THEN 'vitalicio'
      WHEN subscription_current_period_end > NOW() THEN 'ativo'
      ELSE 'vencido_cobrar'
    END AS situacao,
    CASE
      WHEN billing_source = 'site'
        AND role != 'admin'
        AND COALESCE(access_grant_type, '') != 'lifetime'
        AND COALESCE(subscription_status, '') != 'lifetime'
        AND (
          subscription_current_period_end IS NULL
          OR access_grant_type IS NULL
        )
      THEN TRUE
      ELSE FALSE
    END AS needs_backfill
  FROM users
  WHERE role != 'admin'
`;

function mapAuditRow(row) {
  return {
    id: row.id,
    email: row.email,
    nome: row.nome,
    billingSource: row.billing_source || 'site',
    accessGrantType: row.access_grant_type || null,
    plan: row.plan || 'free',
    subscriptionStatus: row.subscription_status || null,
    createdAt: row.created_at,
    venceEm: row.vence_em || null,
    situacao: row.situacao,
    needsBackfill: Boolean(row.needs_backfill),
  };
}

async function listSubscriptionAudit() {
  const pool = getPool();
  const { rows } = await pool.query(
    `${AUDIT_SELECT}
     ORDER BY created_at DESC`,
  );
  return rows.map(mapAuditRow);
}

/**
 * Preenche trial para cadastros do site sem period_end / access_grant_type.
 * period_end = created_at + TRIAL_PLAN.accessDays; se já passou, marca expirado.
 */
async function backfillMissingSiteTrials() {
  const pool = getPool();
  const trialDays = TRIAL_PLAN.accessDays;

  const { rows } = await pool.query(
    `UPDATE users
     SET
       access_grant_type = 'trial',
       subscription_current_period_end = created_at + ($1 || ' days')::interval,
       plan = CASE
         WHEN created_at + ($1 || ' days')::interval > NOW() THEN 'pro'
         ELSE 'free'
       END,
       subscription_status = CASE
         WHEN created_at + ($1 || ' days')::interval > NOW() THEN 'active'
         ELSE 'expired'
       END
     WHERE billing_source = 'site'
       AND role != 'admin'
       AND COALESCE(access_grant_type, '') != 'lifetime'
       AND COALESCE(subscription_status, '') != 'lifetime'
       AND (
         subscription_current_period_end IS NULL
         OR access_grant_type IS NULL
       )
     RETURNING id, email, nome, created_at, subscription_current_period_end, plan, subscription_status`,
    [String(trialDays)],
  );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    nome: row.nome,
    createdAt: row.created_at,
    venceEm: row.subscription_current_period_end,
    plan: row.plan,
    subscriptionStatus: row.subscription_status,
  }));
}

module.exports = {
  listSubscriptionAudit,
  backfillMissingSiteTrials,
  TRIAL_DAYS: TRIAL_PLAN.accessDays,
};
