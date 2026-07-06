const subscriptionService = require('../services/subscriptionService');

async function requirePro(req, res, next) {
  try {
    const isPro = await subscriptionService.isProUser(req.user.id);
    if (!isPro) {
      return res.status(402).json({
        error: 'Assinatura expirada ou inativa',
        code: 'SUBSCRIPTION_REQUIRED',
        upgradeUrl: '/app/perfil',
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requirePro };
