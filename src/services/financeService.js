const { getPool } = require('../db/pool');
const authService = require('./authService');
const {
  valorParcelaSimples,
  valorParcelaEmprestimo,
  somaParcelasRestantes,
  vencimentoNoMes,
} = require('../utils/parcelMath');

/* ============ DATE UTILS ============ */

function monthKeyOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(monthStr, n) {
  const [y, m] = monthStr.split('-').map(Number);
  return monthKeyOf(new Date(y, m - 1 + n, 1));
}

function diffMonths(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

function monthLabelShort(m) {
  const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const [y, mm] = m.split('-').map(Number);
  return `${MESES_PT[mm - 1].slice(0, 3)}/${String(y).slice(2)}`;
}

function pctDelta(curr, prev) {
  if (prev === 0 && curr === 0) return { text: 'sem variação', cls: 'neutral', pct: 0 };
  if (prev === 0) return { text: 'novo este mês', cls: 'up', pct: 100 };
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  const sign = pct >= 0 ? '+' : '';
  return {
    text: `${sign}${pct.toFixed(1)}% vs mês anterior`,
    cls: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral',
    pct,
  };
}

/* ============ ROW MAPPERS ============ */

function mapReceita(row) {
  return {
    id: row.id,
    nome: row.nome,
    tipo: row.tipo,
    valor: Number(row.valor),
    categoria: row.categoria,
    mesInicio: row.mes_inicio,
    duracaoMeses: row.duracao_meses != null ? Number(row.duracao_meses) : null,
  };
}

function mapDespesa(row) {
  return {
    id: row.id,
    nome: row.nome,
    tipo: row.tipo,
    formaPagamento: row.forma_pagamento,
    valor: row.valor != null ? Number(row.valor) : null,
    valorTotal: row.valor_total != null ? Number(row.valor_total) : null,
    numParcelas: row.num_parcelas != null ? Number(row.num_parcelas) : null,
    categoria: row.categoria,
    mesInicio: row.mes_inicio,
    duracaoMeses: row.duracao_meses != null ? Number(row.duracao_meses) : null,
    diaVencimento: row.dia_vencimento != null ? Number(row.dia_vencimento) : null,
  };
}

function mapEmprestimo(row) {
  return {
    id: row.id,
    nome: row.nome,
    valorTotal: Number(row.valor_total),
    juros: Number(row.juros),
    numParcelas: Number(row.num_parcelas),
    mesInicio: row.mes_inicio,
    categoria: row.categoria || 'Empréstimo',
    diaVencimento: row.dia_vencimento != null ? Number(row.dia_vencimento) : null,
  };
}

function mapPagamento(row) {
  return {
    id: row.id,
    entidade: row.entidade,
    itemId: row.item_id,
    mes: row.mes,
    pago: row.pago,
    dataHora: row.data_hora,
    comprovanteNome: row.comprovante_nome,
    comprovanteDataUrl: row.comprovante_data,
    valorEfetivo: row.valor_efetivo != null ? Number(row.valor_efetivo) : null,
  };
}

function chavePg(entidade, id, mes) {
  return `${entidade}_${id}_${mes}`;
}

function pagamentosToMap(rows) {
  const map = {};
  rows.forEach((row) => {
    const pg = mapPagamento(row);
    const key = chavePg(pg.entidade, pg.itemId, pg.mes);
    map[key] = {
      pago: pg.pago,
      dataHora: pg.dataHora,
      comprovanteNome: pg.comprovanteNome,
      comprovanteDataUrl: pg.comprovanteDataUrl,
    };
  });
  return map;
}

function getPg(pagamentosMap, entidade, id, mes) {
  return pagamentosMap[chavePg(entidade, id, mes)] || { pago: false };
}

/* ============ BUSINESS RULES (portadas de js/app.js) ============ */

function receitaAtivaNoMes(r, mes) {
  if (r.tipo === 'variavel') return r.mesInicio === mes;
  const d = diffMonths(r.mesInicio, mes);
  if (d < 0) return false;
  if (r.duracaoMeses && d >= r.duracaoMeses) return false;
  return true;
}

function despesaAtivaNoMes(d, mes) {
  if (d.tipo === 'fixa') {
    const diff = diffMonths(d.mesInicio, mes);
    if (diff < 0) return false;
    if (d.duracaoMeses && diff >= d.duracaoMeses) return false;
    return true;
  }
  if (d.formaPagamento === 'avista') return d.mesInicio === mes;
  const diff = diffMonths(d.mesInicio, mes);
  return diff >= 0 && diff < d.numParcelas;
}

function estaAtivoParcela(item, mes) {
  const d = diffMonths(item.mesInicio, mes);
  return d >= 0 && d < item.numParcelas;
}

function parcelasRestantes(item, mes) {
  const d = diffMonths(item.mesInicio, mes);
  if (d < 0) return item.numParcelas;
  return Math.max(item.numParcelas - d, 0);
}

function valorEfetivoDespesa(d, mes) {
  return d.formaPagamento === 'parcelado' ? valorParcelaSimples(d, mes) : Number(d.valor);
}

function entidadeDoItemDespesa(d) {
  return d.tipo === 'emprestimo' ? 'emprestimo' : 'despesa';
}

function isAjusteSaldoLancamento(item) {
  if (!item || !item.nome) return false;
  return item.nome === 'Ajuste de saldo em conta' || item.nome === 'Entrada em conta';
}

function getReceitasMes(receitas, mes) {
  const itens = receitas
    .filter((r) => receitaAtivaNoMes(r, mes))
    .map((r) => ({ ...r, valorEfetivo: Number(r.valor) }));
  return { total: itens.reduce((s, r) => s + r.valorEfetivo, 0), itens };
}

function getDespesasMes(despesas, emprestimos, mes) {
  const desp = despesas
    .filter((d) => despesaAtivaNoMes(d, mes))
    .map((d) => ({ ...d, valorEfetivo: valorEfetivoDespesa(d, mes) }));
  const emp = emprestimos
    .filter((e) => estaAtivoParcela(e, mes))
    .map((e) => ({
      ...e,
      tipo: 'emprestimo',
      formaPagamento: 'parcelado',
      categoria: e.categoria || 'Empréstimo',
      valorEfetivo: valorParcelaEmprestimo(e, mes),
    }));
  const itens = [...desp, ...emp];
  return { total: itens.reduce((s, d) => s + d.valorEfetivo, 0), itens };
}

function totalSemAjusteSaldo(itens) {
  return (itens || [])
    .filter((item) => !isAjusteSaldoLancamento(item))
    .reduce((s, item) => s + Number(item.valorEfetivo || 0), 0);
}

function mapSettingsRow(s) {
  return {
    currentMonth: s.current_month,
    saldoConta: Number(s.saldo_conta),
    saldoContaAtualizadoEm: s.saldo_atualizado_em,
    saldoCarryOver: Number(s.saldo_carry_over) || 0,
    saldoCarryMes: s.saldo_carry_mes || null,
    lastRolloverMonth: s.last_rollover_month || null,
  };
}

function defaultSettings() {
  return {
    currentMonth: monthKeyOf(new Date()),
    saldoConta: 0,
    saldoContaAtualizadoEm: null,
    saldoCarryOver: 0,
    saldoCarryMes: null,
    lastRolloverMonth: null,
  };
}

function isValidMonthKey(mes) {
  if (!mes || typeof mes !== 'string') return false;
  if (!/^\d{4}-\d{2}$/.test(mes)) return false;
  const mm = Number(mes.slice(5, 7));
  return mm >= 1 && mm <= 12;
}

function assertValidMonthKey(mes) {
  if (!isValidMonthKey(mes)) {
    const err = new Error('Mês inválido. Use o formato YYYY-MM.');
    err.status = 400;
    throw err;
  }
}

function getSaldoFluxoMes(receitas, despesas, emprestimos, mes) {
  const r = getReceitasMes(receitas, mes);
  const d = getDespesasMes(despesas, emprestimos, mes);
  return { total: r.total - d.total, receitas: r, despesas: d };
}

function getSaldoMesAjustado(receitas, despesas, emprestimos, mes, settings) {
  const { total: fluxo } = getSaldoFluxoMes(receitas, despesas, emprestimos, mes);
  const carryOver = settings.saldoCarryMes === mes ? (Number(settings.saldoCarryOver) || 0) : 0;
  const hasSaldoConta = Boolean(settings && settings.saldoContaAtualizadoEm);
  const mesAoVivo = monthKeyOf(new Date());

  // Com carteira informada no mês atual: Saldo do mês = saldo em conta (mesmo valor).
  if (hasSaldoConta && mes === mesAoVivo) {
    return {
      fluxo,
      carryOver,
      total: Number(settings.saldoConta) || 0,
      usaSaldoConta: true,
    };
  }

  return { fluxo, carryOver, total: fluxo + carryOver, usaSaldoConta: false };
}

function computeCarryOnRollover(data, settings, mesReal) {
  // Soma sobras positivas de cada mês fechado entre last_rollover+1 e mesReal-1.
  // Déficits não reduzem o carry. Sem last_rollover: só o mês imediatamente anterior.
  const hasSaldoConta = Boolean(settings.saldoContaAtualizadoEm) && Number(settings.saldoConta) > 0;
  if (!hasSaldoConta) {
    return { saldoCarryOver: 0, saldoCarryMes: null };
  }

  const lastRollover = settings.lastRolloverMonth;
  const months = [];
  if (!lastRollover) {
    months.push(addMonths(mesReal, -1));
  } else {
    let cursor = addMonths(lastRollover, 1);
    while (cursor <= addMonths(mesReal, -1)) {
      months.push(cursor);
      cursor = addMonths(cursor, 1);
    }
  }

  let soma = 0;
  months.forEach((mes) => {
    const { total: fluxo } = getSaldoFluxoMes(
      data.receitas,
      data.despesas,
      data.emprestimos,
      mes,
    );
    if (fluxo > 0) soma += fluxo;
  });

  if (soma > 0) {
    return { saldoCarryOver: soma, saldoCarryMes: mesReal };
  }
  return { saldoCarryOver: 0, saldoCarryMes: null };
}

function getCategoriaBreakdown(itens) {
  const map = {};
  itens.forEach((d) => {
    const c = d.categoria || 'Outros';
    map[c] = (map[c] || 0) + d.valorEfetivo;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function getSaldoDevedorTotal(despesas, emprestimos, currentMonth) {
  const p1 = despesas
    .filter((d) => d.formaPagamento === 'parcelado')
    .reduce((s, d) => s + somaParcelasRestantes(d, currentMonth, d.valorTotal), 0);
  const p2 = emprestimos.reduce(
    (s, e) => s + somaParcelasRestantes(e, currentMonth, e.valorTotal * (1 + (e.juros || 0) / 100)),
    0,
  );
  return p1 + p2;
}

function getVencimentosProximos(despesas, emprestimos, pagamentosMap, mes) {
  const hoje = new Date();
  const [y, mm] = mes.split('-').map(Number);
  const out = [];
  getDespesasMes(despesas, emprestimos, mes).itens.forEach((d) => {
    if (!d.diaVencimento) return;
    const venc = vencimentoNoMes(y, mm, d.diaVencimento);
    const diff = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff <= 5) {
      const ent = entidadeDoItemDespesa(d);
      const chave = chavePg(ent, d.id, mes);
      if (!getPg(pagamentosMap, ent, d.id, mes).pago) {
        out.push({ nome: d.nome, valor: d.valorEfetivo, diff, chave, entidade: ent, itemId: d.id, mes });
      }
    }
  });
  return out.sort((a, b) => a.diff - b.diff);
}

function buildAtrasados(despesas, emprestimos, pagamentosMap, currentMonth) {
  const out = [];
  for (let i = 12; i >= 1; i--) {
    const mes = addMonths(currentMonth, -i);
    getDespesasMes(despesas, emprestimos, mes).itens.forEach((d) => {
      const ent = entidadeDoItemDespesa(d);
      const chave = chavePg(ent, d.id, mes);
      if (!getPg(pagamentosMap, ent, d.id, mes).pago) {
        out.push({ nome: d.nome, mes, valor: d.valorEfetivo, chave, mesLabel: monthLabelShort(mes) });
      }
    });
  }
  return out;
}

function buildAlerts(receitas, despesas, orcamentos) {
  const alerts = [];
  if (despesas.total === 0 && receitas.total === 0) return alerts;
  const saldo = receitas.total - despesas.total;
  if (saldo < 0) {
    alerts.push({
      level: 'danger',
      icon: '⚠',
      text: `Déficit de R$ ${Math.abs(saldo).toFixed(2)} — despesas superam receitas.`,
    });
  } else if (receitas.total > 0 && saldo / receitas.total < 0.1) {
    alerts.push({ level: '', icon: '⚡', text: 'Margem apertada: sobra menos de 10% da receita.' });
  }

  Object.entries(orcamentos).forEach(([cat, lim]) => {
    if (!lim) return;
    const gasto = despesas.itens.filter((d) => d.categoria === cat).reduce((s, d) => s + d.valorEfetivo, 0);
    if (gasto > lim) {
      alerts.push({
        level: 'danger',
        icon: '💸',
        text: `${cat}: R$ ${gasto.toFixed(2)} ultrapassou o orçamento de R$ ${Number(lim).toFixed(2)}.`,
      });
    } else if (gasto > lim * 0.85) {
      alerts.push({
        level: '',
        icon: '📊',
        text: `${cat}: ${((gasto / lim) * 100).toFixed(0)}% do orçamento mensal usado.`,
      });
    }
  });

  const variaveis = despesas.itens
    .filter((d) => d.tipo === 'variavel' && d.formaPagamento === 'avista')
    .reduce((s, d) => s + d.valorEfetivo, 0);
  if (despesas.total > 0 && variaveis / despesas.total > 0.4) {
    alerts.push({
      level: '',
      icon: '📊',
      text: `Gastos variáveis à vista são ${((variaveis / despesas.total) * 100).toFixed(0)}% das despesas.`,
    });
  }

  const comprometido = despesas.itens
    .filter((d) => d.formaPagamento === 'parcelado' || d.tipo === 'emprestimo')
    .reduce((s, d) => s + d.valorEfetivo, 0);
  if (receitas.total > 0 && comprometido / receitas.total > 0.3) {
    alerts.push({
      level: 'danger',
      icon: '🔒',
      text: `${((comprometido / receitas.total) * 100).toFixed(0)}% da receita comprometida com parcelas/empréstimos.`,
    });
  }

  return alerts;
}

function buildForecastStrip(despesas, emprestimos, receitas, currentMonth, n = 6, settings = null) {
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const mes = addMonths(currentMonth, i);
    const rec = getReceitasMes(receitas, mes);
    const desp = getDespesasMes(despesas, emprestimos, mes);
    const r = rec.total;
    const d = desp.total;
    const fluxo = r - d;
    const carryOver = settings && settings.saldoCarryMes === mes
      ? (Number(settings.saldoCarryOver) || 0)
      : 0;
    const saldo = fluxo + carryOver;
    nodes.push({ mes, mesLabel: monthLabelShort(mes), receitas: r, despesas: d, saldo, fluxo, carryOver });
  }
  return nodes;
}

function buildPrevisao(despesas, emprestimos, receitas, startMonth, meses = 12, settings = null) {
  const hasSaldoConta = settings && settings.saldoContaAtualizadoEm;
  let cumulativo = hasSaldoConta ? Number(settings.saldoConta) || 0 : 0;
  const rows = [];
  for (let i = 0; i < meses; i++) {
    const mes = addMonths(startMonth, i);
    const rec = getReceitasMes(receitas, mes);
    const desp = getDespesasMes(despesas, emprestimos, mes);
    const r = rec.total;
    const d = desp.total;
    const fluxo = r - d;
    // Ajuste de saldo já está embutido em saldoConta — não soma de novo no acumulado.
    const fluxoSemAjuste =
      totalSemAjusteSaldo(rec.itens) - totalSemAjusteSaldo(desp.itens);
    const carryOver = settings && settings.saldoCarryMes === mes
      ? (Number(settings.saldoCarryOver) || 0)
      : 0;
    const saldo = fluxo + carryOver;
    cumulativo += hasSaldoConta ? fluxoSemAjuste : fluxo;
    rows.push({ mes, receitas: r, despesas: d, saldo, fluxo, carryOver, cumulativo });
  }
  return rows;
}

/* ============ DATA LOADING ============ */

async function loadUserFinanceData(userId) {
  const pool = getPool();

  const [receitasRes, despesasRes, emprestimosRes, pagamentosRes, orcamentosRes, settingsRes] =
    await Promise.all([
      pool.query('SELECT * FROM receitas WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT * FROM despesas WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT * FROM emprestimos WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT * FROM pagamentos WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM orcamentos WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]),
    ]);

  const receitas = receitasRes.rows.map(mapReceita);
  const despesas = despesasRes.rows.map(mapDespesa);
  const emprestimos = emprestimosRes.rows.map(mapEmprestimo);
  const pagamentos = pagamentosToMap(pagamentosRes.rows);

  const orcamentos = {};
  orcamentosRes.rows.forEach((row) => {
    orcamentos[row.categoria] = Number(row.limite_mensal);
  });

  let settings = defaultSettings();

  if (settingsRes.rows.length > 0) {
    settings = mapSettingsRow(settingsRes.rows[0]);
  }

  return { receitas, despesas, emprestimos, pagamentos, orcamentos, settings };
}

async function ensureSettings(userId) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO user_settings (user_id, current_month, saldo_conta)
     VALUES ($1, to_char(NOW(), 'YYYY-MM'), 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

/* ============ SETTINGS ============ */

/**
 * Aplica carry na virada do calendário sem impedir navegação para meses passados.
 * Atualiza last_rollover_month + carry; só avança current_month se o usuário
 * estava no mês "ao vivo" da última virada (não se navegou para o histórico).
 */
async function ensureMonthRollover(userId) {
  await ensureSettings(userId);
  const data = await loadUserFinanceData(userId);
  const mesReal = monthKeyOf(new Date());
  const lastRollover = data.settings.lastRolloverMonth;

  if (lastRollover && lastRollover >= mesReal) {
    return data.settings;
  }

  const carry = computeCarryOnRollover(data, data.settings, mesReal);
  const wasOnLiveMonth = !lastRollover || data.settings.currentMonth === lastRollover;
  const newCurrentMonth = wasOnLiveMonth ? mesReal : data.settings.currentMonth;

  const pool = getPool();
  await pool.query(
    `UPDATE user_settings
     SET last_rollover_month = $1,
         saldo_carry_over = $2,
         saldo_carry_mes = $3,
         current_month = $4
     WHERE user_id = $5`,
    [mesReal, carry.saldoCarryOver, carry.saldoCarryMes, newCurrentMonth, userId],
  );

  data.settings.lastRolloverMonth = mesReal;
  data.settings.saldoCarryOver = carry.saldoCarryOver;
  data.settings.saldoCarryMes = carry.saldoCarryMes;
  data.settings.currentMonth = newCurrentMonth;
  return data.settings;
}

async function getSettings(userId) {
  return ensureMonthRollover(userId);
}

async function createAjusteSaldoLancamento(userId, { delta, mes, client }) {
  const abs = Math.abs(Number(delta) || 0);
  if (!abs || !mes) return null;

  const db = client || getPool();

  if (delta < 0) {
    const { rows } = await db.query(
      `INSERT INTO despesas (
         user_id, nome, tipo, forma_pagamento, valor, valor_total, num_parcelas,
         categoria, mes_inicio, duracao_meses, dia_vencimento
       ) VALUES ($1, $2, 'variavel', 'avista', $3, NULL, NULL, 'Outros', $4, NULL, NULL)
       RETURNING *`,
      [userId, 'Ajuste de saldo em conta', abs, mes],
    );
    const despesa = mapDespesa(rows[0]);
    await db.query(
      `INSERT INTO pagamentos (user_id, entidade, item_id, mes, pago, data_hora, valor_efetivo)
       VALUES ($1, 'despesa', $2, $3, TRUE, NOW(), $4)
       ON CONFLICT (user_id, entidade, item_id, mes)
       DO UPDATE SET pago = TRUE, valor_efetivo = COALESCE(pagamentos.valor_efetivo, EXCLUDED.valor_efetivo)`,
      [userId, despesa.id, mes, abs],
    );
    return { tipo: 'despesa', item: despesa, mes, valor: abs };
  }

  const { rows } = await db.query(
    `INSERT INTO receitas (user_id, nome, tipo, valor, categoria, mes_inicio, duracao_meses)
     VALUES ($1, $2, 'variavel', $3, 'Outros', $4, NULL)
     RETURNING *`,
    [userId, 'Ajuste de saldo em conta', abs, mes],
  );
  const receita = mapReceita(rows[0]);
  await db.query(
    `INSERT INTO pagamentos (user_id, entidade, item_id, mes, pago, data_hora, valor_efetivo)
     VALUES ($1, 'receita', $2, $3, TRUE, NOW(), $4)
     ON CONFLICT (user_id, entidade, item_id, mes)
     DO UPDATE SET pago = TRUE, valor_efetivo = COALESCE(pagamentos.valor_efetivo, EXCLUDED.valor_efetivo)`,
    [userId, receita.id, mes, abs],
  );
  return { tipo: 'receita', item: receita, mes, valor: abs };
}

async function updateSettings(userId, { currentMonth, saldoConta }) {
  await ensureSettings(userId);
  await ensureMonthRollover(userId);
  const pool = getPool();

  if (currentMonth !== undefined) {
    assertValidMonthKey(currentMonth);
  }

  if (saldoConta !== undefined) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: beforeRows } = await client.query(
        'SELECT saldo_conta, current_month FROM user_settings WHERE user_id = $1 FOR UPDATE',
        [userId],
      );
      const saldoAnterior = Number(beforeRows[0]?.saldo_conta) || 0;
      const saldoNovo = Number(saldoConta);
      const delta = saldoNovo - saldoAnterior;
      const mesAjuste = currentMonth || beforeRows[0]?.current_month || monthKeyOf(new Date());

      const setFields = ['saldo_conta = $1', 'saldo_atualizado_em = NOW()'];
      const values = [saldoNovo];
      let idx = 2;

      if (currentMonth !== undefined) {
        setFields.push(`current_month = $${idx++}`);
        values.push(currentMonth);
      }

      values.push(userId);
      await client.query(
        `UPDATE user_settings SET ${setFields.join(', ')} WHERE user_id = $${idx}`,
        values,
      );

      let movimento = null;
      let ajusteLancamento = null;
      if (delta !== 0) {
        movimento = await registrarMovimentoSaldo(userId, {
          tipo: 'ajuste',
          valor: delta,
          saldoApos: saldoNovo,
          descricao: delta < 0
            ? `Ajuste manual de saldo (−${Math.abs(delta).toFixed(2)} → despesa Outros)`
            : `Ajuste manual de saldo (+${delta.toFixed(2)} → receita Outros)`,
        }, client);

        // Diferença vira lançamento no mês (pago/recebido) sem mexer de novo no saldo_conta.
        ajusteLancamento = await createAjusteSaldoLancamento(userId, {
          delta,
          mes: mesAjuste,
          client,
        });
      }

      await client.query('COMMIT');
      const { settings } = await loadUserFinanceData(userId);
      return { settings, movimento, ajusteLancamento };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const fields = [];
  const values = [];
  let idx = 1;

  if (currentMonth !== undefined) {
    fields.push(`current_month = $${idx++}`);
    values.push(currentMonth);
  }

  if (fields.length === 0) {
    const err = new Error('Nenhum campo para atualizar');
    err.status = 400;
    throw err;
  }

  values.push(userId);
  await pool.query(
    `UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = $${idx}`,
    values,
  );

  const { settings } = await loadUserFinanceData(userId);
  return { settings, movimento: null };
}

/* ============ RECEITAS CRUD ============ */

async function assertPasswordIfPaid(userId, { entidade, itemId, mes, password }) {
  if (!entidade || !itemId || !mes) return;

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM pagamentos
     WHERE user_id = $1 AND entidade = $2 AND item_id = $3 AND mes = $4 AND pago = TRUE
     LIMIT 1`,
    [userId, entidade, itemId, mes],
  );

  if (rows.length === 0) return;

  if (!password) {
    const err = new Error('Senha obrigatória para alterar lançamento pago/recebido');
    err.status = 403;
    throw err;
  }

  await authService.verifyPassword(userId, password);
}

async function listReceitas(userId, mes) {
  const { receitas } = await loadUserFinanceData(userId);
  if (!mes) return receitas;
  return getReceitasMes(receitas, mes).itens;
}

async function createReceita(userId, data) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO receitas (user_id, nome, tipo, valor, categoria, mes_inicio, duracao_meses)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userId,
      data.nome,
      data.tipo,
      data.valor,
      data.categoria,
      data.mesInicio,
      data.duracaoMeses ?? null,
    ],
  );
  return mapReceita(rows[0]);
}

async function updateReceita(userId, id, data) {
  if (data.mes) {
    await assertPasswordIfPaid(userId, {
      entidade: 'receita',
      itemId: id,
      mes: data.mes,
      password: data.password,
    });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE receitas
     SET nome = COALESCE($3, nome),
         valor = COALESCE($4, valor),
         categoria = COALESCE($5, categoria),
         mes_inicio = COALESCE($6, mes_inicio),
         duracao_meses = COALESCE($7, duracao_meses)
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, userId, data.nome, data.valor, data.categoria, data.mesInicio, data.duracaoMeses],
  );
  if (rows.length === 0) {
    const err = new Error('Receita não encontrada');
    err.status = 404;
    throw err;
  }
  return mapReceita(rows[0]);
}

async function deleteReceita(userId, id) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM pagamentos WHERE user_id = $1 AND entidade = $2 AND item_id = $3',
      [userId, 'receita', id],
    );
    const { rowCount } = await client.query(
      'DELETE FROM receitas WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    await client.query('COMMIT');
    if (rowCount === 0) {
      const err = new Error('Receita não encontrada');
      err.status = 404;
      throw err;
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ============ DESPESAS CRUD ============ */

async function listDespesas(userId, mes) {
  const { despesas, emprestimos } = await loadUserFinanceData(userId);
  if (!mes) return despesas;
  return getDespesasMes(despesas, emprestimos, mes).itens.filter((d) => d.tipo !== 'emprestimo');
}

async function createDespesa(userId, data) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO despesas (
       user_id, nome, tipo, forma_pagamento, valor, valor_total, num_parcelas,
       categoria, mes_inicio, duracao_meses, dia_vencimento
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      userId,
      data.nome,
      data.tipo,
      data.formaPagamento,
      data.valor ?? null,
      data.valorTotal ?? null,
      data.numParcelas ?? null,
      data.categoria,
      data.mesInicio,
      data.duracaoMeses ?? null,
      data.diaVencimento ?? null,
    ],
  );
  return mapDespesa(rows[0]);
}

async function updateDespesa(userId, id, data) {
  if (data.mes) {
    await assertPasswordIfPaid(userId, {
      entidade: 'despesa',
      itemId: id,
      mes: data.mes,
      password: data.password,
    });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE despesas
     SET nome = COALESCE($3, nome),
         valor = COALESCE($4, valor),
         valor_total = COALESCE($5, valor_total),
         num_parcelas = COALESCE($6, num_parcelas),
         categoria = COALESCE($7, categoria),
         mes_inicio = COALESCE($8, mes_inicio),
         duracao_meses = COALESCE($9, duracao_meses),
         dia_vencimento = COALESCE($10, dia_vencimento)
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      id,
      userId,
      data.nome,
      data.valor,
      data.valorTotal,
      data.numParcelas,
      data.categoria,
      data.mesInicio,
      data.duracaoMeses,
      data.diaVencimento,
    ],
  );
  if (rows.length === 0) {
    const err = new Error('Despesa não encontrada');
    err.status = 404;
    throw err;
  }
  return mapDespesa(rows[0]);
}

async function deleteDespesa(userId, id) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM pagamentos WHERE user_id = $1 AND entidade = $2 AND item_id = $3',
      [userId, 'despesa', id],
    );
    const { rowCount } = await client.query(
      'DELETE FROM despesas WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    await client.query('COMMIT');
    if (rowCount === 0) {
      const err = new Error('Despesa não encontrada');
      err.status = 404;
      throw err;
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ============ EMPRESTIMOS CRUD ============ */

async function listEmprestimos(userId) {
  const { emprestimos } = await loadUserFinanceData(userId);
  return emprestimos;
}

async function createEmprestimo(userId, data) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO emprestimos (user_id, nome, valor_total, juros, num_parcelas, mes_inicio, categoria, dia_vencimento)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      userId,
      data.nome,
      data.valorTotal,
      data.juros ?? 0,
      data.numParcelas,
      data.mesInicio,
      data.categoria || 'Empréstimo',
      data.diaVencimento ?? null,
    ],
  );
  return mapEmprestimo(rows[0]);
}

async function updateEmprestimo(userId, id, data) {
  if (data.mes) {
    await assertPasswordIfPaid(userId, {
      entidade: 'emprestimo',
      itemId: id,
      mes: data.mes,
      password: data.password,
    });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE emprestimos
     SET nome = COALESCE($3, nome),
         valor_total = COALESCE($4, valor_total),
         juros = COALESCE($5, juros),
         num_parcelas = COALESCE($6, num_parcelas),
         mes_inicio = COALESCE($7, mes_inicio),
         dia_vencimento = COALESCE($8, dia_vencimento)
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, userId, data.nome, data.valorTotal, data.juros, data.numParcelas, data.mesInicio, data.diaVencimento],
  );
  if (rows.length === 0) {
    const err = new Error('Empréstimo não encontrado');
    err.status = 404;
    throw err;
  }
  return mapEmprestimo(rows[0]);
}

async function deleteEmprestimo(userId, id) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM pagamentos WHERE user_id = $1 AND entidade = $2 AND item_id = $3',
      [userId, 'emprestimo', id],
    );
    const { rowCount } = await client.query(
      'DELETE FROM emprestimos WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    await client.query('COMMIT');
    if (rowCount === 0) {
      const err = new Error('Empréstimo não encontrado');
      err.status = 404;
      throw err;
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ============ PAGAMENTOS ============ */

async function listPagamentos(userId, mes) {
  const pool = getPool();
  let query = 'SELECT * FROM pagamentos WHERE user_id = $1';
  const params = [userId];
  if (mes) {
    query += ' AND mes = $2';
    params.push(mes);
  }
  const { rows } = await pool.query(query, params);
  return rows.map(mapPagamento);
}

function pagamentoAfetaSaldo(entidade) {
  return entidade === 'despesa' || entidade === 'emprestimo' || entidade === 'receita';
}

async function lockSaldoConta(userId, client) {
  await client.query(
    'SELECT saldo_conta FROM user_settings WHERE user_id = $1 FOR UPDATE',
    [userId],
  );
}

async function getValorEfetivoPagamento(userId, entidade, itemId, mes) {
  const data = await loadUserFinanceData(userId);
  if (entidade === 'receita') {
    const item = data.receitas.find((r) => r.id === itemId);
    if (!item || !receitaAtivaNoMes(item, mes)) return 0;
    return Number(item.valor);
  }
  if (entidade === 'despesa') {
    const item = data.despesas.find((d) => d.id === itemId);
    if (!item || !despesaAtivaNoMes(item, mes)) return 0;
    return valorEfetivoDespesa(item, mes);
  }
  if (entidade === 'emprestimo') {
    const item = data.emprestimos.find((e) => e.id === itemId);
    if (!item || !estaAtivoParcela(item, mes)) return 0;
    return valorParcelaEmprestimo(item, mes);
  }
  return 0;
}

function mapSaldoMovimento(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    valor: Number(row.valor),
    saldoApos: Number(row.saldo_apos),
    descricao: row.descricao,
    referenciaEntidade: row.referencia_entidade,
    referenciaItemId: row.referencia_item_id,
    referenciaMes: row.referencia_mes,
    createdAt: row.created_at,
  };
}

async function getSaldoContaAtual(userId, client) {
  const db = client || getPool();
  const { rows } = await db.query(
    'SELECT saldo_conta FROM user_settings WHERE user_id = $1',
    [userId],
  );
  return Number(rows[0]?.saldo_conta) || 0;
}

async function registrarMovimentoSaldo(userId, payload, client) {
  const db = client || getPool();
  const { rows } = await db.query(
    `INSERT INTO saldo_movimentos (
      user_id, tipo, valor, saldo_apos, descricao,
      referencia_entidade, referencia_item_id, referencia_mes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      userId,
      payload.tipo,
      payload.valor,
      payload.saldoApos,
      payload.descricao || null,
      payload.referenciaEntidade || null,
      payload.referenciaItemId || null,
      payload.referenciaMes || null,
    ],
  );
  return mapSaldoMovimento(rows[0]);
}

async function listSaldoMovimentos(userId, { mes, limit = 50 } = {}) {
  const pool = getPool();
  let query = 'SELECT * FROM saldo_movimentos WHERE user_id = $1';
  const params = [userId];

  if (mes) {
    query += ` AND created_at >= ($${params.length + 1} || '-01')::date
               AND created_at < (($${params.length + 1} || '-01')::date + interval '1 month')`;
    params.push(mes);
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(Math.min(Number(limit) || 50, 100));

  const { rows } = await pool.query(query, params);
  return rows.map(mapSaldoMovimento);
}

async function getNomePagamento(userId, entidade, itemId) {
  const data = await loadUserFinanceData(userId);
  if (entidade === 'receita') {
    const item = data.receitas.find((r) => r.id === itemId);
    return item?.nome || 'Receita';
  }
  if (entidade === 'despesa') {
    const item = data.despesas.find((d) => d.id === itemId);
    return item?.nome || 'Despesa';
  }
  if (entidade === 'emprestimo') {
    const item = data.emprestimos.find((e) => e.id === itemId);
    return item?.nome || 'Empréstimo';
  }
  return 'Lançamento';
}

async function adjustSaldoConta(userId, delta, client) {
  const db = client || getPool();
  await db.query(
    `UPDATE user_settings
     SET saldo_conta = COALESCE(saldo_conta, 0) + $1,
         saldo_atualizado_em = NOW()
     WHERE user_id = $2`,
    [delta, userId],
  );
}

async function createEntradaReceitaLancamento(userId, { valor, mes, descricao, client }) {
  const abs = Math.abs(Number(valor) || 0);
  if (!abs || !mes) return null;

  const db = client || getPool();
  const nome = 'Entrada em conta';

  const { rows } = await db.query(
    `INSERT INTO receitas (user_id, nome, tipo, valor, categoria, mes_inicio, duracao_meses)
     VALUES ($1, $2, 'variavel', $3, 'Outros', $4, NULL)
     RETURNING *`,
    [userId, nome, abs, mes],
  );
  const receita = mapReceita(rows[0]);
  await db.query(
    `INSERT INTO pagamentos (user_id, entidade, item_id, mes, pago, data_hora, valor_efetivo)
     VALUES ($1, 'receita', $2, $3, TRUE, NOW(), $4)
     ON CONFLICT (user_id, entidade, item_id, mes)
     DO UPDATE SET pago = TRUE, valor_efetivo = COALESCE(pagamentos.valor_efetivo, EXCLUDED.valor_efetivo)`,
    [userId, receita.id, mes, abs],
  );
  return { tipo: 'receita', item: receita, mes, valor: abs };
}

async function registrarEntradaSaldo(userId, { valor, descricao }) {
  const v = Number(valor);
  if (!v || v <= 0) {
    const err = new Error('Informe um valor maior que zero');
    err.status = 400;
    throw err;
  }
  await ensureSettings(userId);
  await ensureMonthRollover(userId);
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await lockSaldoConta(userId, client);
    await adjustSaldoConta(userId, v, client);
    const saldoApos = await getSaldoContaAtual(userId, client);
    const { rows: settingsRows } = await client.query(
      'SELECT current_month FROM user_settings WHERE user_id = $1',
      [userId],
    );
    const mes = settingsRows[0]?.current_month || monthKeyOf(new Date());
    const movimento = await registrarMovimentoSaldo(userId, {
      tipo: 'entrada',
      valor: v,
      saldoApos,
      descricao: (descricao && String(descricao).trim()) || 'Entrada de dinheiro',
    }, client);
    // Receita Outros já recebida — sem mexer de novo no saldo_conta.
    const entradaLancamento = await createEntradaReceitaLancamento(userId, {
      valor: v,
      mes,
      descricao,
      client,
    });
    await client.query('COMMIT');
    const settings = await getSettings(userId);
    return { settings, movimento, entradaLancamento };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function upsertPagamento(userId, { entidade, itemId, mes, pago, comprovanteNome, comprovanteDataUrl, password }) {
  const pool = getPool();

  if (!entidade || !itemId || !mes) {
    const err = new Error('entidade, itemId e mes são obrigatórios');
    err.status = 400;
    throw err;
  }

  assertValidMonthKey(mes);

  if (comprovanteDataUrl && comprovanteDataUrl.length > 3 * 1024 * 1024) {
    const err = new Error('Comprovante excede limite de 3MB');
    err.status = 400;
    throw err;
  }

  const afetaSaldo = pagamentoAfetaSaldo(entidade);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await lockSaldoConta(userId, client);

    const { rows: existingRows } = await client.query(
      'SELECT pago, valor_efetivo FROM pagamentos WHERE user_id = $1 AND entidade = $2 AND item_id = $3 AND mes = $4',
      [userId, entidade, itemId, mes],
    );
    const wasPaid = existingRows.length > 0 && existingRows[0].pago === true;
    const valorSnapshot = existingRows.length > 0 && existingRows[0].valor_efetivo != null
      ? Number(existingRows[0].valor_efetivo)
      : null;

    if (pago === false) {
      await assertPasswordIfPaid(userId, { entidade, itemId, mes, password });
      let movimento = null;
      if (wasPaid && afetaSaldo) {
        let valor = valorSnapshot;
        if (valor == null || valor <= 0) {
          valor = await getValorEfetivoPagamento(userId, entidade, itemId, mes);
        }
        if (valor > 0) {
          const delta = entidade === 'receita' ? -valor : valor;
          await adjustSaldoConta(userId, delta, client);
          const saldoApos = await getSaldoContaAtual(userId, client);
          const nome = await getNomePagamento(userId, entidade, itemId);
          const isReceita = entidade === 'receita';
          movimento = await registrarMovimentoSaldo(userId, {
            tipo: isReceita ? 'pagamento' : 'estorno',
            valor: isReceita ? -valor : valor,
            saldoApos,
            descricao: isReceita ? `Estorno recebimento · ${nome}` : `Estorno · ${nome}`,
            referenciaEntidade: entidade,
            referenciaItemId: itemId,
            referenciaMes: mes,
          }, client);
        }
      }
      await client.query(
        'DELETE FROM pagamentos WHERE user_id = $1 AND entidade = $2 AND item_id = $3 AND mes = $4',
        [userId, entidade, itemId, mes],
      );
      await client.query('COMMIT');
      const settings = await getSettings(userId);
      return { pago: false, settings, movimento };
    }

    let movimento = null;
    let valorPago = valorSnapshot;
    if (afetaSaldo && !wasPaid) {
      valorPago = await getValorEfetivoPagamento(userId, entidade, itemId, mes);
      if (valorPago > 0) {
        const delta = entidade === 'receita' ? valorPago : -valorPago;
        await adjustSaldoConta(userId, delta, client);
        const saldoApos = await getSaldoContaAtual(userId, client);
        const nome = await getNomePagamento(userId, entidade, itemId);
        const isReceita = entidade === 'receita';
        movimento = await registrarMovimentoSaldo(userId, {
          tipo: isReceita ? 'entrada' : 'pagamento',
          valor: isReceita ? valorPago : -valorPago,
          saldoApos,
          descricao: isReceita ? `Recebimento · ${nome}` : `Pagamento · ${nome}`,
          referenciaEntidade: entidade,
          referenciaItemId: itemId,
          referenciaMes: mes,
        }, client);
      }
    } else if (valorPago == null) {
      valorPago = await getValorEfetivoPagamento(userId, entidade, itemId, mes);
    }

    const { rows } = await client.query(
      `INSERT INTO pagamentos (user_id, entidade, item_id, mes, pago, data_hora, comprovante_nome, comprovante_data, valor_efetivo)
       VALUES ($1, $2, $3, $4, TRUE, NOW(), $5, $6, $7)
       ON CONFLICT (user_id, entidade, item_id, mes)
       DO UPDATE SET
         pago = TRUE,
         data_hora = COALESCE(pagamentos.data_hora, NOW()),
         comprovante_nome = COALESCE(EXCLUDED.comprovante_nome, pagamentos.comprovante_nome),
         comprovante_data = COALESCE(EXCLUDED.comprovante_data, pagamentos.comprovante_data),
         valor_efetivo = COALESCE(pagamentos.valor_efetivo, EXCLUDED.valor_efetivo)
       RETURNING *`,
      [
        userId,
        entidade,
        itemId,
        mes,
        comprovanteNome || null,
        comprovanteDataUrl || null,
        valorPago != null && valorPago > 0 ? valorPago : null,
      ],
    );

    await client.query('COMMIT');
    const settings = await getSettings(userId);
    return { ...mapPagamento(rows[0]), settings, movimento };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ============ ORCAMENTOS ============ */

async function getOrcamentos(userId) {
  const { orcamentos } = await loadUserFinanceData(userId);
  return orcamentos;
}

async function updateOrcamentos(userId, orcamentosMap) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const entries = Object.entries(orcamentosMap || {});
    for (const [categoria, limite] of entries) {
      const valor = Number(limite);
      if (valor > 0) {
        await client.query(
          `INSERT INTO orcamentos (user_id, categoria, limite_mensal)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, categoria)
           DO UPDATE SET limite_mensal = EXCLUDED.limite_mensal`,
          [userId, categoria, valor],
        );
      } else {
        await client.query(
          'DELETE FROM orcamentos WHERE user_id = $1 AND categoria = $2',
          [userId, categoria],
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getOrcamentos(userId);
}

/* ============ DASHBOARD / PREVISAO / RELATORIO ============ */

async function getDashboard(userId, mes) {
  await ensureMonthRollover(userId);
  const data = await loadUserFinanceData(userId);
  const currentMonth = mes || data.settings.currentMonth;
  const mesAnt = addMonths(currentMonth, -1);

  const receitas = getReceitasMes(data.receitas, currentMonth);
  const despesas = getDespesasMes(data.despesas, data.emprestimos, currentMonth);
  const recAnt = getReceitasMes(data.receitas, mesAnt);
  const despAnt = getDespesasMes(data.despesas, data.emprestimos, mesAnt);

  const saldoAjustado = getSaldoMesAjustado(
    data.receitas,
    data.despesas,
    data.emprestimos,
    currentMonth,
    data.settings,
  );
  const saldoAntAjustado = getSaldoMesAjustado(
    data.receitas,
    data.despesas,
    data.emprestimos,
    mesAnt,
    data.settings,
  );
  const saldoDevedor = getSaldoDevedorTotal(data.despesas, data.emprestimos, currentMonth);
  const catBreakdown = getCategoriaBreakdown(despesas.itens);
  const alerts = buildAlerts(receitas, despesas, data.orcamentos);
  const vencProx = getVencimentosProximos(
    data.despesas,
    data.emprestimos,
    data.pagamentos,
    currentMonth,
  );
  const atrasados = buildAtrasados(
    data.despesas,
    data.emprestimos,
    data.pagamentos,
    currentMonth,
  );
  const forecast = buildForecastStrip(
    data.despesas,
    data.emprestimos,
    data.receitas,
    currentMonth,
    6,
    data.settings,
  );

  let pagoVal = 0;
  let pendenteVal = 0;
  let pendCount = 0;
  despesas.itens.forEach((d) => {
    const ent = entidadeDoItemDespesa(d);
    if (getPg(data.pagamentos, ent, d.id, currentMonth).pago) {
      pagoVal += d.valorEfetivo;
    } else {
      pendenteVal += d.valorEfetivo;
      pendCount += 1;
    }
  });

  const pctPago = despesas.total > 0 ? (pagoVal / despesas.total) * 100 : 0;

  const categoriasComOrcamento = catBreakdown.map(([cat, val]) => {
    const orc = data.orcamentos[cat] || 0;
    const maxCat = catBreakdown.length ? catBreakdown[0][1] : 0;
    const pctBar = maxCat ? (val / maxCat) * 100 : 0;
    let barCls = 'ok';
    let overBudget = false;
    let budgetMeta = null;
    if (orc > 0) {
      const pctOrc = (val / orc) * 100;
      barCls = pctOrc >= 100 ? 'over' : pctOrc >= 80 ? 'warn' : 'ok';
      overBudget = pctOrc >= 100;
      budgetMeta = { gasto: val, limite: orc, pct: pctOrc };
    }
    return { categoria: cat, valor: val, orcamento: orc, pctBar, barCls, overBudget, budgetMeta };
  });

  return {
    mes: currentMonth,
    settings: data.settings,
    kpis: {
      receitas: {
        total: receitas.total,
        count: receitas.itens.length,
        delta: pctDelta(receitas.total, recAnt.total),
      },
      despesas: {
        total: despesas.total,
        count: despesas.itens.length,
        delta: pctDelta(despesas.total, despAnt.total),
      },
      saldo: {
        fluxo: saldoAjustado.fluxo,
        carryOver: saldoAjustado.carryOver,
        total: saldoAjustado.total,
        usaSaldoConta: Boolean(saldoAjustado.usaSaldoConta),
        delta: saldoAjustado.usaSaldoConta
          ? pctDelta(saldoAjustado.fluxo, saldoAntAjustado.fluxo)
          : pctDelta(saldoAjustado.total, saldoAntAjustado.total),
        positivo: saldoAjustado.total >= 0,
      },
      saldoDevedor: { total: saldoDevedor },
    },
    pagamentos: {
      pagoVal,
      pendenteVal,
      pendCount,
      pctPago,
    },
    categorias: categoriasComOrcamento,
    alerts,
    vencimentosProximos: vencProx,
    atrasados,
    forecast,
    orcamentos: data.orcamentos,
  };
}

async function getPrevisao(userId, { mes, meses = 12 } = {}) {
  await ensureMonthRollover(userId);
  const data = await loadUserFinanceData(userId);
  const startMonth = mes || data.settings.currentMonth;
  const n = Math.min(Math.max(Number(meses) || 12, 1), 24);
  return {
    mesInicio: startMonth,
    meses: n,
    rows: buildPrevisao(
      data.despesas,
      data.emprestimos,
      data.receitas,
      startMonth,
      n,
      data.settings,
    ),
  };
}

async function getMesItemsForReport(userId, mes) {
  await ensureMonthRollover(userId);
  const data = await loadUserFinanceData(userId);
  const currentMonth = mes || data.settings.currentMonth;
  const receitas = getReceitasMes(data.receitas, currentMonth);
  const despesas = getDespesasMes(data.despesas, data.emprestimos, currentMonth);

  const receitasItens = receitas.itens.map((r) => ({
    nome: r.nome,
    categoria: r.categoria,
    valor: r.valorEfetivo,
    status: getPg(data.pagamentos, 'receita', r.id, currentMonth).pago ? 'Recebido' : 'Pendente',
  }));

  const despesasItens = despesas.itens.map((d) => {
    const ent = entidadeDoItemDespesa(d);
    return {
      nome: d.nome,
      categoria: d.categoria,
      valor: d.valorEfetivo,
      status: getPg(data.pagamentos, ent, d.id, currentMonth).pago ? 'Pago' : 'Pendente',
      vencimento: d.diaVencimento ? `dia ${d.diaVencimento}` : '',
    };
  });

  return { currentMonth, receitasItens, despesasItens, settings: data.settings };
}

async function getReportCharts(userId, mes) {
  await ensureMonthRollover(userId);
  const data = await loadUserFinanceData(userId);
  const currentMonth = mes || data.settings.currentMonth;

  const fluxo = [];
  for (let i = -5; i <= 0; i++) {
    const m = addMonths(currentMonth, i);
    const r = getReceitasMes(data.receitas, m).total;
    const d = getDespesasMes(data.despesas, data.emprestimos, m).total;
    fluxo.push({
      mes: m,
      mesLabel: monthLabelShort(m),
      receitas: r,
      despesas: d,
      saldo: r - d,
    });
  }

  const forecast = buildForecastStrip(
    data.despesas,
    data.emprestimos,
    data.receitas,
    currentMonth,
    6,
    data.settings,
  );

  const despesas = getDespesasMes(data.despesas, data.emprestimos, currentMonth);
  const catBreakdown = getCategoriaBreakdown(despesas.itens);
  const categorias = catBreakdown.slice(0, 6).map(([label, valor]) => ({ label, valor }));
  if (catBreakdown.length > 6) {
    const outros = catBreakdown.slice(6).reduce((s, entry) => s + entry[1], 0);
    categorias.push({ label: 'Outros', valor: outros });
  }

  let pagoVal = 0;
  let pendenteVal = 0;
  despesas.itens.forEach((d) => {
    const ent = entidadeDoItemDespesa(d);
    if (getPg(data.pagamentos, ent, d.id, currentMonth).pago) {
      pagoVal += d.valorEfetivo;
    } else {
      pendenteVal += d.valorEfetivo;
    }
  });
  const despTotal = pagoVal + pendenteVal;
  const pctPago = despTotal > 0 ? (pagoVal / despTotal) * 100 : 0;

  return {
    fluxo,
    forecast,
    categorias,
    pagamentos: { pagoVal, pendenteVal, pctPago },
    sparkSaldo: fluxo.map((f) => ({ mesLabel: f.mesLabel, saldo: f.saldo })),
  };
}

module.exports = {
  monthKeyOf,
  loadUserFinanceData,
  getSettings,
  updateSettings,
  ensureMonthRollover,
  getSaldoMesAjustado,
  getSaldoFluxoMes,
  listReceitas,
  createReceita,
  updateReceita,
  deleteReceita,
  listDespesas,
  createDespesa,
  updateDespesa,
  deleteDespesa,
  listEmprestimos,
  createEmprestimo,
  updateEmprestimo,
  deleteEmprestimo,
  listPagamentos,
  upsertPagamento,
  registrarEntradaSaldo,
  listSaldoMovimentos,
  getOrcamentos,
  updateOrcamentos,
  getDashboard,
  getPrevisao,
  getMesItemsForReport,
  getReportCharts,
  parcelasRestantes,
  valorParcelaSimples,
  valorParcelaEmprestimo,
};
