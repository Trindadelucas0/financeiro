const pushSubscriptionService = require('./pushSubscriptionService');

const GREETING_SLOTS = [
  {
    id: 'cafe_manha',
    hour: 7,
    title: 'Bom café da manhã',
    body: 'Comece o dia organizando suas finanças no Home Finanças.',
  },
  {
    id: 'almoco',
    hour: 12,
    title: 'Bom almoço',
    body: 'Pausa merecida! Confira suas contas do mês quando puder.',
  },
  {
    id: 'lanche',
    hour: 15,
    title: 'Bom lanche',
    body: 'Que tal uma olhada rápida no seu saldo e pendências?',
  },
  {
    id: 'noite',
    hour: 21,
    title: 'Boa noite',
    body: 'Encerre o dia em paz — revise o que ficou pendente amanhã.',
  },
];

const WINDOW_MINUTES = 15;

function getLocalTimeParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = {};
  parts.forEach((p) => {
    if (p.type !== 'literal') map[p.type] = p.value;
  });

  const hour = Number(map.hour);
  const minute = Number(map.minute);
  const dateKey = `${map.year}-${map.month}-${map.day}`;

  return { hour, minute, dateKey };
}

function findSlotById(slotId) {
  return GREETING_SLOTS.find((s) => s.id === slotId) || null;
}

function resolveActiveGreetingSlot(date, timezone, options = {}) {
  const { forceSlot } = options;

  if (forceSlot) {
    return findSlotById(forceSlot);
  }

  const { hour, minute } = getLocalTimeParts(date, timezone);
  if (minute >= WINDOW_MINUTES) return null;

  return GREETING_SLOTS.find((slot) => slot.hour === hour) || null;
}

function buildGreetingNotification(slot, timezone, date) {
  const { dateKey } = getLocalTimeParts(date, timezone);

  return {
    type: 'saudacao',
    priority: 0,
    dedupKey: `greet:${slot.id}:${dateKey}`,
    title: slot.title,
    body: slot.body,
    tag: `greet-${slot.id}-${dateKey}`,
    url: '/app/dashboard',
  };
}

async function dispatchGreetingForUser(userId, options = {}) {
  const prefs = await pushSubscriptionService.getPreferences(userId);
  if (!prefs.enabled || !prefs.saudacoes) return [];

  const timezone = prefs.timezone || pushSubscriptionService.DEFAULT_TIMEZONE;
  const now = options.now || new Date();
  const slot = resolveActiveGreetingSlot(now, timezone, {
    forceSlot: options.forceSlot,
  });

  if (!slot) return [];

  const notification = buildGreetingNotification(slot, timezone, now);
  const already = await pushSubscriptionService.wasAlreadySent(userId, notification.dedupKey);
  if (already) return [];

  return [notification];
}

module.exports = {
  GREETING_SLOTS,
  WINDOW_MINUTES,
  getLocalTimeParts,
  resolveActiveGreetingSlot,
  buildGreetingNotification,
  dispatchGreetingForUser,
};
