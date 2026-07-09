const financeService = require('./financeService');
const { getOrCreateAiInsights } = require('./geminiReportService');
const { getPool } = require('../db/pool');

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function monthLabelLong(m) {
  const [y, mm] = m.split('-').map(Number);
  return `${MESES_PT[mm - 1]} de ${y}`;
}

function formatBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildImprovements({
  saldo, receitasTotal, alerts, atrasados, categorias, forecast, saldoDevedor, pctPago,
}) {
  const items = [];

  alerts.forEach((a) => {
    items.push({ type: a.level === 'danger' ? 'alerta' : 'atencao', text: a.text });
  });

  if (atrasados.length > 0) {
    const totalAtraso = atrasados.reduce((s, a) => s + a.valor, 0);
    items.push({
      type: 'alerta',
      text: `${atrasados.length} pagamento(s) em atraso totalizando ${formatBRL(totalAtraso)} — regularize antes de novos gastos.`,
    });
  }

  categorias.filter((c) => c.overBudget).forEach((c) => {
    items.push({
      type: 'alerta',
      text: `Categoria ${c.categoria} estourou o orçamento (${formatBRL(c.valor)} de ${formatBRL(c.orcamento)}).`,
    });
  });

  if (saldo < 0) {
    items.push({
      type: 'alerta',
      text: `Fechamento negativo de ${formatBRL(Math.abs(saldo))} — revise despesas variáveis e adie compras não essenciais.`,
    });
  } else if (receitasTotal > 0 && saldo / receitasTotal < 0.15) {
    items.push({
      type: 'atencao',
      text: 'Sobra mensal abaixo de 15% da receita — margem frágil para imprevistos.',
    });
  }

  if (pctPago < 100 && receitasTotal >= 0) {
    items.push({
      type: 'atencao',
      text: `Apenas ${pctPago.toFixed(0)}% das despesas do mês foram marcadas como pagas.`,
    });
  }

  if (saldoDevedor > 0) {
    items.push({
      type: 'atencao',
      text: `Compromissos futuros (parcelas/empréstimos) somam cerca de ${formatBRL(saldoDevedor)}.`,
    });
  }

  const negativeMonths = forecast.filter((f) => f.saldo < 0);
  if (negativeMonths.length > 0) {
    items.push({
      type: 'atencao',
      text: `${negativeMonths.length} dos próximos ${forecast.length} meses projetam saldo negativo.`,
    });
  }

  if (items.length === 0) {
    items.push({
      type: 'ok',
      text: 'Mês equilibrado — mantenha o registro em dia e revise orçamentos por categoria.',
    });
  }

  return items;
}

function buildOrganizationAdvice({
  saldo, receitasTotal, atrasados, saldoDevedor, pctPago, forecast,
}) {
  const tips = [];

  tips.push('Registre receitas e despesas assim que ocorrerem — o relatório só reflete o que está cadastrado.');

  if (atrasados.length > 0) {
    tips.push('Priorize quitar pendências de meses anteriores antes de assumir novos compromissos.');
  }

  if (saldoDevedor > receitasTotal * 0.25 && receitasTotal > 0) {
    tips.push('Evite novas parcelas até reduzir o peso de dívidas existentes (meta: comprometer menos de 25% da receita).');
  }

  if (saldo >= 0 && receitasTotal > 0) {
    const reserva = Math.max(saldo * 0.2, receitasTotal * 0.1);
    tips.push(`Separe ${formatBRL(reserva)} para reserva/emergência antes de gastos discricionários.`);
  } else if (saldo < 0) {
    tips.push('Liste despesas fixas vs variáveis e corte primeiro os gastos variáveis não essenciais.');
  }

  tips.push('Defina teto por categoria em Orçamentos e acompanhe no dashboard a cada semana.');

  if (pctPago < 100) {
    tips.push('Marque pagamentos no app conforme forem quitados — isso evita surpresas no fim do mês.');
  }

  const avgForecast = forecast.length
    ? forecast.reduce((s, f) => s + f.saldo, 0) / forecast.length
    : 0;
  if (avgForecast < 0) {
    tips.push('Projeção média negativa nos próximos meses — antecipe receitas ou renegocie despesas fixas.');
  } else {
    tips.push('Use a aba Previsão para simular meses futuros antes de fechar parcelamentos longos.');
  }

  tips.push('Revise este relatório no início de cada mês e ajuste metas com base nos números reais.');

  return tips.slice(0, 7);
}

function buildFallbackExecutiveSummary(report) {
  const k = report.kpis;
  const carryNote = k.saldo.carryOver > 0
    ? ` (inclui ${formatBRL(k.saldo.carryOver)} do mês anterior)`
    : '';
  const saldoTxt = k.saldo.positivo
    ? `saldo positivo de ${formatBRL(k.saldo.total)}${carryNote}`
    : `déficit de ${formatBRL(Math.abs(k.saldo.total))}${carryNote}`;
  return `Em ${report.mesLabel}, receitas de ${formatBRL(k.receitas.total)} e despesas de ${formatBRL(k.despesas.total)} resultaram em ${saldoTxt}. ${report.pagamentos.pctPago.toFixed(0)}% das despesas foram quitadas no período.`;
}

async function enrichReportWithAi(report, userId) {
  const insights = await getOrCreateAiInsights(userId, report.mes, report);
  if (insights) {
    report.aiInsights = insights;
    report.aiEnabled = true;
    return report;
  }
  report.aiEnabled = false;
  report.aiInsights = {
    resumoExecutivo: buildFallbackExecutiveSummary(report),
    pontosAtencao: report.improvements.map((i) => i.text),
    planoAcao: report.advice,
    source: 'fallback',
    generatedAt: new Date().toISOString(),
    fromCache: false,
  };
  return report;
}

async function buildMonthlyReport(userId, mes) {
  const dashboard = await financeService.getDashboard(userId, mes);
  const previsao = await financeService.getPrevisao(userId, { mes: dashboard.mes, meses: 6 });
  const mesItems = await financeService.getMesItemsForReport(userId, dashboard.mes);
  const charts = await financeService.getReportCharts(userId, dashboard.mes);

  const pool = getPool();
  const { rows: userRows } = await pool.query('SELECT nome FROM users WHERE id = $1', [userId]);
  const userName = userRows[0]?.nome || 'Usuário';

  const kpis = dashboard.kpis;
  const saldo = kpis.saldo.total;
  const saldoFluxo = kpis.saldo.fluxo;

  const improvements = buildImprovements({
    saldo: saldoFluxo,
    receitasTotal: kpis.receitas.total,
    alerts: dashboard.alerts,
    atrasados: dashboard.atrasados,
    categorias: dashboard.categorias,
    forecast: dashboard.forecast,
    saldoDevedor: kpis.saldoDevedor.total,
    pctPago: dashboard.pagamentos.pctPago,
  });

  const advice = buildOrganizationAdvice({
    saldo: saldoFluxo,
    receitasTotal: kpis.receitas.total,
    atrasados: dashboard.atrasados,
    saldoDevedor: kpis.saldoDevedor.total,
    pctPago: dashboard.pagamentos.pctPago,
    forecast: dashboard.forecast,
  });

  return {
    userName,
    mes: dashboard.mes,
    mesLabel: monthLabelLong(dashboard.mes),
    generatedAt: new Date(),
    kpis,
    pagamentos: dashboard.pagamentos,
    receitasItens: mesItems.receitasItens,
    despesasItens: mesItems.despesasItens,
    categorias: dashboard.categorias,
    improvements,
    advice,
    forecast: dashboard.forecast,
    previsao: previsao.rows,
    atrasados: dashboard.atrasados,
    saldoConta: mesItems.settings.saldoConta,
    alerts: dashboard.alerts,
    vencimentosProximos: dashboard.vencimentosProximos,
    orcamentos: dashboard.orcamentos,
    charts,
  };
}

module.exports = {
  buildMonthlyReport,
  enrichReportWithAi,
  formatBRL,
  monthLabelLong,
};
