#!/usr/bin/env node
'use strict';

require('dotenv').config();

const BASE = process.env.APP_URL || 'http://localhost:3538';

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: res.status, data };
}

async function login(identifier, password) {
  const { status, data } = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier, password },
  });
  if (status !== 200 || !data.token) {
    throw new Error(`Login falhou (${status}): ${data?.error || 'sem token'}`);
  }
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const results = [];
  const pass = (name) => { results.push({ name, ok: true }); console.log(`✓ ${name}`); };
  const fail = (name, err) => { results.push({ name, ok: false, err: err.message }); console.error(`✗ ${name}: ${err.message}`); };

  console.log(`\nTestes InfinitePay — ${BASE}\n`);

  // 1. Env
  try {
    assert(process.env.INFINITEPAY_HANDLE, 'INFINITEPAY_HANDLE ausente');
    assert(process.env.APP_URL, 'APP_URL ausente');
    pass('Variáveis .env (INFINITEPAY_HANDLE + APP_URL)');
  } catch (e) { fail('Variáveis .env', e); }

  // 2. Landing
  try {
    const res = await fetch(`${BASE}/`);
    assert(res.status === 200, `status ${res.status}`);
    const html = await res.text();
    assert(html.includes('30 dias') || html.includes('R$'), 'copy de preço na landing');
    assert(html.includes('acquireForm') || html.includes('Adquirir'), 'formulário de compra na landing');
    pass('Landing carrega com preço e compra');
  } catch (e) { fail('Landing', e); }

  // 2.5 Guest checkout sem auth
  let guestOrderNsu;
  try {
    const { status, data } = await request('/api/payments/guest-checkout', {
      method: 'POST',
      body: { nome: 'Teste Guest', email: `guest-${Date.now()}@local.dev` },
    });
    assert(status === 200, `status ${status}: ${data?.error}`);
    assert(data.url && data.url.includes('checkout.infinitepay'), 'URL guest checkout inválida');
    guestOrderNsu = data.orderNsu;
    pass(`Guest checkout gera URL (${guestOrderNsu})`);
  } catch (e) { fail('Guest checkout', e); }

  // 2.6 Welcome sem pedido pago
  try {
    const { status } = await request('/api/payments/welcome?order_nsu=inexistente-123');
    assert(status === 404, `esperado 404, got ${status}`);
    pass('Welcome retorna 404 para pedido inexistente');
  } catch (e) { fail('Welcome pedido inexistente', e); }

  // 3. Stripe removido
  try {
    const { status } = await request('/api/stripe/checkout', { method: 'POST' });
    assert(status === 404, `esperado 404, got ${status}`);
    pass('Rota Stripe removida (404)');
  } catch (e) { fail('Rota Stripe removida', e); }

  // 4. Login admin
  let adminToken;
  try {
    const data = await login('admin@local.dev', 'Admin@123');
    adminToken = data.token;
    assert(data.subscription.isPro, 'admin deve ser Pro');
    pass('Login admin + isPro');
  } catch (e) { fail('Login admin', e); }

  // 5. PDF admin
  if (adminToken) {
    try {
      const res = await fetch(`${BASE}/api/finance/export/pdf`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(res.status === 200, `status ${res.status}`);
      assert((res.headers.get('content-type') || '').includes('pdf'), 'content-type pdf');
      pass('Export PDF admin (200)');
    } catch (e) { fail('Export PDF admin', e); }
  }

  // 5.1 Dashboard admin sem pagamento
  if (adminToken) {
    try {
      const { status } = await request('/api/finance/dashboard', { token: adminToken });
      assert(status === 200, `esperado 200, got ${status}`);
      pass('Dashboard liberado para admin (200)');
    } catch (e) { fail('Dashboard admin', e); }
  }

  // 5.5 Reset usuário teste para free (execuções anteriores deixam Pro)
  try {
    const { getPool } = require('../src/db/pool');
    const pool = getPool();
    await pool.query(
      `UPDATE users
       SET plan = 'free', subscription_status = NULL, subscription_current_period_end = NULL
       WHERE email = 'testpay@local.dev'`,
    );
    pass('Reset usuário teste para free');
  } catch (e) { fail('Reset usuário teste', e); }

  // 6. Login usuário free
  let userToken;
  let userSub;
  try {
    const data = await login('testpay@local.dev', 'Test@123');
    userToken = data.token;
    userSub = data.subscription;
    assert(!data.subscription.isPro, 'usuário teste deve estar free');
    pass('Login usuário free');
  } catch (e) { fail('Login usuário free', e); }

  // 7. Painel bloqueado sem assinatura
  if (userToken) {
    try {
      const { status, data } = await request('/api/finance/dashboard', { token: userToken });
      assert(status === 402, `esperado 402, got ${status}`);
      assert(
        data.code === 'SUBSCRIPTION_REQUIRED' || data.code === 'PRO_REQUIRED',
        'code SUBSCRIPTION_REQUIRED',
      );
      pass('Dashboard bloqueado sem assinatura (402)');
    } catch (e) { fail('Dashboard bloqueado sem assinatura', e); }
  }

  // 7.1 PDF bloqueado sem assinatura
  if (userToken) {
    try {
      const { status, data } = await request('/api/finance/export/pdf', { token: userToken });
      assert(status === 402, `esperado 402, got ${status}`);
      assert(
        data.code === 'SUBSCRIPTION_REQUIRED' || data.code === 'PRO_REQUIRED',
        'code SUBSCRIPTION_REQUIRED',
      );
      pass('PDF bloqueado sem assinatura (402)');
    } catch (e) { fail('PDF bloqueado sem assinatura', e); }
  }

  // 8. Checkout InfinitePay gera URL
  let checkoutUrl;
  let orderNsu;
  if (userToken) {
    try {
      const { status, data } = await request('/api/payments/checkout', {
        method: 'POST',
        token: userToken,
        body: {},
      });
      assert(status === 200, `status ${status}: ${data?.error}`);
      assert(data.url && data.url.includes('checkout.infinitepay'), 'URL checkout inválida');
      checkoutUrl = data.url;
      orderNsu = data.orderNsu;
      pass(`Checkout gera URL (${orderNsu})`);
    } catch (e) { fail('Checkout InfinitePay', e); }
  }

  // 9. Simular liberação Pro (grantProAccess via DB — pagamento real exige Pix/cartão)
  if (userToken) {
    try {
      const subscriptionService = require('../src/services/subscriptionService');
      const { getPool } = require('../src/db/pool');
      const pool = getPool();
      const { rows } = await pool.query(
        "SELECT id FROM users WHERE email = 'testpay@local.dev' LIMIT 1",
      );
      assert(rows.length, 'usuário teste no banco');
      await subscriptionService.grantProAccess(rows[0].id, 30);
      const me = await request('/api/auth/me', { token: userToken });
      assert(me.data.subscription.isPro, 'deveria ser Pro após grant');
      pass('Liberação Pro (30 dias) + /api/auth/me confirma');
    } catch (e) { fail('Liberação Pro simulada', e); }
  }

  // 10. Painel e PDF liberados após Pro
  if (userToken) {
    try {
      const dash = await request('/api/finance/dashboard', { token: userToken });
      assert(dash.status === 200, `dashboard status ${dash.status}`);
      const res = await fetch(`${BASE}/api/finance/export/pdf`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      assert(res.status === 200, `pdf status ${res.status}`);
      pass('Dashboard e PDF liberados após assinatura (200)');
    } catch (e) { fail('Painel após assinatura', e); }
  }

  // 10.1 Bloqueio após expiração simulada
  if (userToken) {
    try {
      const { getPool } = require('../src/db/pool');
      const pool = getPool();
      await pool.query(
        `UPDATE users
         SET subscription_current_period_end = NOW() - INTERVAL '1 day'
         WHERE email = 'testpay@local.dev'`,
      );
      const { status, data } = await request('/api/finance/dashboard', { token: userToken });
      assert(status === 402, `esperado 402 após expirar, got ${status}`);
      assert(
        data.code === 'SUBSCRIPTION_REQUIRED' || data.code === 'PRO_REQUIRED',
        'code SUBSCRIPTION_REQUIRED',
      );
      pass('Dashboard bloqueado após expiração (402)');
    } catch (e) { fail('Bloqueio após expiração', e); }
  }

  // 11. Webhook endpoint responde
  if (orderNsu) {
    try {
      const { status } = await request('/api/payments/webhook', {
        method: 'POST',
        body: { order_nsu: orderNsu, transaction_nsu: 'test-fake', invoice_slug: 'test' },
      });
      assert(status === 200 || status === 402, `status inesperado ${status}`);
      pass('Webhook endpoint acessível');
    } catch (e) { fail('Webhook endpoint', e); }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${results.length - failed.length}/${results.length} testes OK ---`);
  if (checkoutUrl) {
    console.log(`\nLink checkout gerado (abrir no navegador para pagar de verdade):`);
    console.log(checkoutUrl.slice(0, 120) + '...');
  }
  if (failed.length) {
    failed.forEach((f) => console.error(`  FALHOU: ${f.name} — ${f.err}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
