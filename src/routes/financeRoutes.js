const express = require('express');
const financeController = require('../controllers/financeController');
const { authJwt } = require('../middleware/authJwt');

const router = express.Router();

router.use(authJwt);

router.get('/settings', financeController.getSettings);
router.put('/settings', financeController.putSettings);

router.get('/receitas', financeController.listReceitas);
router.post('/receitas', financeController.createReceita);
router.patch('/receitas/:id', financeController.patchReceita);
router.delete('/receitas/:id', financeController.deleteReceita);

router.get('/despesas', financeController.listDespesas);
router.post('/despesas', financeController.createDespesa);
router.patch('/despesas/:id', financeController.patchDespesa);
router.delete('/despesas/:id', financeController.deleteDespesa);

router.get('/emprestimos', financeController.listEmprestimos);
router.post('/emprestimos', financeController.createEmprestimo);
router.patch('/emprestimos/:id', financeController.patchEmprestimo);
router.delete('/emprestimos/:id', financeController.deleteEmprestimo);

router.get('/pagamentos', financeController.listPagamentos);
router.post('/pagamentos', financeController.upsertPagamento);

router.get('/orcamentos', financeController.getOrcamentos);
router.put('/orcamentos', financeController.putOrcamentos);

router.get('/dashboard', financeController.getDashboard);
router.get('/previsao', financeController.getPrevisao);
router.get('/export/csv', financeController.exportCsv);

module.exports = router;
