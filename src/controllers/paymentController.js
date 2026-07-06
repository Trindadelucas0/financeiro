const subscriptionService = require('../services/subscriptionService');
const infinitePayService = require('../services/infinitePayService');
const { getProPlanPricing } = require('../config/plan');

async function getStatus(req, res, next) {
  try {
    const subscription = await subscriptionService.getSubscription(req.user.id);
    return res.json({ subscription, pricing: getProPlanPricing() });
  } catch (err) {
    return next(err);
  }
}

async function createCheckout(req, res, next) {
  try {
    const user = await subscriptionService.getUserPaymentContext(req.user.id);
    const session = await infinitePayService.createCheckoutLink(user);
    return res.json(session);
  } catch (err) {
    return next(err);
  }
}

async function confirmPayment(req, res, next) {
  try {
    const { order_nsu: orderNsu, transaction_nsu: transactionNsu, slug } = req.body;

    if (!orderNsu) {
      return res.status(400).json({ error: 'order_nsu é obrigatório' });
    }

    const result = await infinitePayService.fulfillOrder({
      orderNsu,
      transactionNsu,
      slug,
    });

    return res.json({
      ok: true,
      alreadyPaid: result.alreadyPaid,
      subscription: result.subscription,
      pricing: getProPlanPricing(),
    });
  } catch (err) {
    return next(err);
  }
}

async function webhook(req, res, next) {
  try {
    await infinitePayService.handleWebhook(req.body);
    return res.status(200).json({ received: true });
  } catch (err) {
    if (err.status === 402) {
      return res.status(200).json({ received: true, pending: true });
    }
    return next(err);
  }
}

module.exports = {
  getStatus,
  createCheckout,
  confirmPayment,
  webhook,
};
