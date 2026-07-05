const express = require('express');
const adminController = require('../controllers/adminController');
const { authJwt } = require('../middleware/authJwt');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

router.use(authJwt, requireAdmin);

router.post('/users', adminController.createUser);
router.get('/users', adminController.listUsers);
router.patch('/users/:id', adminController.patchUser);

module.exports = router;
