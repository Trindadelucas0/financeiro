const { loadEnv } = require('../config/env');
const { PRO_PLAN } = require('../config/plan');
const paymentOrderService = require('./paymentOrderService');
const subscriptionService = require('./subscriptionService');

const API_BASE = 'https://api.checkout.infinitepay.io';

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

function priceCents() {
  return Math.round(PRO_PLAN.monthlyPriceBrl * 100);
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

async function createCheckoutLink(user) {
  const config = getConfig();
  const orderNsu = buildOrderNsu(user.id);
  const amountCents = priceCents();

  await paymentOrderService.createOrder({
    userId: user.id,
    orderNsu,
    amountCents,
  });

  const payload = {
    handle: config.handle,
    items: [{
      quantity: 1,
      price: amountCents,
      description: `Home Finanças Pro — ${PRO_PLAN.accessDays} dias`,
    }],
    order_nsu: orderNsu,
    redirect_url: `${config.appUrl}/app/perfil?checkout=success`,
    webhook_url: `${config.appUrl}/api/payments/webhook`,
    customer: {
      name: user.nome,
      email: user.email,
    },
  };

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

async function fulfillOrder({ orderNsu, transactionNsu, slug }) {
  const order = await paymentOrderService.getOrderByNsu(orderNsu);
  if (!order) {
    const err = new Error('Pedido não encontrado');
    err.status = 404;
    throw err;
  }

  if (order.status === 'paid') {
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
    const subscription = await subscriptionService.getSubscription(order.user_id);
    return { alreadyPaid: true, subscription };
  }

  await subscriptionService.grantProAccess(order.user_id);
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

module.exports = {
  createCheckoutLink,
  verifyPayment,
  fulfillOrder,
  handleWebhook,
};
