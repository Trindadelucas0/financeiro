const webpush = require('web-push');
const { loadEnv } = require('../config/env');
const pushSubscriptionService = require('./pushSubscriptionService');

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const { vapid } = loadEnv();
  if (!vapid.enabled) {
    const err = new Error('Web Push não configurado (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)');
    err.status = 503;
    throw err;
  }
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  configured = true;
}

function getPublicKey() {
  const { vapid } = loadEnv();
  if (!vapid.publicKey) {
    const err = new Error('VAPID_PUBLIC_KEY não configurada');
    err.status = 503;
    throw err;
  }
  return vapid.publicKey;
}

function isEnabled() {
  const { vapid } = loadEnv();
  return vapid.enabled;
}

async function sendToSubscription(subscription, payload) {
  ensureConfigured();
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    const status = err.statusCode || err.status;
    if (status === 404 || status === 410) {
      await pushSubscriptionService.removeSubscriptionByEndpoint(subscription.endpoint);
      return { ok: false, expired: true };
    }
    return { ok: false, error: err.message };
  }
}

async function sendToUser(userId, notification) {
  const subscriptions = await pushSubscriptionService.getSubscriptionsForUser(userId);
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, expired: 0 };
  }

  const payload = {
    title: notification.title,
    body: notification.body,
    tag: notification.tag || notification.dedupKey,
    url: notification.url || '/app/dashboard',
  };

  let sent = 0;
  let failed = 0;
  let expired = 0;

  for (const sub of subscriptions) {
    const result = await sendToSubscription(sub, payload);
    if (result.ok) sent += 1;
    else if (result.expired) expired += 1;
    else failed += 1;
  }

  return { sent, failed, expired };
}

module.exports = {
  getPublicKey,
  isEnabled,
  sendToUser,
  sendToSubscription,
};
