const express = require('express');
const authController = require('../controllers/authController');
const { authJwt } = require('../middleware/authJwt');
const { createRateLimit } = require('../utils/rateLimit');

const router = express.Router();

const loginLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

const verifyPasswordLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas. Aguarde um minuto e tente novamente.' },
});

router.post('/login', loginLimiter, authController.login);
router.post('/verify-password', authJwt, verifyPasswordLimiter, authController.verifyPassword);
router.get('/me', authJwt, authController.me);
router.get('/username-available', authJwt, authController.checkUsername);
router.patch('/me', authJwt, authController.patchMe);
router.patch('/me/password', authJwt, authController.patchPassword);
router.patch('/me/password-required', authJwt, authController.patchPasswordRequired);

module.exports = router;
