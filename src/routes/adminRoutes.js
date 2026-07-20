const express = require('express');
const adminController = require('../controllers/adminController');
const { authJwt } = require('../middleware/authJwt');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

router.use(authJwt, requireAdmin);

router.post('/users', adminController.createUser);
router.get('/users', adminController.listUsers);
router.patch('/users/:id', adminController.patchUser);
router.get('/clients', adminController.listClients);
router.post('/clients', adminController.createClient);
router.post('/clients/:id/payments', adminController.registerClientPayment);
router.get('/site-signups', adminController.listSiteSignups);
router.post('/site-signups/:id/payments', adminController.registerSiteSignupPayment);
router.get('/feedback', adminController.listFeedback);
router.patch('/feedback/:id', adminController.patchFeedback);

module.exports = router;
