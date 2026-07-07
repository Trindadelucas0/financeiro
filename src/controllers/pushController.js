const webPushService = require('../services/webPushService');
const pushSubscriptionService = require('../services/pushSubscriptionService');

async function getVapidPublicKey(req, res, next) {
  try {
    if (!webPushService.isEnabled()) {
      return res.status(503).json({ error: 'Notificações push não configuradas no servidor' });
    }
    return res.json({ publicKey: webPushService.getPublicKey() });
  } catch (err) {
    return next(err);
  }
}

async function subscribe(req, res, next) {
  try {
    if (!webPushService.isEnabled()) {
      return res.status(503).json({ error: 'Notificações push não configuradas no servidor' });
    }

    const subscription = await pushSubscriptionService.upsertSubscription(
      req.user.id,
      req.body,
      req.headers['user-agent'],
      req.body?.timezone,
    );

    return res.status(201).json({ subscription });
  } catch (err) {
    return next(err);
  }
}

async function unsubscribe(req, res, next) {
  try {
    const endpoint = req.body?.endpoint;
    await pushSubscriptionService.removeSubscription(req.user.id, endpoint);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function getPreferences(req, res, next) {
  try {
    const preferences = await pushSubscriptionService.getPreferences(req.user.id);
    const subscriptions = await pushSubscriptionService.getSubscriptionsForUser(req.user.id);
    return res.json({
      preferences,
      subscribed: subscriptions.length > 0,
      pushEnabled: webPushService.isEnabled(),
    });
  } catch (err) {
    return next(err);
  }
}

async function putPreferences(req, res, next) {
  try {
    const preferences = await pushSubscriptionService.updatePreferences(req.user.id, req.body);
    return res.json({ preferences });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getVapidPublicKey,
  subscribe,
  unsubscribe,
  getPreferences,
  putPreferences,
};
