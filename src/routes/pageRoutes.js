const express = require('express');
const pageController = require('../controllers/pageController');

const router = express.Router();

router.get('/', pageController.landingPage);
router.get('/login', pageController.loginPage);

router.get('/app', pageController.redirectApp);
router.get('/app/dashboard', pageController.appDashboard);
router.get('/app/receitas', pageController.appReceitas);
router.get('/app/despesas', pageController.appDespesas);
router.get('/app/compromissos', pageController.appCompromissos);
router.get('/app/orcamentos', pageController.appOrcamentos);
router.get('/app/previsao', pageController.appPrevisao);
router.get('/app/perfil', pageController.appPerfil);

router.get('/admin/users', pageController.adminUsers);
router.get('/admin/clients', pageController.adminClients);

module.exports = router;
