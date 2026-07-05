const express = require('express');
const rateLimit = require('express-rate-limit');
const profileController = require('../controllers/profileController');
const { authJwt } = require('../middleware/authJwt');

const router = express.Router();

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de envios atingido. Tente novamente em alguns minutos.' },
});

router.post('/', authJwt, feedbackLimiter, profileController.createFeedback);

module.exports = router;
