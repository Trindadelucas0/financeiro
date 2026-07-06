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

  console.log(`\nTestes clientes manuais — ${BASE}\n`);

  const testEmail = `manual-client-${Date.now()}@local.dev`;
  let adminToken;
  let clientId;
  let clientToken;
  let clientPassword;

  try {
    const data = await login('admin@local.dev', 'Admin@123');
    adminToken = data.token;
    pass('Login admin');
  } catch (e) { fail('Login admin', e); }

  if (adminToken) {
    try {
      const { status, data } = await request('/api/admin/clients', {
        method: 'POST',
        token: adminToken,
        body: { nome: 'Cliente Manual Teste', email: testEmail },
      });
      assert(status === 201, `esperado 201, got ${status}: ${data?.error}`);
      assert(data.client && data.client.id, 'client.id ausente');
      assert(data.client.subscription && data.client.subscription.isPro, 'cliente deve nascer Pro');
      assert(data.tempPassword, 'senha temporária deve ser retornada');
      clientId = data.client.id;
      clientPassword = data.tempPassword;
      pass('POST /api/admin/clients cria cliente Pro');
    } catch (e) { fail('Criar cliente manual', e); }
  }

  if (adminToken) {
    try {
      const { status, data } = await request('/api/admin/clients', { token: adminToken });
      assert(status === 200, `esperado 200, got ${status}`);
      const found = (data.clients || []).find((c) => c.email === testEmail);
      assert(found, 'cliente listado em GET /api/admin/clients');
      assert(found.billingSource === 'manual', 'billingSource manual');
      pass('GET /api/admin/clients lista cliente manual');
    } catch (e) { fail('Listar clientes manuais', e); }
  }

  if (clientId && clientPassword) {
    try {
      const loginRes = await request('/api/auth/login', {
        method: 'POST',
        body: { identifier: testEmail, password: clientPassword },
      });
      assert(loginRes.status === 200, `login cliente status ${loginRes.status}`);
      assert(loginRes.data.subscription.isPro, 'cliente logado deve ser Pro');
      clientToken = loginRes.data.token;
      pass('Cliente manual faz login com senha gerada');
    } catch (e) { fail('Login cliente manual', e); }
  }

  if (clientToken) {
    try {
      const { status } = await request('/api/finance/dashboard', { token: clientToken });
      assert(status === 200, `dashboard status ${status}`);
      pass('Dashboard liberado para cliente manual ativo');
    } catch (e) { fail('Dashboard cliente ativo', e); }
  }

  if (clientId && adminToken) {
    try {
      const { status, data } = await request(`/api/admin/clients/${clientId}/payments`, {
        method: 'POST',
        token: adminToken,
        body: {},
      });
      assert(status === 200, `esperado 200, got ${status}: ${data?.error}`);
      assert(data.periodEnd, 'periodEnd retornado');
      assert(data.client.subscription.isPro, 'cliente continua Pro após pagamento');
      pass('POST /api/admin/clients/:id/payments renova assinatura');
    } catch (e) { fail('Registrar pagamento manual', e); }
  }

  if (clientId && clientToken) {
    try {
      const { getPool } = require('../src/db/pool');
      const pool = getPool();
      await pool.query(
        `UPDATE users
         SET subscription_current_period_end = NOW() - INTERVAL '1 day'
         WHERE id = $1`,
        [clientId],
      );
      const { status, data } = await request('/api/finance/dashboard', { token: clientToken });
      assert(status === 402, `esperado 402 após expirar, got ${status}`);
      assert(
        data.code === 'SUBSCRIPTION_REQUIRED' || data.code === 'PRO_REQUIRED',
        'code SUBSCRIPTION_REQUIRED',
      );
      pass('Dashboard bloqueado após expiração simulada');
    } catch (e) { fail('Bloqueio após expiração', e); }
  }

  if (clientId && adminToken && clientToken) {
    try {
      const { status } = await request(`/api/admin/clients/${clientId}/payments`, {
        method: 'POST',
        token: adminToken,
        body: {},
      });
      assert(status === 200, `renovação status ${status}`);
      const dash = await request('/api/finance/dashboard', { token: clientToken });
      assert(dash.status === 200, `dashboard liberado status ${dash.status}`);
      pass('Pagamento manual libera dashboard novamente');
    } catch (e) { fail('Liberar após pagamento manual', e); }
  }

  if (adminToken) {
    try {
      const { status } = await request('/api/admin/clients', {
        method: 'POST',
        token: adminToken,
        body: { nome: '', email: '' },
      });
      assert(status === 400, `esperado 400 sem dados válidos, got ${status}`);
      pass('Validação de criação rejeita payload inválido');
    } catch (e) { fail('Validação criação', e); }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${results.length - failed.length}/${results.length} testes OK ---`);
  if (failed.length) {
    failed.forEach((f) => console.error(`  FALHOU: ${f.name} — ${f.err}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
