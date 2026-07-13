const { getPool } = require('../db/pool');
const { loadEnv } = require('../config/env');
const emailService = require('./emailService');
const { buildMonthlyReport, monthLabelLong } = require('./reportService');
const financeService = require('./financeService');

const TEMPLATE = 'weeklySummary';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function weeklyDedupKey(dayKey) {
  return `weekly:${dayKey}`;
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

async function listProUsersForWeeklyReport() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, nome, email
     FROM users
     WHERE ativo = TRUE
       AND email IS NOT NULL
       AND email <> ''
       AND (
         role = 'admin'
         OR (
           plan = 'pro'
           AND (
             COALESCE(access_grant_type, '') = 'lifetime'
             OR COALESCE(subscription_status, '') = 'lifetime'
             OR subscription_current_period_end IS NULL
             OR subscription_current_period_end > NOW()
           )
         )
       )
     ORDER BY created_at ASC`,
  );
  return rows;
}

function buildSummaryFromReport(report) {
  const atrasados = report.atrasados || [];
  const atrasadosTotal = atrasados.reduce((s, a) => s + Number(a.valor || 0), 0);
  const k = report.kpis || {};
  return {
    mes: report.mes,
    receitas: k.receitas?.total || 0,
    despesas: k.despesas?.total || 0,
    saldo: k.saldo?.total || 0,
    carryOver: k.saldo?.carryOver || 0,
    pctPago: report.pagamentos?.pctPago || 0,
    pendenteVal: report.pagamentos?.pendenteVal || 0,
    atrasadosCount: atrasados.length,
    atrasadosTotal,
    saldoConta: report.saldoConta || 0,
    saldoContaConfigured: Number(report.saldoConta) > 0,
  };
}

async function processWeeklyReportEmails() {
  const config = loadEnv();
  if (!config.resend.enabled) {
    return {
      candidates: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      disabled: true,
    };
  }

  const users = await listProUsersForWeeklyReport();
  const dayKey = todayKey();
  const dedupKey = weeklyDedupKey(dayKey);
  const mes = financeService.monthKeyOf(new Date());
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  const { generateMonthlyReportPdf } = require('./reportPdfService');

  for (const user of users) {
    if (await wasEmailAlreadySent(user.id, dedupKey)) {
      skipped += 1;
      continue;
    }

    try {
      const report = await buildMonthlyReport(user.id, mes);
      // Cron semanal usa fallback local (sem Gemini) para não depender de chave de IA.
      report.aiEnabled = false;
      report.aiInsights = {
        resumoExecutivo: `Resumo automático de ${report.mesLabel}.`,
        pontosAtencao: (report.improvements || []).map((i) => i.text).slice(0, 5),
        planoAcao: (report.advice || []).slice(0, 5),
        source: 'weekly-fallback',
        generatedAt: new Date().toISOString(),
        fromCache: false,
      };
      const pdf = await generateMonthlyReportPdf(report);
      const summary = buildSummaryFromReport(report);

      await emailService.sendWeeklyReportEmail({
        to: user.email,
        nome: user.nome || report.userName,
        mesLabel: report.mesLabel || monthLabelLong(mes),
        summary,
        pdfBuffer: pdf,
      });
      await logEmailSent(user.id, dedupKey);
      sent += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        `[weekly-report] falha user=${user.id} email=${user.email}: ${err.message}`,
      );
    }
  }

  return {
    candidates: users.length,
    sent,
    skipped,
    failed,
    disabled: false,
    mes,
    dayKey,
  };
}

module.exports = {
  weeklyDedupKey,
  listProUsersForWeeklyReport,
  processWeeklyReportEmails,
};
