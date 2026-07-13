const crypto = require('crypto');
const { loadEnv } = require('../config/env');
const { PRO_PLAN } = require('../config/plan');
const { generateTempPassword } = require('../utils/tempPassword');
const paymentOrderService = require('./paymentOrderService');
const subscriptionService = require('./subscriptionService');
const userService = require('./userService');
const emailService = require('./emailService');
const { isValidEmail, normalizeEmail } = require('../utils/email');

const API_BASE = 'https://api.checkout.infinitepay.io';
const WELCOME_WINDOW_MS = 24 * 60 * 60 * 1000;

function getConfig() {
  const { infinitePay } = loadEnv();
  if (!infinitePay.enabled) {
    const err = new Error('Pagamentos não configurados. Defina INFINITEPAY_HANDLE no .env');
    err.status = 503;
    throw err;
  }
  return infinitePay;
}

function buildOrderNsu(userId) {
  return `pro-${userId}-${Date.now()}`;
}

function buildGuestOrderNsu() {
  return `guest-${crypto.randomUUID()}-${Date.now()}`;
}

function priceCents() {
  return Math.round(PRO_PLAN.monthlyPriceBrl * 100);
}

function isWithinWelcomeWindow(order) {
  const ref = order.paid_at || order.created_at;
  if (!ref) return false;
  return Date.now() - new Date(ref).getTime() <= WELCOME_WINDOW_MS;
}

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || 'Falha na API InfinitePay');
    err.status = 502;
    throw err;
  }
  return data;
}

function extractCheckoutUrl(data) {
  return data.url || data.checkout_url || data.link || null;
}

function buildCheckoutPayload({ config, orderNsu, amountCents, redirectUrl, customer }) {
  return {
    handle: config.handle,
    items: [{
      quantity: 1,
      price: amountCents,
      description: `Home Finanças Pro — ${PRO_PLAN.accessDays} dias`,
    }],
    order_nsu: orderNsu,
    redirect_url: redirectUrl,
    webhook_url: `${config.appUrl}/api/payments/webhook`,
    customer,
  };
}

async function createCheckoutLink(user) {
  const config = getConfig();
  const orderNsu = buildOrderNsu(user.id);
  const amountCents = priceCents();

  await paymentOrderService.createOrder({
    userId: user.id,
    orderNsu,
    amountCents,
    checkoutSource: 'profile',
  });

  const payload = buildCheckoutPayload({
    config,
    orderNsu,
    amountCents,
    redirectUrl: `${config.appUrl}/app/perfil?checkout=success`,
    customer: {
      name: user.nome,
      email: user.email,
    },
  });

  const data = await postJson('/links', payload);
  const url = extractCheckoutUrl(data);

  if (!url) {
    const err = new Error('InfinitePay não retornou URL de checkout');
    err.status = 502;
    throw err;
  }

  return { url, orderNsu, slug: data.slug || null };
}

async function createGuestCheckoutLink({ nome, email }) {
  const config = getConfig();
  const trimmedNome = String(nome || '').trim();
  const normalizedEmail = normalizeEmail(email);

  if (!trimmedNome || trimmedNome.length < 2) {
    const err = new Error('Informe seu nome completo');
    err.status = 400;
    throw err;
  }

  if (!isValidEmail(normalizedEmail)) {
    const err = new Error('Informe um e-mail válido');
    err.status = 400;
    throw err;
  }

  const orderNsu = buildGuestOrderNsu();
  const amountCents = priceCents();

  await paymentOrderService.createGuestOrder({
    orderNsu,
    amountCents,
    customerNome: trimmedNome,
    customerEmail: normalizedEmail,
  });

  const payload = buildCheckoutPayload({
    config,
    orderNsu,
    amountCents,
    redirectUrl: `${config.appUrl}/login?checkout=success`,
    customer: {
      name: trimmedNome,
      email: normalizedEmail,
    },
  });

  const data = await postJson('/links', payload);
  const url = extractCheckoutUrl(data);

  if (!url) {
    const err = new Error('InfinitePay não retornou URL de checkout');
    err.status = 502;
    throw err;
  }

  return { url, orderNsu, slug: data.slug || null };
}

async function verifyPayment({ orderNsu, transactionNsu, slug }) {
  const config = getConfig();

  const body = {
    handle: config.handle,
    order_nsu: orderNsu,
  };

  if (transactionNsu) body.transaction_nsu = transactionNsu;
  if (slug) body.slug = slug;

  return postJson('/payment_check', body);
}

async function provisionGuestOrder(order) {
  const email = String(order.customer_email || '').trim().toLowerCase();
  const nome = String(order.customer_nome || '').trim();

  if (!email || !nome) {
    const err = new Error('Dados do cliente ausentes no pedido');
    err.status = 500;
    throw err;
  }

  let existingUser = await userService.getUserByEmail(email);
  let isNewAccount = false;
  let tempPassword = null;

  if (!existingUser) {
    tempPassword = generateTempPassword(nome);
    try {
      existingUser = await userService.createUserFromPurchase({
        nome,
        email,
        password: tempPassword,
      });
      isNewAccount = true;
    } catch (err) {
      if (err.status === 409) {
        existingUser = await userService.getUserByEmail(email);
        if (!existingUser) throw err;
      } else {
        throw err;
      }
    }
  }

  await paymentOrderService.linkOrderToUser(order.order_nsu, existingUser.id);
  await subscriptionService.grantProAccess(existingUser.id, undefined, { accessGrantType: 'paid' });

  if (isNewAccount && tempPassword) {
    emailService.sendCredentialsEmail({
      to: email,
      nome,
      email,
      username: existingUser.username,
      tempPassword,
    }).catch(function (err) {
      console.error('[email] Falha ao enviar credenciais:', err.message);
    });

    emailService.sendWelcomeEmail({
      to: email,
      nome,
    }).catch(function (err) {
      console.error('[email] Falha ao enviar boas-vindas:', err.message);
    });
  }

  return {
    userId: existingUser.id,
    user: existingUser,
    isNewAccount,
    tempPassword: isNewAccount ? tempPassword : null,
  };
}

async function fulfillOrder({ orderNsu, transactionNsu, slug }) {
  let order = await paymentOrderService.getOrderByNsu(orderNsu);
  if (!order) {
    const err = new Error('Pedido não encontrado');
    err.status = 404;
    throw err;
  }

  if (order.status === 'paid') {
    if (!order.user_id && order.checkout_source === 'guest') {
      const provisioned = await provisionGuestOrder(order);
      order = await paymentOrderService.getOrderByNsu(orderNsu);
      const subscription = await subscriptionService.getSubscription(provisioned.userId);
      return { alreadyPaid: true, subscription, provisioned };
    }

    if (!order.user_id) {
      const err = new Error('Pedido pago sem usuário vinculado');
      err.status = 500;
      throw err;
    }

    const subscription = await subscriptionService.getSubscription(order.user_id);
    return { alreadyPaid: true, subscription };
  }

  const check = await verifyPayment({ orderNsu, transactionNsu, slug });
  if (!check.paid) {
    const err = new Error('Pagamento ainda não confirmado');
    err.status = 402;
    throw err;
  }

  const paid = await paymentOrderService.markOrderPaid({
    orderNsu,
    invoiceSlug: slug || check.slug || null,
    transactionNsu: transactionNsu || check.transaction_nsu || null,
  });

  if (!paid) {
    order = await paymentOrderService.getOrderByNsu(orderNsu);
    if (order && order.user_id) {
      const subscription = await subscriptionService.getSubscription(order.user_id);
      return { alreadyPaid: true, subscription };
    }
  }

  order = paid || await paymentOrderService.getOrderByNsu(orderNsu);

  if (order.checkout_source === 'guest' || !order.user_id) {
    const provisioned = await provisionGuestOrder(order);
    const subscription = await subscriptionService.getSubscription(provisioned.userId);
    return { alreadyPaid: false, subscription, provisioned };
  }

  await subscriptionService.grantProAccess(order.user_id, undefined, { accessGrantType: 'paid' });
  const subscription = await subscriptionService.getSubscription(order.user_id);
  return { alreadyPaid: false, subscription };
}

async function handleWebhook(payload) {
  const orderNsu = payload.order_nsu;
  if (!orderNsu) {
    const err = new Error('order_nsu ausente no webhook');
    err.status = 400;
    throw err;
  }

  return fulfillOrder({
    orderNsu,
    transactionNsu: payload.transaction_nsu,
    slug: payload.invoice_slug || payload.slug,
  });
}

async function getWelcomeCredentials({ orderNsu, transactionNsu, slug }) {
  let order = await paymentOrderService.getOrderByNsu(orderNsu);

  if (!order) {
    const err = new Error('Pedido não encontrado');
    err.status = 404;
    throw err;
  }

  if (order.checkout_source !== 'guest') {
    const err = new Error('Pedido não elegível para credenciais de boas-vindas');
    err.status = 404;
    throw err;
  }

  if (!isWithinWelcomeWindow(order)) {
    const err = new Error('Credenciais expiradas. Entre com sua senha ou fale com o suporte.');
    err.status = 410;
    throw err;
  }

  if (order.status !== 'paid') {
    try {
      await fulfillOrder({ orderNsu, transactionNsu, slug });
      order = await paymentOrderService.getOrderByNsu(orderNsu);
    } catch (err) {
      if (err.status === 402) {
        return {
          pending: true,
          message: 'Confirmando pagamento… tente novamente em alguns segundos.',
        };
      }
      throw err;
    }
  }

  if (order.status !== 'paid' || !order.user_id) {
    return {
      pending: true,
      message: 'Confirmando pagamento… tente novamente em alguns segundos.',
    };
  }

  const { getPool } = require('../db/pool');
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, nome, username, email, must_change_password
     FROM users WHERE id = $1 LIMIT 1`,
    [order.user_id],
  );

  if (rows.length === 0) {
    const err = new Error('Usuário não encontrado');
    err.status = 404;
    throw err;
  }

  const user = rows[0];
  const isNewAccount = Boolean(user.must_change_password);
  const tempPassword = isNewAccount ? generateTempPassword(order.customer_nome) : null;

  return {
    pending: false,
    email: user.email,
    username: user.username,
    tempPassword,
    isNewAccount,
    loginHint: isNewAccount
      ? 'Use o e-mail e a senha temporária abaixo. Você precisará definir uma nova senha.'
      : 'Sua conta já existia. Entre com sua senha habitual — o acesso Pro foi liberado.',
  };
}

module.exports = {
  createCheckoutLink,
  createGuestCheckoutLink,
  verifyPayment,
  fulfillOrder,
  handleWebhook,
  getWelcomeCredentials,
};
