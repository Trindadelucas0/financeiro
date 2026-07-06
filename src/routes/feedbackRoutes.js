const express = require('express');
const profileController = require('../controllers/profileController');
const { authJwt } = require('../middleware/authJwt');
const { requirePro } = require('../middleware/requirePro');
const { createRateLimit } = require('../utils/rateLimit');

const router = express.Router();

const feedbackLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Limite de envios atingido. Tente novamente em alguns minutos.' },
});

router.post('/', authJwt, requirePro, feedbackLimiter, profileController.createFeedback);

module.exports = router;
