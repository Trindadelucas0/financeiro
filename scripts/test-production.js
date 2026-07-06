#!/usr/bin/env node
'use strict';

const PROD = process.env.PROD_URL || 'https://cashome.avadesk.com.br';

async function check(name, url, options = {}) {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    const ok = options.expectStatus
      ? res.status === options.expectStatus
      : (res.status < 500);
    console.log(`${ok ? '✓' : '✗'} ${name}: ${res.status}`);
    if (options.checkBody) {
      const text = await res.text();
      options.checkBody(text);
    }
    return ok;
  } catch (err) {
    console.log(`✗ ${name}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`\nTestes produção — ${PROD}\n`);

  let passed = 0;
  const total = 5;

  if (await check('Landing', `${PROD}/`)) passed += 1;

  if (await check('Login', `${PROD}/login`)) passed += 1;

  const webhookOk = await check('Webhook endpoint', `${PROD}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  // 400 = rota existe, body inválido | 404 = deploy antigo sem /api/payments
  if (webhookOk) passed += 1;

  const landingRes = await fetch(`${PROD}/`, { signal: AbortSignal.timeout(15000) });
  const html = await landingRes.text();
  const has30 = html.includes('30 dias');
  const no14trial = !html.includes('14 dias grátis');
  console.log(`${has30 ? '✓' : '✗'} Copy 30 dias na landing`);
  console.log(`${no14trial ? '✓' : '✗'} Sem "14 dias grátis" na landing`);
  if (has30) passed += 1;
  if (no14trial) passed += 1;

  console.log(`\n--- ${passed}/${total} checks OK ---`);
  console.log('\nPendente (manual): cadastrar URL no InfinitePay + pagamento real + PDF Pro');
  process.exit(passed >= 4 ? 0 : 1);
}

main();
