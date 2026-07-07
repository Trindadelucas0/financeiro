const financeService = require('./financeService');
const subscriptionService = require('./subscriptionService');
const pushSubscriptionService = require('./pushSubscriptionService');

const MAX_PER_RUN = 2;
const VENCIMENTO_DAYS = new Set([0, 1, 3]);

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function todayKey(timezone) {
  const tz = timezone || pushSubscriptionService.DEFAULT_TIMEZONE;
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

function vencimentoLabel(diff) {
  if (diff === 0) return 'vence hoje';
  if (diff === 1) return 'vence amanhã';
  return `vence em ${diff} dias`;
}

function vencimentoPriority(diff) {
  if (diff === 0) return 1;
  if (diff === 1) return 2;
  return 5;
}

function buildVencimentoNotifications(vencimentos, mes, prefs) {
  if (!prefs.vencimentos) return [];

  return vencimentos
    .filter((v) => VENCIMENTO_DAYS.has(v.diff))
    .map((v) => ({
      type: 'vencimentos',
      priority: vencimentoPriority(v.diff),
      dedupKey: `venc:${v.itemId}:${mes}:${v.diff}`,
      title: 'Conta a vencer',
      body: `${v.nome} ${vencimentoLabel(v.diff)} — ${formatBRL(v.valor)}`,
      tag: `venc-${v.itemId}-${v.diff}`,
      url: '/app/dashboard',
    }));
}

function buildAtrasadosNotification(atrasados, prefs, timezone) {
  if (!prefs.atrasados || !atrasados.length) return null;

  const count = atrasados.length;
  const total = atrasados.reduce((s, a) => s + Number(a.valor || 0), 0);
  const body = count === 1
    ? `${atrasados[0].nome} atrasada — ${formatBRL(atrasados[0].valor)}`
    : `${count} contas atrasadas — ${formatBRL(total)}. Toque para ver.`;

  const dateKey = todayKey(timezone);

  return {
    type: 'atrasados',
    priority: 3,
    dedupKey: `atrasados:${dateKey}`,
    title: 'Contas atrasadas',
    body,
    tag: `atrasados-${dateKey}`,
    url: '/app/dashboard',
  };
}

function isOrcamentoAlert(alert) {
  const icon = alert.icon || '';
  return icon === '💸' || icon === '📊';
}

function orcamentoLevel(alert) {
  return alert.level === 'danger' ? 'over' : 'warn';
}

function extractCategoria(text) {
  const idx = text.indexOf(':');
  if (idx > 0) return text.slice(0, idx).trim();
  return 'Orçamento';
}

function buildOrcamentoNotifications(alerts, mes, prefs) {
  if (!prefs.orcamento) return [];

  return alerts
    .filter(isOrcamentoAlert)
    .map((alert) => {
      const categoria = extractCategoria(alert.text);
      const nivel = orcamentoLevel(alert);
      return {
        type: 'orcamento',
        priority: nivel === 'over' ? 4 : 6,
        dedupKey: `orc:${categoria}:${mes}:${nivel}`,
        title: nivel === 'over' ? 'Orçamento estourado' : 'Orçamento quase no limite',
        body: alert.text,
        tag: `orc-${categoria}-${mes}-${nivel}`,
        url: '/app/orcamentos',
      };
    });
}

function buildAssinaturaNotification(sub, prefs) {
  if (!prefs.assinatura || !sub.renewalDueSoon || !sub.currentPeriodEnd) return null;

  const days = sub.daysUntilExpiry || 0;
  let body;
  if (days === 1) body = 'Sua assinatura expira amanhã. Renove em Meu perfil.';
  else body = `Sua assinatura expira em ${days} dias. Renove em Meu perfil.`;

  const periodEnd = String(sub.currentPeriodEnd).slice(0, 10);

  return {
    type: 'assinatura',
    priority: 7,
    dedupKey: `renewal:${periodEnd}:${days}`,
    title: 'Assinatura expirando',
    body,
    tag: `renewal-${periodEnd}`,
    url: '/app/perfil',
  };
}

function sortByPriority(notifications) {
  return notifications.sort((a, b) => a.priority - b.priority);
}

async function buildNotificationsForUser(userId) {
  const prefs = await pushSubscriptionService.getPreferences(userId);
  if (!prefs.enabled) return [];

  const [dashboard, sub] = await Promise.all([
    financeService.getDashboard(userId),
    subscriptionService.getSubscription(userId),
  ]);

  const candidates = [
    ...buildVencimentoNotifications(dashboard.vencimentosProximos, dashboard.mes, prefs),
    buildAtrasadosNotification(dashboard.atrasados, prefs, prefs.timezone),
    ...buildOrcamentoNotifications(dashboard.alerts, dashboard.mes, prefs),
    buildAssinaturaNotification(sub, prefs),
  ].filter(Boolean);

  return sortByPriority(candidates);
}

async function dispatchForUser(userId) {
  const notifications = await buildNotificationsForUser(userId);
  const toSend = [];

  for (const n of notifications) {
    if (toSend.length >= MAX_PER_RUN) break;
    const already = await pushSubscriptionService.wasAlreadySent(userId, n.dedupKey);
    if (!already) toSend.push(n);
  }

  return toSend;
}

module.exports = {
  MAX_PER_RUN,
  formatBRL,
  todayKey,
  buildNotificationsForUser,
  buildVencimentoNotifications,
  buildAtrasadosNotification,
  buildOrcamentoNotifications,
  buildAssinaturaNotification,
  dispatchForUser,
};
