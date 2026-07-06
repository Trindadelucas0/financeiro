const { getPool } = require('../db/pool');
const authService = require('./authService');

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

function valorParcelaSimples(item) {
  return item.valorTotal / item.numParcelas;
}

function valorParcelaEmprestimo(item) {
  return (item.valorTotal * (1 + (item.juros || 0) / 100)) / item.numParcelas;
}

function valorEfetivoDespesa(d) {
  return d.formaPagamento === 'parcelado' ? valorParcelaSimples(d) : Number(d.valor);
}

function entidadeDoItemDespesa(d) {
  return d.tipo === 'emprestimo' ? 'emprestimo' : 'despesa';
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
    .map((d) => ({ ...d, valorEfetivo: valorEfetivoDespesa(d) }));
  const emp = emprestimos
    .filter((e) => estaAtivoParcela(e, mes))
    .map((e) => ({
      ...e,
      tipo: 'emprestimo',
      formaPagamento: 'parcelado',
      categoria: e.categoria || 'Empréstimo',
      valorEfetivo: valorParcelaEmprestimo(e),
    }));
  const itens = [...desp, ...emp];
  return { total: itens.reduce((s, d) => s + d.valorEfetivo, 0), itens };
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
    .reduce((s, d) => s + parcelasRestantes(d, currentMonth) * valorParcelaSimples(d), 0);
  const p2 = emprestimos.reduce(
    (s, e) => s + parcelasRestantes(e, currentMonth) * valorParcelaEmprestimo(e),
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
    const venc = new Date(y, mm - 1, Math.min(d.diaVencimento, 28));
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
  for (let i = 6; i >= 1; i--) {
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

function buildForecastStrip(despesas, emprestimos, receitas, currentMonth, n = 6) {
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const mes = addMonths(currentMonth, i);
    const r = getReceitasMes(receitas, mes).total;
    const d = getDespesasMes(despesas, emprestimos, mes).total;
    const saldo = r - d;
    nodes.push({ mes, mesLabel: monthLabelShort(mes), receitas: r, despesas: d, saldo });
  }
  return nodes;
}

function buildPrevisao(despesas, emprestimos, receitas, startMonth, meses = 12) {
  let cumulativo = 0;
  const rows = [];
  for (let i = 0; i < meses; i++) {
    const mes = addMonths(startMonth, i);
    const r = getReceitasMes(receitas, mes).total;
    const d = getDespesasMes(despesas, emprestimos, mes).total;
    const saldo = r - d;
    cumulativo += saldo;
    rows.push({ mes, receitas: r, despesas: d, saldo, cumulativo });
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

  let settings = {
    currentMonth: monthKeyOf(new Date()),
    saldoConta: 0,
    saldoContaAtualizadoEm: null,
  };

  if (settingsRes.rows.length > 0) {
    const s = settingsRes.rows[0];
    settings = {
      currentMonth: s.current_month,
      saldoConta: Number(s.saldo_conta),
      saldoContaAtualizadoEm: s.saldo_atualizado_em,
    };
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

async function getSettings(userId) {
  await ensureSettings(userId);
  const { settings } = await loadUserFinanceData(userId);
  return settings;
}

async function updateSettings(userId, { currentMonth, saldoConta }) {
  await ensureSettings(userId);
  const pool = getPool();

  const fields = [];
  const values = [];
  let idx = 1;

  if (currentMonth !== undefined) {
    fields.push(`current_month = $${idx++}`);
    values.push(currentMonth);
  }

  if (saldoConta !== undefined) {
    fields.push(`saldo_conta = $${idx++}`);
    values.push(saldoConta);
    fields.push(`saldo_atualizado_em = NOW()`);
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

  return getSettings(userId);
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

async function upsertPagamento(userId, { entidade, itemId, mes, pago, comprovanteNome, comprovanteDataUrl, password }) {
  const pool = getPool();

  if (!entidade || !itemId || !mes) {
    const err = new Error('entidade, itemId e mes são obrigatórios');
    err.status = 400;
    throw err;
  }

  if (comprovanteDataUrl && comprovanteDataUrl.length > 3 * 1024 * 1024) {
    const err = new Error('Comprovante excede limite de 2MB');
    err.status = 400;
    throw err;
  }

  if (pago === false) {
    await assertPasswordIfPaid(userId, { entidade, itemId, mes, password });
    await pool.query(
      'DELETE FROM pagamentos WHERE user_id = $1 AND entidade = $2 AND item_id = $3 AND mes = $4',
      [userId, entidade, itemId, mes],
    );
    return { pago: false };
  }

  const { rows } = await pool.query(
    `INSERT INTO pagamentos (user_id, entidade, item_id, mes, pago, data_hora, comprovante_nome, comprovante_data)
     VALUES ($1, $2, $3, $4, TRUE, NOW(), $5, $6)
     ON CONFLICT (user_id, entidade, item_id, mes)
     DO UPDATE SET
       pago = TRUE,
       data_hora = COALESCE(pagamentos.data_hora, NOW()),
       comprovante_nome = COALESCE(EXCLUDED.comprovante_nome, pagamentos.comprovante_nome),
       comprovante_data = COALESCE(EXCLUDED.comprovante_data, pagamentos.comprovante_data)
     RETURNING *`,
    [userId, entidade, itemId, mes, comprovanteNome || null, comprovanteDataUrl || null],
  );

  return mapPagamento(rows[0]);
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
    await client.query('DELETE FROM orcamentos WHERE user_id = $1', [userId]);

    const entries = Object.entries(orcamentosMap || {});
    for (const [categoria, limite] of entries) {
      if (limite && Number(limite) > 0) {
        await client.query(
          'INSERT INTO orcamentos (user_id, categoria, limite_mensal) VALUES ($1, $2, $3)',
          [userId, categoria, limite],
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
  const data = await loadUserFinanceData(userId);
  const currentMonth = mes || data.settings.currentMonth;
  const mesAnt = addMonths(currentMonth, -1);

  const receitas = getReceitasMes(data.receitas, currentMonth);
  const despesas = getDespesasMes(data.despesas, data.emprestimos, currentMonth);
  const recAnt = getReceitasMes(data.receitas, mesAnt);
  const despAnt = getDespesasMes(data.despesas, data.emprestimos, mesAnt);

  const saldo = receitas.total - despesas.total;
  const saldoAnt = recAnt.total - despAnt.total;
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
        total: saldo,
        delta: pctDelta(saldo, saldoAnt),
        positivo: saldo >= 0,
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
  const data = await loadUserFinanceData(userId);
  const startMonth = mes || data.settings.currentMonth;
  const n = Math.min(Math.max(Number(meses) || 12, 1), 24);
  return {
    mesInicio: startMonth,
    meses: n,
    rows: buildPrevisao(data.despesas, data.emprestimos, data.receitas, startMonth, n),
  };
}

async function getMesItemsForReport(userId, mes) {
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

module.exports = {
  monthKeyOf,
  loadUserFinanceData,
  getSettings,
  updateSettings,
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
  getOrcamentos,
  updateOrcamentos,
  getDashboard,
  getPrevisao,
  getMesItemsForReport,
  parcelasRestantes,
  valorParcelaSimples,
  valorParcelaEmprestimo,
};
