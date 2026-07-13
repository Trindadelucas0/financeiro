const financeService = require('../services/financeService');
const { buildMonthlyReport, enrichReportWithAi } = require('../services/reportService');
const { getPool } = require('../db/pool');
const emailService = require('../services/emailService');

function getReportPdfService() {
  return require('../services/reportPdfService');
}

function userId(req) {
  return req.user.id;
}

async function getUserEmailInfo(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT nome, email FROM users WHERE id = $1',
    [id],
  );
  return rows[0] || null;
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
    const result = await financeService.updateSettings(userId(req), req.body);
    const settings = result.settings || result;
    const movimento = result.movimento || null;
    return res.json({ settings, movimento });
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
    const result = await financeService.upsertPagamento(userId(req), req.body);
    const { settings, movimento, ...pagamento } = result;
    return res.json({ pagamento, settings: settings || null, movimento: movimento || null });
  } catch (err) {
    return next(err);
  }
}

async function postSaldoEntrada(req, res, next) {
  try {
    const result = await financeService.registrarEntradaSaldo(userId(req), req.body);
    return res.json({
      settings: result.settings,
      movimento: result.movimento || null,
    });
  } catch (err) {
    return next(err);
  }
}

async function getSaldoMovimentos(req, res, next) {
  try {
    const movimentos = await financeService.listSaldoMovimentos(userId(req), {
      mes: req.query.mes,
      limit: req.query.limit,
    });
    return res.json({ movimentos });
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
    const uid = userId(req);
    const mes = req.query.mes || financeService.monthKeyOf(new Date());
    const report = await buildMonthlyReport(uid, mes);
    await enrichReportWithAi(report, uid);
    const pdf = await getReportPdfService().generateMonthlyReportPdf(report);

    let emailSent = false;
    let emailError = '';
    const today = new Date().toISOString().slice(0, 10);
    const dedupKey = `report-ondemand:${mes}:${today}`;

    try {
      const userRow = await getUserEmailInfo(uid);
      if (!userRow || !userRow.email) {
        emailError = 'E-mail do usuário não encontrado';
      } else {
        const pool = getPool();
        const { rows: existing } = await pool.query(
          `SELECT 1 FROM email_log WHERE user_id = $1 AND dedup_key = $2 LIMIT 1`,
          [uid, dedupKey],
        );

        if (existing.length > 0) {
          emailSent = true;
          emailError = '';
        } else {
          await emailService.sendReportPdfEmail({
            to: userRow.email,
            nome: userRow.nome || report.userName,
            mes,
            mesLabel: report.mesLabel,
            pdfBuffer: pdf,
          });
          await pool.query(
            `INSERT INTO email_log (user_id, template, dedup_key)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, dedup_key) DO NOTHING`,
            [uid, 'reportOnDemand', dedupKey],
          );
          emailSent = true;
        }
      }
    } catch (err) {
      emailSent = false;
      emailError = err.message || 'Falha ao enviar e-mail';
      console.error('[email] Falha ao enviar relatório PDF:', emailError);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-financeiro-${mes}.pdf"`);
    res.setHeader('X-Email-Sent', emailSent ? 'true' : 'false');
    if (emailError) {
      res.setHeader('X-Email-Error', encodeURIComponent(emailError.slice(0, 180)));
    }
    res.setHeader('Access-Control-Expose-Headers', 'X-Email-Sent, X-Email-Error');
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
  postSaldoEntrada,
  getSaldoMovimentos,
  getOrcamentos,
  putOrcamentos,
  getDashboard,
  getPrevisao,
  exportPdf,
};
