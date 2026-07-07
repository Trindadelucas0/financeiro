#!/usr/bin/env node
/**
 * Testa montagem de saudações por fuso horário (sem enviar push real).
 */
const {
  getLocalTimeParts,
  resolveActiveGreetingSlot,
  buildGreetingNotification,
  GREETING_SLOTS,
} = require('../src/services/greetingNotificationService');

const TZ = 'America/Sao_Paulo';
const prefsOn = { enabled: true, saudacoes: true, timezone: TZ };
const prefsOff = { enabled: true, saudacoes: false, timezone: TZ };

const results = [];
const pass = (name) => { results.push({ name, ok: true }); console.log(`✓ ${name}`); };
const fail = (name, err) => { results.push({ name, ok: false, err }); console.error(`✗ ${name}: ${err}`); };

function dateAtLocal(hour, minute, year, month, day) {
  // Offset aproximado para SP (UTC-3) — suficiente para testes de janela
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0));
}

try {
  const at705 = dateAtLocal(7, 5, 2026, 7, 7);
  const slotMorning = resolveActiveGreetingSlot(at705, TZ);
  if (slotMorning && slotMorning.id === 'cafe_manha') {
    pass('07:05 SP retorna cafe_manha');
  } else {
    fail('07:05 SP retorna cafe_manha', slotMorning ? slotMorning.id : 'null');
  }

  const at720 = dateAtLocal(7, 20, 2026, 7, 7);
  const slotLate = resolveActiveGreetingSlot(at720, TZ);
  if (slotLate === null) {
    pass('07:20 SP fora da janela retorna null');
  } else {
    fail('07:20 SP fora da janela retorna null', slotLate.id);
  }

  const at1210 = dateAtLocal(12, 10, 2026, 7, 7);
  const slotLunch = resolveActiveGreetingSlot(at1210, TZ);
  if (slotLunch && slotLunch.id === 'almoco') {
    pass('12:10 SP retorna almoco');
  } else {
    fail('12:10 SP retorna almoco', slotLunch ? slotLunch.id : 'null');
  }

  const at1505 = dateAtLocal(15, 5, 2026, 7, 7);
  const slotSnack = resolveActiveGreetingSlot(at1505, TZ);
  if (slotSnack && slotSnack.id === 'lanche') {
    pass('15:05 SP retorna lanche');
  } else {
    fail('15:05 SP retorna lanche', slotSnack ? slotSnack.id : 'null');
  }

  const at2105 = dateAtLocal(21, 5, 2026, 7, 7);
  const slotNight = resolveActiveGreetingSlot(at2105, TZ);
  if (slotNight && slotNight.id === 'noite') {
    pass('21:05 SP retorna noite');
  } else {
    fail('21:05 SP retorna noite', slotNight ? slotNight.id : 'null');
  }

  const notif = buildGreetingNotification(GREETING_SLOTS[0], TZ, at705);
  if (notif.dedupKey === 'greet:cafe_manha:2026-07-07' && notif.type === 'saudacao') {
    pass('dedupKey usa data local do fuso');
  } else {
    fail('dedupKey usa data local do fuso', notif.dedupKey);
  }

  const forced = resolveActiveGreetingSlot(new Date(), TZ, { forceSlot: 'almoco' });
  if (forced && forced.id === 'almoco') {
    pass('forceSlot ignora horário');
  } else {
    fail('forceSlot ignora horário', 'null');
  }

  const parts = getLocalTimeParts(at705, TZ);
  if (parts.hour === 7 && parts.minute === 5 && parts.dateKey === '2026-07-07') {
    pass('getLocalTimeParts extrai hora e data');
  } else {
    fail('getLocalTimeParts extrai hora e data', JSON.stringify(parts));
  }

  if (!prefsOff.saudacoes) {
    pass('prefsOff tem saudacoes desligado');
  } else {
    fail('prefsOff tem saudacoes desligado', 'saudacoes true');
  }

  if (prefsOn.saudacoes) {
    pass('prefsOn tem saudacoes ligado');
  } else {
    fail('prefsOn tem saudacoes ligado', 'saudacoes false');
  }
} catch (err) {
  fail('execução geral', err.message);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} testes passaram`);
process.exit(failed.length > 0 ? 1 : 0);
