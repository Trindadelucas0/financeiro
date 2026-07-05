const express = require('express');
const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const financeRoutes = require('./financeRoutes');
const feedbackRoutes = require('./feedbackRoutes');
const pageRoutes = require('./pageRoutes');
const pageController = require('../controllers/pageController');

const router = express.Router();

router.use('/', pageRoutes);
router.use('/api/auth', authRoutes);
router.use('/api/admin', adminRoutes);
router.use('/api/finance', financeRoutes);
router.use('/api/feedback', feedbackRoutes);

router.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Rota não encontrada' });
  }
  pageController.notFoundPage(req, res);
});

module.exports = router;
