const express = require('express');
const pushController = require('../controllers/pushController');
const { authJwt } = require('../middleware/authJwt');
const { requirePro } = require('../middleware/requirePro');

const router = express.Router();

router.use(authJwt, requirePro);

router.get('/vapid-public-key', pushController.getVapidPublicKey);
router.post('/subscribe', pushController.subscribe);
router.delete('/unsubscribe', pushController.unsubscribe);
router.get('/preferences', pushController.getPreferences);
router.put('/preferences', pushController.putPreferences);

module.exports = router;
