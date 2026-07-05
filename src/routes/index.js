const express = require('express');
const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const financeRoutes = require('./financeRoutes');
const pageRoutes = require('./pageRoutes');

const router = express.Router();

router.use('/', pageRoutes);
router.use('/api/auth', authRoutes);
router.use('/api/admin', adminRoutes);
router.use('/api/finance', financeRoutes);

module.exports = router;
