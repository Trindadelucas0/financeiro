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

router.post('/login', loginLimiter, authController.login);
router.get('/me', authJwt, authController.me);
router.get('/username-available', authJwt, authController.checkUsername);
router.patch('/me', authJwt, authController.patchMe);
router.patch('/me/password', authJwt, authController.patchPassword);

module.exports = router;
