#!/usr/bin/env node
/**
 * Lista assinaturas/trials na VPS e, opcionalmente, preenche trials faltantes.
 *
 * Uso:
 *   node scripts/audit-subscriptions.js
 *   node scripts/audit-subscriptions.js --backfill
 */
const { loadEnv } = require('../src/config/env');
const { runMigrations } = require('../src/db/migrate');
const { getPool } = require('../src/db/pool');
const subscriptionAuditService = require('../src/services/subscriptionAuditService');

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19);
}

function printRows(rows) {
  if (rows.length === 0) {
    console.log('(nenhum usuário não-admin)');
    return;
  }

  const header = [
    'email'.padEnd(36),
    'origem'.padEnd(8),
    'grant'.padEnd(10),
    'situacao'.padEnd(14),
    'cadastro'.padEnd(20),
    'vence_em'.padEnd(20),
    'backfill',
  ].join(' ');
  console.log(header);
  console.log('-'.repeat(header.length));

  rows.forEach((row) => {
    console.log(
      [
        String(row.email || '').slice(0, 36).padEnd(36),
        String(row.billingSource || '').padEnd(8),
        String(row.accessGrantType || '—').padEnd(10),
        String(row.situacao || '').padEnd(14),
        formatDate(row.createdAt).padEnd(20),
        formatDate(row.venceEm).padEnd(20),
        row.needsBackfill ? 'SIM' : 'nao',
      ].join(' '),
    );
  });
}

async function main() {
  loadEnv();
  await runMigrations();

  const applyBackfill = process.argv.includes('--backfill');

  const rows = await subscriptionAuditService.listSubscriptionAudit();
  const bySituacao = rows.reduce((acc, row) => {
    acc[row.situacao] = (acc[row.situacao] || 0) + 1;
    return acc;
  }, {});
  const needsBackfill = rows.filter((row) => row.needsBackfill);

  console.log('\n[audit-subscriptions] resumo');
  console.log(`  total: ${rows.length}`);
  Object.keys(bySituacao).sort().forEach((key) => {
    console.log(`  ${key}: ${bySituacao[key]}`);
  });
  console.log(`  precisa_backfill: ${needsBackfill.length}`);
  console.log(`  (site = cadastro solo; manual = admin)\n`);

  printRows(rows);

  if (needsBackfill.length === 0) {
    console.log('\n[audit-subscriptions] nenhum cadastro do site sem data de trial — backfill desnecessário.');
    return;
  }

  if (!applyBackfill) {
    console.log(
      `\n[audit-subscriptions] ${needsBackfill.length} usuário(s) sem trial completo.`
      + `\n  Rode com --backfill para definir vence_em = created_at + ${subscriptionAuditService.TRIAL_DAYS} dias.`,
    );
    return;
  }

  const updated = await subscriptionAuditService.backfillMissingSiteTrials();
  console.log(`\n[audit-subscriptions] backfill aplicado em ${updated.length} usuário(s):`);
  updated.forEach((row) => {
    console.log(
      `  ${row.email} | cadastro=${formatDate(row.createdAt)} | vence=${formatDate(row.venceEm)} | ${row.plan}/${row.subscriptionStatus}`,
    );
  });
}

main()
  .then(async () => {
    try {
      await getPool().end();
    } catch (_) {
      // pool pode não ter sido aberto
    }
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[audit-subscriptions] erro:', err.message);
    try {
      await getPool().end();
    } catch (_) {
      // ignore
    }
    process.exit(1);
  });
