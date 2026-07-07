#!/usr/bin/env node
/**
 * Testa montagem de notificações (sem enviar push real).
 */
const {
  buildVencimentoNotifications,
  buildAtrasadosNotification,
  buildOrcamentoNotifications,
  buildAssinaturaNotification,
} = require('../src/services/notificationDispatchService');

const prefs = {
  enabled: true,
  vencimentos: true,
  atrasados: true,
  orcamento: true,
  assinatura: true,
};

const results = [];
const pass = (name) => { results.push({ name, ok: true }); console.log(`✓ ${name}`); };
const fail = (name, err) => { results.push({ name, ok: false, err }); console.error(`✗ ${name}: ${err}`); };

try {
  const vencs = buildVencimentoNotifications([
    { nome: 'Aluguel', valor: 1200, diff: 1, itemId: 'abc-1' },
    { nome: 'Internet', valor: 99, diff: 5, itemId: 'abc-2' },
  ], '2026-07', prefs);

  if (vencs.length === 1 && vencs[0].dedupKey === 'venc:abc-1:2026-07:1') {
    pass('vencimentos filtra diff 0/1/3');
  } else {
    fail('vencimentos filtra diff 0/1/3', `esperado 1, recebeu ${vencs.length}`);
  }

  const atrasados = buildAtrasadosNotification([
    { nome: 'Cartão', valor: 350 },
    { nome: 'Luz', valor: 180 },
  ], prefs);

  if (atrasados && atrasados.body.includes('2 contas atrasadas')) {
    pass('atrasados resume múltiplas contas');
  } else {
    fail('atrasados resume múltiplas contas', 'body incorreto');
  }

  const orcs = buildOrcamentoNotifications([
    { icon: '💸', level: 'danger', text: 'Alimentação: R$ 500.00 ultrapassou o orçamento de R$ 400.00.' },
    { icon: '⚡', level: '', text: 'Margem apertada' },
    { icon: '📊', level: '', text: 'Transporte: 90% do orçamento mensal usado.' },
  ], '2026-07', prefs);

  if (orcs.length === 2 && orcs[0].type === 'orcamento') {
    pass('orcamento filtra alertas 💸 e 📊');
  } else {
    fail('orcamento filtra alertas 💸 e 📊', `esperado 2, recebeu ${orcs.length}`);
  }

  const renewal = buildAssinaturaNotification({
    renewalDueSoon: true,
    currentPeriodEnd: '2026-07-10T00:00:00.000Z',
    daysUntilExpiry: 2,
  }, prefs);

  if (renewal && renewal.dedupKey.startsWith('renewal:') && renewal.url === '/app/perfil') {
    pass('assinatura monta renewalDueSoon');
  } else {
    fail('assinatura monta renewalDueSoon', 'notificação ausente');
  }

  const off = buildVencimentoNotifications([
    { nome: 'X', valor: 10, diff: 0, itemId: 'x' },
  ], '2026-07', { ...prefs, vencimentos: false });

  if (off.length === 0) {
    pass('preferência vencimentos desligada');
  } else {
    fail('preferência vencimentos desligada', 'deveria retornar vazio');
  }
} catch (err) {
  fail('execução geral', err.message);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} testes passaram`);
process.exit(failed.length > 0 ? 1 : 0);
