const express = require('express');
const paymentController = require('../controllers/paymentController');
const { authJwt } = require('../middleware/authJwt');
const { createRateLimit } = require('../utils/rateLimit');

const router = express.Router();

const guestCheckoutLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas de checkout. Tente novamente em alguns minutos.' },
});

const welcomeLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Muitas consultas. Tente novamente em alguns minutos.' },
});

router.get('/subscription', authJwt, paymentController.getStatus);
router.post('/checkout', authJwt, paymentController.createCheckout);
router.post('/guest-checkout', guestCheckoutLimiter, paymentController.guestCheckout);
router.get('/welcome', welcomeLimiter, paymentController.welcomeCredentials);
router.post('/confirm', authJwt, paymentController.confirmPayment);
router.post('/webhook', paymentController.webhook);

module.exports = router;
