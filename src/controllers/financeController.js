const financeService = require('../services/financeService');
const reportPdfService = require('../services/reportPdfService');

function userId(req) {
  return req.user.id;
}

async function getSettings(req, res, next) {
  try {
    const settings = await financeService.getSettings(userId(req));
    return res.json({ settings });
  } catch (err) {
    return next(err);
  }
}

async function putSettings(req, res, next) {
  try {
    const settings = await financeService.updateSettings(userId(req), req.body);
    return res.json({ settings });
  } catch (err) {
    return next(err);
  }
}

async function listReceitas(req, res, next) {
  try {
    const receitas = await financeService.listReceitas(userId(req), req.query.mes);
    return res.json({ receitas });
  } catch (err) {
    return next(err);
  }
}

async function createReceita(req, res, next) {
  try {
    const receita = await financeService.createReceita(userId(req), req.body);
    return res.status(201).json({ receita });
  } catch (err) {
    return next(err);
  }
}

async function patchReceita(req, res, next) {
  try {
    const receita = await financeService.updateReceita(userId(req), req.params.id, req.body);
    return res.json({ receita });
  } catch (err) {
    return next(err);
  }
}

async function deleteReceita(req, res, next) {
  try {
    await financeService.deleteReceita(userId(req), req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function listDespesas(req, res, next) {
  try {
    const despesas = await financeService.listDespesas(userId(req), req.query.mes);
    return res.json({ despesas });
  } catch (err) {
    return next(err);
  }
}

async function createDespesa(req, res, next) {
  try {
    const despesa = await financeService.createDespesa(userId(req), req.body);
    return res.status(201).json({ despesa });
  } catch (err) {
    return next(err);
  }
}

async function patchDespesa(req, res, next) {
  try {
    const despesa = await financeService.updateDespesa(userId(req), req.params.id, req.body);
    return res.json({ despesa });
  } catch (err) {
    return next(err);
  }
}

async function deleteDespesa(req, res, next) {
  try {
    await financeService.deleteDespesa(userId(req), req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function listEmprestimos(req, res, next) {
  try {
    const emprestimos = await financeService.listEmprestimos(userId(req));
    return res.json({ emprestimos });
  } catch (err) {
    return next(err);
  }
}

async function createEmprestimo(req, res, next) {
  try {
    const emprestimo = await financeService.createEmprestimo(userId(req), req.body);
    return res.status(201).json({ emprestimo });
  } catch (err) {
    return next(err);
  }
}

async function patchEmprestimo(req, res, next) {
  try {
    const emprestimo = await financeService.updateEmprestimo(userId(req), req.params.id, req.body);
    return res.json({ emprestimo });
  } catch (err) {
    return next(err);
  }
}

async function deleteEmprestimo(req, res, next) {
  try {
    await financeService.deleteEmprestimo(userId(req), req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function listPagamentos(req, res, next) {
  try {
    const pagamentos = await financeService.listPagamentos(userId(req), req.query.mes);
    return res.json({ pagamentos });
  } catch (err) {
    return next(err);
  }
}

async function upsertPagamento(req, res, next) {
  try {
    const pagamento = await financeService.upsertPagamento(userId(req), req.body);
    return res.json({ pagamento });
  } catch (err) {
    return next(err);
  }
}

async function getOrcamentos(req, res, next) {
  try {
    const orcamentos = await financeService.getOrcamentos(userId(req));
    return res.json({ orcamentos });
  } catch (err) {
    return next(err);
  }
}

async function putOrcamentos(req, res, next) {
  try {
    const orcamentos = await financeService.updateOrcamentos(userId(req), req.body.orcamentos);
    return res.json({ orcamentos });
  } catch (err) {
    return next(err);
  }
}

async function getDashboard(req, res, next) {
  try {
    const dashboard = await financeService.getDashboard(userId(req), req.query.mes);
    return res.json({ dashboard });
  } catch (err) {
    return next(err);
  }
}

async function getPrevisao(req, res, next) {
  try {
    const previsao = await financeService.getPrevisao(userId(req), {
      mes: req.query.mes,
      meses: req.query.meses,
    });
    return res.json({ previsao });
  } catch (err) {
    return next(err);
  }
}

async function exportPdf(req, res, next) {
  try {
    const pdf = await reportPdfService.generateMonthlyReportPdf(userId(req), req.query.mes);
    const mes = req.query.mes || financeService.monthKeyOf(new Date());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-financeiro-${mes}.pdf"`);
    return res.send(pdf);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSettings,
  putSettings,
  listReceitas,
  createReceita,
  patchReceita,
  deleteReceita,
  listDespesas,
  createDespesa,
  patchDespesa,
  deleteDespesa,
  listEmprestimos,
  createEmprestimo,
  patchEmprestimo,
  deleteEmprestimo,
  listPagamentos,
  upsertPagamento,
  getOrcamentos,
  putOrcamentos,
  getDashboard,
  getPrevisao,
  exportPdf,
};
