const express = require('express');
const paymentController = require('../controllers/paymentController');
const { authJwt } = require('../middleware/authJwt');

const router = express.Router();

router.get('/subscription', authJwt, paymentController.getStatus);
router.post('/checkout', authJwt, paymentController.createCheckout);
router.post('/confirm', authJwt, paymentController.confirmPayment);
router.post('/webhook', paymentController.webhook);

module.exports = router;
