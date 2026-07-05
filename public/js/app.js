(function () {
  'use strict';

  const { apiFetch, getUser } = window.FinanceAPI;

  const CATEGORIAS_RECEITA = ['Salário', 'Freelance', 'Bônus', 'Rendimentos', 'Outros'];
  const CATEGORIAS_DESPESA = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Educação', 'Assinaturas', 'Impostos', 'Mercado', 'Outros'];
  const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const defaultState = () => ({
    currentMonth: monthKeyOf(new Date()),
    receitas: [],
    despesas: [],
    emprestimos: [],
    pagamentos: {},
    orcamentos: {},
    saldoConta: 0,
    saldoContaAtualizadoEm: null,
  });

  let state = defaultState();
  let listFilters = { busca: '', categoria: '', status: 'todos' };
  let modalCtx = { entidade: null, tipo: null, forma: null, duracaoTipo: 'indeterminado', editing: null };
  let modalDraft = {};
  let modalSnapshot = null;
  let modalSubmitting = false;
  let loading = true;
  let dashboardRevealGen = 0;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function activeTab() {
    return document.body.dataset.page || 'dashboard';
  }

  function formatBRL(v) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function monthKeyOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function addMonths(monthStr, n) {
    const [y, m] = monthStr.split('-').map(Number);
    return monthKeyOf(new Date(y, m - 1 + n, 1));
  }
  function diffMonths(a, b) {
    const [ya, ma] = a.split('-').map(Number);
    const [yb, mb] = b.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
  }
  function monthLabel(m) {
    const [y, mm] = m.split('-').map(Number);
    return MESES_PT[mm - 1] + ' de ' + y;
  }
  function monthLabelShort(m) {
    const [y, mm] = m.split('-').map(Number);
    return MESES_PT[mm - 1].slice(0, 3) + '/' + String(y).slice(2);
  }
  function nowLabel(iso) {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function unwrapItems(data, key) {
    if (Array.isArray(data)) return data;
    if (key && data && Array.isArray(data[key])) return data[key];
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  }

  function pagamentosToMap(list) {
    const map = {};
    (Array.isArray(list) ? list : []).forEach(function (pg) {
      if (pg.entidade && pg.itemId && pg.mes) {
        map[chavePg(pg.entidade, pg.itemId, pg.mes)] = {
          pago: pg.pago,
          dataHora: pg.dataHora,
          comprovanteNome: pg.comprovanteNome,
          comprovanteDataUrl: pg.comprovanteDataUrl,
        };
      }
    });
    return map;
  }

  function applyPagamentoRes(res, fallbackChave) {
    const pg = res.pagamento || res;
    if (pg.pago === false && !pg.entidade) {
      return { chave: fallbackChave, remove: true };
    }
    const chave = pg.chave || (pg.entidade && pg.itemId && pg.mes ? chavePg(pg.entidade, pg.itemId, pg.mes) : fallbackChave);
    return {
      chave: chave,
      pago: pg.pago !== false,
      dataHora: pg.dataHora,
      comprovanteNome: pg.comprovanteNome,
      comprovanteDataUrl: pg.comprovanteDataUrl,
    };
  }

  function unwrapSavedItem(saved, resource) {
    const singular = resource.replace(/s$/, '');
    return saved[singular] || saved.item || saved;
  }

  function pctDelta(curr, prev) {
    if (prev === 0 && curr === 0) return { text: 'sem variação', cls: 'neutral', pct: 0 };
    if (prev === 0) return { text: 'novo este mês', cls: 'up', pct: 100 };
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    const sign = pct >= 0 ? '+' : '';
    return { text: `${sign}${pct.toFixed(1)}% vs mês anterior`, cls: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral', pct };
  }

  function renderDelta(curr, prev, invertColors) {
    const d = pctDelta(curr, prev);
    let cls = d.cls;
    if (invertColors) {
      if (cls === 'up') cls = 'down';
      else if (cls === 'down') cls = 'up';
    }
    return `<div class="delta ${cls}">${esc(d.text)}</div>`;
  }

  async function loadState() {
    loading = true;
    render();
    try {
      const [receitas, despesas, emprestimos, pagamentos, orcamentos, settings] = await Promise.all([
        apiFetch('/api/finance/receitas'),
        apiFetch('/api/finance/despesas'),
        apiFetch('/api/finance/emprestimos'),
        apiFetch('/api/finance/pagamentos'),
        apiFetch('/api/finance/orcamentos'),
        apiFetch('/api/finance/settings'),
      ]);

      state.receitas = unwrapItems(receitas, 'receitas');
      state.despesas = unwrapItems(despesas, 'despesas');
      state.emprestimos = unwrapItems(emprestimos, 'emprestimos');
      const pagamentosRaw = pagamentos.pagamentos ?? pagamentos ?? {};
      state.pagamentos = Array.isArray(pagamentosRaw) ? pagamentosToMap(pagamentosRaw) : pagamentosRaw;
      state.orcamentos = orcamentos.orcamentos || orcamentos || {};

      const settingsData = settings.settings || settings;
      if (settingsData) {
        if (settingsData.currentMonth) state.currentMonth = settingsData.currentMonth;
        state.saldoConta = Number(settingsData.saldoConta) || 0;
        state.saldoContaAtualizadoEm = settingsData.saldoContaAtualizadoEm || null;
      }
    } catch (err) {
      toast(err.message || 'Erro ao carregar dados', 'error');
    } finally {
      loading = false;
      render();
    }
  }

  async function saveSettings(partial) {
    const data = await apiFetch('/api/finance/settings', { method: 'PUT', body: partial });
    const s = data.settings || data;
    if (s.currentMonth) state.currentMonth = s.currentMonth;
    if (s.saldoConta !== undefined) state.saldoConta = Number(s.saldoConta) || 0;
    if (s.saldoContaAtualizadoEm !== undefined) state.saldoContaAtualizadoEm = s.saldoContaAtualizadoEm;
  }

async function exportPDF() {
  try {
    const token = window.FinanceAPI.getToken();
    const res = await fetch('/api/finance/export/pdf?mes=' + encodeURIComponent(state.currentMonth), {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    if (!res.ok) throw new Error('Falha ao gerar relatório PDF');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'relatorio-financeiro-' + state.currentMonth + '.pdf';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Relatório PDF baixado');
  } catch (err) {
    toast(err.message || 'Erro ao exportar PDF', 'error');
  }
}

  function toast(msg, type) {
    type = type || 'success';
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  function chavePg(entidade, id, mes) { return entidade + '_' + id + '_' + mes; }

  function getPg(chave) { return state.pagamentos[chave] || { pago: false }; }

  async function togglePago(chave) {
    const atual = getPg(chave);
    const parts = chave.split('_');
    const mes = parts.pop();
    const id = parts.pop();
    const entidade = parts.join('_');

    if (atual.pago) {
      const ok = await confirmAction({
        title: 'Desmarcar pagamento?',
        message: 'A data e o comprovante desta ocorrência serão removidos.',
        confirmLabel: 'Desmarcar',
        danger: true,
      });
      if (!ok) return;
    }

    try {
      const body = {
        entidade,
        itemId: id,
        mes,
        pago: !atual.pago,
        dataHora: !atual.pago ? new Date().toISOString() : null,
      };
      const res = await apiFetch('/api/finance/pagamentos', { method: 'POST', body });
      const applied = applyPagamentoRes(res, chave);
      if (applied.remove) delete state.pagamentos[applied.chave];
      else state.pagamentos[applied.chave] = applied;
      render();
      toast('Status de pagamento atualizado');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function anexarComprovante(chave, inputEl) {
    const file = inputEl.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) toast('Arquivo grande (>2MB) pode deixar a página lenta', 'error');

    const parts = chave.split('_');
    const mes = parts.pop();
    const id = parts.pop();
    const entidade = parts.join('_');

    try {
      const dataUrl = await fileToBase64(file);
      const res = await apiFetch('/api/finance/pagamentos', {
        method: 'POST',
        body: {
          entidade,
          itemId: id,
          mes,
          pago: true,
          dataHora: new Date().toISOString(),
          comprovanteNome: file.name,
          comprovanteDataUrl: dataUrl,
        },
      });
      const applied = applyPagamentoRes(res, chave);
      state.pagamentos[applied.chave] = applied;
      render();
      toast('Comprovante anexado');
    } catch (err) {
      toast(err.message, 'error');
    }
    inputEl.value = '';
  }

  function verComprovante(chave) {
    const pg = getPg(chave);
    if (pg.comprovanteDataUrl) {
      const w = window.open();
      w.document.write('<title>' + esc(pg.comprovanteNome) + '</title><iframe src="' + pg.comprovanteDataUrl + '" style="width:100%;height:100vh;border:none;"></iframe>');
    }
  }

  function renderPagoCell(entidade, id, mes) {
    const chave = chavePg(entidade, id, mes);
    const pg = getPg(chave);
    const inputId = 'file_' + chave.replace(/[^a-zA-Z0-9]/g, '_');
    return (
      '<div class="pago-cell">' +
        '<input type="checkbox" class="pago-check" aria-label="Marcar como pago" ' + (pg.pago ? 'checked' : '') + ' onchange="togglePago(\'' + chave + '\')">' +
        '<div>' +
          (pg.pago
            ? '<div class="pago-meta">pago em ' + nowLabel(pg.dataHora) + '</div>' +
              '<div class="file-mini">' +
                (pg.comprovanteDataUrl
                  ? '<button type="button" class="comprovante-link" onclick="verComprovante(\'' + chave + '\')">ver comprovante</button>'
                  : '<label for="' + inputId + '">anexar comprovante</label><input type="file" id="' + inputId + '" accept="image/*,application/pdf" onchange="anexarComprovante(\'' + chave + '\', this)">') +
              '</div>'
            : '<span class="pago-pendente">pendente</span>') +
        '</div>' +
      '</div>'
    );
  }

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

  function valorParcelaSimples(item) { return item.valorTotal / item.numParcelas; }
  function valorParcelaEmprestimo(item) { return (item.valorTotal * (1 + (item.juros || 0) / 100)) / item.numParcelas; }
  function valorEfetivoDespesa(d) { return d.formaPagamento === 'parcelado' ? valorParcelaSimples(d) : Number(d.valor); }

  function getReceitasMes(mes) {
    const itens = state.receitas.filter(function (r) { return receitaAtivaNoMes(r, mes); }).map(function (r) {
      return Object.assign({}, r, { valorEfetivo: Number(r.valor) });
    });
    return { total: itens.reduce(function (s, r) { return s + r.valorEfetivo; }, 0), itens: itens };
  }

  function getDespesasMes(mes) {
    const desp = state.despesas.filter(function (d) { return despesaAtivaNoMes(d, mes); }).map(function (d) {
      return Object.assign({}, d, { valorEfetivo: valorEfetivoDespesa(d) });
    });
    const emp = state.emprestimos.filter(function (e) { return estaAtivoParcela(e, mes); }).map(function (e) {
      return Object.assign({}, e, {
        tipo: 'emprestimo',
        formaPagamento: 'parcelado',
        categoria: e.categoria || 'Empréstimo',
        valorEfetivo: valorParcelaEmprestimo(e),
      });
    });
    const itens = desp.concat(emp);
    return { total: itens.reduce(function (s, d) { return s + d.valorEfetivo; }, 0), itens: itens };
  }

  function getCategoriaBreakdown(itens) {
    const map = {};
    itens.forEach(function (d) {
      const c = d.categoria || 'Outros';
      map[c] = (map[c] || 0) + d.valorEfetivo;
    });
    return Object.entries(map).sort(function (a, b) { return b[1] - a[1]; });
  }

  function getSaldoDevedorAtMonth(mes) {
    const p1 = state.despesas.filter(function (d) { return d.formaPagamento === 'parcelado'; }).reduce(function (s, d) {
      return s + parcelasRestantes(d, mes) * valorParcelaSimples(d);
    }, 0);
    const p2 = state.emprestimos.reduce(function (s, e) {
      return s + parcelasRestantes(e, mes) * valorParcelaEmprestimo(e);
    }, 0);
    return p1 + p2;
  }

  function getSaldoDevedorTotal() {
    return getSaldoDevedorAtMonth(state.currentMonth);
  }

  function getVencimentoDiff(mes, diaVencimento) {
    if (!diaVencimento) return null;
    const parts = mes.split('-').map(Number);
    const y = parts[0];
    const mm = parts[1];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(y, mm - 1, Math.min(diaVencimento, 28));
    return Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
  }

  function getContasPendentes(mes) {
    const out = [];
    getDespesasMes(mes).itens.forEach(function (d) {
      const chave = chavePg(entidadeDoItemDespesa(d), d.id, mes);
      if (getPg(chave).pago) return;
      const vencDiff = getVencimentoDiff(mes, d.diaVencimento);
      let badge = 'Sem vencimento';
      let badgeCls = 'ok';
      let overdue = false;
      if (vencDiff !== null) {
        if (vencDiff < 0) {
          badge = 'Atrasado ' + Math.abs(vencDiff) + ' dia(s)';
          badgeCls = '';
          overdue = true;
        } else if (vencDiff === 0) {
          badge = 'Vence hoje';
          badgeCls = 'today';
        } else if (vencDiff === 1) {
          badge = 'Amanhã';
        } else {
          badge = 'Em ' + vencDiff + ' dias';
        }
      }
      out.push({
        nome: d.nome,
        categoria: d.categoria || 'Outros',
        valor: d.valorEfetivo,
        chave: chave,
        diaVencimento: d.diaVencimento,
        vencDiff: vencDiff,
        badge: badge,
        badgeCls: badgeCls,
        overdue: overdue,
      });
    });
    return out.sort(function (a, b) {
      if (a.vencDiff !== null && b.vencDiff !== null) {
        if (a.vencDiff < 0 && b.vencDiff >= 0) return -1;
        if (a.vencDiff >= 0 && b.vencDiff < 0) return 1;
        if (a.vencDiff !== b.vencDiff) return a.vencDiff - b.vencDiff;
      }
      if (a.vencDiff === null && b.vencDiff !== null) return 1;
      if (a.vencDiff !== null && b.vencDiff === null) return -1;
      return b.valor - a.valor;
    });
  }

  function buildTimelineSeries(centerMonth, pastMonths, futureMonths) {
    const points = [];
    for (let i = -pastMonths; i <= futureMonths; i++) {
      const mes = addMonths(centerMonth, i);
      const r = getReceitasMes(mes).total;
      const d = getDespesasMes(mes).total;
      points.push({
        mes: mes,
        mesLabel: monthLabelShort(mes),
        receitas: r,
        despesas: d,
        saldo: r - d,
        isCurrent: i === 0,
      });
    }
    return points;
  }

  function buildForecastSeries(fromMonth, months) {
    const nodes = [];
    for (let i = 0; i < months; i++) {
      const mes = addMonths(fromMonth, i);
      const r = getReceitasMes(mes).total;
      const d = getDespesasMes(mes).total;
      nodes.push({ mes: mes, mesLabel: monthLabelShort(mes), receitas: r, despesas: d, saldo: r - d });
    }
    return nodes;
  }

  function categoriasFromItens(itens) {
    const catBreakdown = getCategoriaBreakdown(itens);
    const cats = catBreakdown.slice(0, 5).map(function (entry) {
      return { label: entry[0], valor: entry[1] };
    });
    if (catBreakdown.length > 5) {
      const outros = catBreakdown.slice(5).reduce(function (s, entry) { return s + entry[1]; }, 0);
      cats.push({ label: 'Outros', valor: outros });
    }
    return cats;
  }

  function buildReceitasTabPayload(mes) {
    const data = getReceitasMes(mes);
    const fixas = data.itens.filter(function (r) { return r.tipo === 'fixa'; }).reduce(function (s, r) { return s + r.valorEfetivo; }, 0);
    return {
      total: data.total,
      count: data.itens.length,
      fixas: fixas,
      variaveis: data.total - fixas,
      categorias: categoriasFromItens(data.itens),
    };
  }

  function buildDespesasTabPayload(mes) {
    const itens = getDespesasMes(mes).itens.filter(function (d) { return d.tipo !== 'emprestimo'; });
    const total = itens.reduce(function (s, d) { return s + d.valorEfetivo; }, 0);
    let pagoVal = 0;
    let pendenteVal = 0;
    itens.forEach(function (d) {
      const chave = chavePg(entidadeDoItemDespesa(d), d.id, mes);
      if (getPg(chave).pago) pagoVal += d.valorEfetivo;
      else pendenteVal += d.valorEfetivo;
    });
    return {
      total: total,
      count: itens.length,
      pagoVal: pagoVal,
      pendenteVal: pendenteVal,
      pctPago: total > 0 ? (pagoVal / total * 100) : 0,
      categorias: categoriasFromItens(itens),
    };
  }

  function buildDashboardChartPayload() {
    const mes = state.currentMonth;
    const despesas = getDespesasMes(mes);
    let pagoVal = 0;
    let pendenteVal = 0;
    despesas.itens.forEach(function (d) {
      const chave = chavePg(entidadeDoItemDespesa(d), d.id, mes);
      if (getPg(chave).pago) pagoVal += d.valorEfetivo;
      else pendenteVal += d.valorEfetivo;
    });

    const sparkPast = 5;
    const sparkLabels = [];
    const recSeries = [];
    const despSeries = [];
    const saldoSeries = [];
    for (let i = -sparkPast; i <= 0; i++) {
      const m = addMonths(mes, i);
      sparkLabels.push(monthLabelShort(m));
      const r = getReceitasMes(m).total;
      const d = getDespesasMes(m).total;
      recSeries.push(r);
      despSeries.push(d);
      saldoSeries.push(r - d);
    }

    const devedorLabels = [];
    const devedorSeries = [];
    for (let i = 0; i <= 5; i++) {
      const m = addMonths(mes, i);
      devedorLabels.push(monthLabelShort(m));
      devedorSeries.push(getSaldoDevedorAtMonth(m));
    }

    const cats = categoriasFromItens(despesas.itens);

    return {
      sparklines: [
        { id: 'sparkReceitas', labels: sparkLabels, data: recSeries, opts: { color: cssVar('--green') } },
        { id: 'sparkDespesas', labels: sparkLabels, data: despSeries, opts: { color: cssVar('--red') } },
        { id: 'sparkSaldo', labels: sparkLabels, data: saldoSeries, opts: { semantic: true } },
        { id: 'sparkDevedor', labels: devedorLabels, data: devedorSeries, opts: { color: cssVar('--red') } },
      ],
      fluxo: buildTimelineSeries(mes, 6, 0),
      pagamentos: { pagoVal: pagoVal, pendenteVal: pendenteVal },
      categorias: cats,
      forecast: buildForecastSeries(mes, 6),
    };
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function entidadeDoItemDespesa(d) { return d.tipo === 'emprestimo' ? 'emprestimo' : 'despesa'; }

  function getVencimentosProximos() {
    const mes = state.currentMonth;
    const hoje = new Date();
    const parts = mes.split('-').map(Number);
    const y = parts[0];
    const mm = parts[1];
    const out = [];
    getDespesasMes(mes).itens.forEach(function (d) {
      if (!d.diaVencimento || d.tipo === 'emprestimo') return;
      const venc = new Date(y, mm - 1, Math.min(d.diaVencimento, 28));
      const diff = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff <= 5) {
        const chave = chavePg(entidadeDoItemDespesa(d), d.id, mes);
        if (!getPg(chave).pago) out.push({ nome: d.nome, valor: d.valorEfetivo, diff: diff, chave: chave });
      }
    });
    return out.sort(function (a, b) { return a.diff - b.diff; });
  }

  function passesFilter(item, entidade, mes) {
    const f = listFilters;
    if (f.busca && !item.nome.toLowerCase().includes(f.busca.toLowerCase())) return false;
    if (f.categoria && item.categoria !== f.categoria) return false;
    if (f.status !== 'todos') {
      const pg = getPg(chavePg(entidade, item.id, mes));
      if (f.status === 'pago' && !pg.pago) return false;
      if (f.status === 'pendente' && pg.pago) return false;
    }
    return true;
  }

  function renderFilterBar(categorias) {
    return (
      '<div class="filter-bar">' +
        '<input type="search" placeholder="Buscar por nome…" value="' + esc(listFilters.busca) + '" oninput="setFilter(\'busca\', this.value)" aria-label="Buscar">' +
        '<select onchange="setFilter(\'categoria\', this.value)" aria-label="Filtrar categoria">' +
          '<option value="">Todas categorias</option>' +
          categorias.map(function (c) {
            return '<option value="' + esc(c) + '" ' + (listFilters.categoria === c ? 'selected' : '') + '>' + esc(c) + '</option>';
          }).join('') +
        '</select>' +
        '<select onchange="setFilter(\'status\', this.value)" aria-label="Filtrar status">' +
          '<option value="todos"' + (listFilters.status === 'todos' ? ' selected' : '') + '>Todos status</option>' +
          '<option value="pago"' + (listFilters.status === 'pago' ? ' selected' : '') + '>Pagos/recebidos</option>' +
          '<option value="pendente"' + (listFilters.status === 'pendente' ? ' selected' : '') + '>Pendentes</option>' +
        '</select>' +
      '</div>'
    );
  }

  function updateHeroAndHeader() {
    const mes = state.currentMonth;
    const receitas = getReceitasMes(mes);
    const despesas = getDespesasMes(mes);
    const saldo = receitas.total - despesas.total;

    document.querySelectorAll('#monthLabel').forEach(function (el) {
      const short = window.matchMedia('(max-width: 768px)').matches;
      el.textContent = short ? monthLabelShort(mes) : monthLabel(mes);
    });

    const user = getUser();
    const userName = document.getElementById('userName');
    const userGreeting = document.getElementById('userGreeting');
    const profileAvatar = document.getElementById('profileLinkAvatar');
    const mobileAvatar = document.getElementById('topbarMobileAvatar');
    const displayLabel = user ? (FinanceAuth.displayName ? FinanceAuth.displayName(user) : (user.nome || user.username || user.email)) : '—';
    if (userName && user) userName.textContent = displayLabel;
    if (userGreeting && user) {
      userGreeting.textContent = user.username ? '@' + user.username : displayLabel;
    }
    const avatarText = user ? (function () {
      const parts = String(user.nome || user.username || '').trim().split(/\s+/).filter(Boolean);
      return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : String(user.username || user.nome || '?').slice(0, 2).toUpperCase();
    }()) : '?';
    if (profileAvatar && user) profileAvatar.textContent = avatarText;
    if (mobileAvatar && user) mobileAvatar.textContent = avatarText;

    const heroSaldo = document.getElementById('heroSaldo');
    const heroMonthMeta = document.getElementById('heroMonthMeta');
    if (heroSaldo) {
      heroSaldo.textContent = formatBRL(saldo);
      heroSaldo.classList.toggle('neg', saldo < 0);
    }
    const heroInner = document.querySelector('.hero-balance-inner');
    if (heroInner) {
      heroInner.classList.toggle('positive', saldo >= 0);
      heroInner.classList.toggle('negative', saldo < 0);
    }
    if (heroMonthMeta) {
      heroMonthMeta.innerHTML =
        '<span class="meta-in">Receitas ' + formatBRL(receitas.total) + '</span>' +
        ' · <span class="meta-out">Despesas ' + formatBRL(despesas.total) + '</span>';
    }
  }

  function render() {
    updateHeroAndHeader();
    const view = document.getElementById('view');
    if (!view) return;

    if (loading) {
      if (window.FinanceCharts) window.FinanceCharts.destroy();
      view.innerHTML = '<div class="loading-state"><img src="/images/logo-home-financas.png" alt="" class="brand-logo brand-logo-loading" aria-hidden="true"><p>Carregando…</p></div>';
      view.setAttribute('aria-busy', 'true');
      return;
    }

    view.setAttribute('aria-busy', 'false');
    const tab = activeTab();
    if (tab === 'dashboard') {
      renderDashboardWithReveal();
      return;
    }

    if (window.FinanceCharts) window.FinanceCharts.destroy();
    const map = {
      receitas: renderReceitas,
      despesas: renderDespesas,
      compromissos: renderCompromissos,
      orcamentos: renderOrcamentos,
      previsao: renderPrevisao,
    };
    view.innerHTML = (map[tab] || renderDashboard)();
    if ((tab === 'receitas' || tab === 'despesas') && window.FinanceCharts) {
      requestAnimationFrame(function () {
        window.FinanceCharts.initListTab(
          tab,
          tab === 'receitas' ? buildReceitasTabPayload(state.currentMonth) : buildDespesasTabPayload(state.currentMonth),
        );
      });
    }
  }

  function renderChartEmpty(message, withCta) {
    let html = '<div class="chart-empty"><p>' + esc(message) + '</p>';
    if (withCta) {
      html += '<button type="button" class="btn btn-primary btn-sm chart-empty-cta" onclick="openModal()">+ Novo lançamento</button>';
    }
    return html + '</div>';
  }

  function renderPaidProgress(pct, label) {
    const scale = Math.min(100, Math.max(0, pct)) / 100;
    return (
      '<div class="paid-progress">' +
        '<div class="paid-progress-meta">' + label + '</div>' +
        '<div class="paid-track" aria-hidden="true"><div class="paid-fill" style="--paid-scale:' + scale + '"></div></div>' +
      '</div>'
    );
  }

  function renderDashboardSkeleton() {
    return (
      '<div class="dash-skeleton">' +
        '<div class="sk-block sk-pending"></div>' +
        '<div class="sk-bento">' +
          '<div class="sk-block sk-hero"></div>' +
          '<div class="sk-block sk-mini"></div>' +
          '<div class="sk-block sk-mini"></div>' +
          '<div class="sk-block sk-mini"></div>' +
        '</div>' +
        '<div class="sk-block sk-chart-wide"></div>' +
        '<div class="sk-grid-3">' +
          '<div class="sk-block sk-panel"></div><div class="sk-block sk-panel"></div><div class="sk-block sk-panel"></div>' +
        '</div>' +
        '<div class="sk-block sk-chart-wide"></div>' +
      '</div>'
    );
  }

  function staggerRevealBlocks(view, delayMs) {
    const blocks = view.querySelectorAll('.dash-reveal');
    blocks.forEach(function (el, i) {
      if (!delayMs) {
        el.classList.add('revealed');
        return;
      }
      setTimeout(function () {
        el.classList.add('revealed');
      }, i * delayMs);
    });
  }

  async function renderDashboardWithReveal() {
    const view = document.getElementById('view');
    if (!view) return;

    const gen = ++dashboardRevealGen;
    if (window.FinanceCharts) window.FinanceCharts.destroy();
    view.innerHTML = renderDashboardSkeleton();
    view.setAttribute('aria-busy', 'true');

    const reduced = prefersReducedMotion();
    if (!reduced) await sleep(500);
    if (gen !== dashboardRevealGen) return;

    view.innerHTML = renderDashboard();
    view.setAttribute('aria-busy', 'false');
    staggerRevealBlocks(view, reduced ? 0 : 180);

    if (window.FinanceCharts) {
      requestAnimationFrame(function () {
        if (gen !== dashboardRevealGen) return;
        window.FinanceCharts.init(buildDashboardChartPayload());
      });
    }
  }

  async function changeMonth(delta) {
    state.currentMonth = addMonths(state.currentMonth, delta);
    try {
      await saveSettings({ currentMonth: state.currentMonth });
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function buildAtrasados() {
    const out = [];
    for (let i = 6; i >= 1; i--) {
      const mes = addMonths(state.currentMonth, -i);
      getDespesasMes(mes).itens.forEach(function (d) {
        const chave = chavePg(entidadeDoItemDespesa(d), d.id, mes);
        if (!getPg(chave).pago) out.push({ nome: d.nome, mes: mes, valor: d.valorEfetivo, chave: chave });
      });
    }
    return out;
  }

  function buildAlerts(receitas, despesas) {
    const alerts = [];
    if (despesas.total === 0 && receitas.total === 0) return alerts;
    const saldo = receitas.total - despesas.total;
    if (saldo < 0) alerts.push({ level: 'danger', icon: '⚠', text: 'Déficit de ' + formatBRL(Math.abs(saldo)) + ' — despesas superam receitas.' });
    else if (receitas.total > 0 && saldo / receitas.total < 0.1) alerts.push({ level: '', icon: '⚡', text: 'Margem apertada: sobra menos de 10% da receita.' });

    Object.entries(state.orcamentos).forEach(function (entry) {
      const cat = entry[0];
      const lim = entry[1];
      if (!lim) return;
      const gasto = despesas.itens.filter(function (d) { return d.categoria === cat; }).reduce(function (s, d) { return s + d.valorEfetivo; }, 0);
      if (gasto > lim) alerts.push({ level: 'danger', icon: '💸', text: cat + ': ' + formatBRL(gasto) + ' ultrapassou o orçamento de ' + formatBRL(lim) + '.' });
      else if (gasto > lim * 0.85) alerts.push({ level: '', icon: '📊', text: cat + ': ' + ((gasto / lim) * 100).toFixed(0) + '% do orçamento mensal usado.' });
    });

    const variaveis = despesas.itens.filter(function (d) { return d.tipo === 'variavel' && d.formaPagamento === 'avista'; }).reduce(function (s, d) { return s + d.valorEfetivo; }, 0);
    if (despesas.total > 0 && variaveis / despesas.total > 0.4) alerts.push({ level: '', icon: '📊', text: 'Gastos variáveis à vista são ' + (variaveis / despesas.total * 100).toFixed(0) + '% das despesas.' });

    const comprometido = despesas.itens.filter(function (d) { return d.formaPagamento === 'parcelado' || d.tipo === 'emprestimo'; }).reduce(function (s, d) { return s + d.valorEfetivo; }, 0);
    if (receitas.total > 0 && comprometido / receitas.total > 0.3) alerts.push({ level: 'danger', icon: '🔒', text: (comprometido / receitas.total * 100).toFixed(0) + '% da receita comprometida com parcelas/empréstimos.' });

    return alerts;
  }

  function renderPendingBillRow(item, mobile) {
    const vencTxt = item.diaVencimento ? 'dia ' + item.diaVencimento : '—';
    if (mobile) {
      return (
        '<div class="m-card' + (item.overdue ? ' m-card-overdue' : '') + '">' +
          '<div class="m-card-head"><strong>' + esc(item.nome) + '</strong><span class="mono val-neg">' + formatBRL(item.valor) + '</span></div>' +
          '<div class="m-card-row"><span class="tag">' + esc(item.categoria) + '</span><span>' + vencTxt + '</span></div>' +
          '<div class="m-card-row"><span class="pending-badge ' + item.badgeCls + '">' + esc(item.badge) + '</span></div>' +
          '<div class="m-card-actions"><button type="button" class="btn btn-primary btn-sm" onclick="togglePago(\'' + item.chave + '\')">Marcar pago</button></div>' +
        '</div>'
      );
    }
    return (
      '<div class="pending-row' + (item.overdue ? ' overdue' : '') + '">' +
        '<div class="pending-name">' + esc(item.nome) + '<small>' + esc(item.categoria) + '</small></div>' +
        '<span class="pending-venc">' + vencTxt + '</span>' +
        '<span class="pending-val val-neg">' + formatBRL(item.valor) + '</span>' +
        '<span class="pending-badge ' + item.badgeCls + '">' + esc(item.badge) + '</span>' +
        '<button type="button" class="btn btn-primary btn-sm" onclick="togglePago(\'' + item.chave + '\')">Pagar</button>' +
      '</div>'
    );
  }

  function renderPendingBills(mes) {
    const pendentes = getContasPendentes(mes);
    const totalPend = pendentes.reduce(function (s, p) { return s + p.valor; }, 0);
    const despesas = getDespesasMes(mes);
    let pagoVal = 0;
    let paidCount = 0;
    despesas.itens.forEach(function (d) {
      const chave = chavePg(entidadeDoItemDespesa(d), d.id, mes);
      if (getPg(chave).pago) {
        pagoVal += d.valorEfetivo;
        paidCount++;
      }
    });
    const totalDesp = despesas.itens.length;
    const pctPago = despesas.total > 0 ? (pagoVal / despesas.total * 100) : 0;
    const progressHtml = totalDesp > 0
      ? renderPaidProgress(pctPago, paidCount + ' de ' + totalDesp + ' pagas · ' + pctPago.toFixed(0) + '%')
      : '';
    const listHtml = pendentes.length === 0
      ? '<div class="pending-empty">Nenhuma conta pendente este mês.</div>'
      : (
        '<div class="pending-list">' + pendentes.map(function (p) { return renderPendingBillRow(p, false); }).join('') + '</div>' +
        '<div class="pending-cards">' + pendentes.map(function (p) { return renderPendingBillRow(p, true); }).join('') + '</div>'
      );
    const headMeta = pendentes.length
      ? '<span class="panel-hint-pill pending-total">' + pendentes.length + ' · ' + formatBRL(totalPend) + '</span>'
      : '<span class="panel-hint-pill pending-ok">em dia</span>';
    return (
      '<div class="panel pending-bills dash-reveal">' +
        '<div class="panel-head">' +
          '<h3>Contas a pagar</h3>' +
          headMeta +
        '</div>' +
        progressHtml +
        listHtml +
      '</div>'
    );
  }

  function renderDonutLegend(categorias, palette) {
    const total = categorias.reduce(function (s, c) { return s + c.valor; }, 0);
    const colorsDespesa = ['var(--red)', 'oklch(0.58 0.10 25)', 'oklch(0.45 0.06 25)', 'var(--muted)', 'var(--muted-2)', 'oklch(0.38 0.04 25)'];
    const colorsReceita = ['var(--ice)', 'var(--green)', 'oklch(0.62 0.008 240)', 'oklch(0.52 0.01 240)', 'oklch(0.21 0 0)', 'oklch(0.17 0 0)'];
    const colors = palette === 'receita' ? colorsReceita : colorsDespesa;
    return (
      '<div class="donut-legend">' +
        categorias.map(function (cat, i) {
          const pct = total > 0 ? ((cat.valor / total) * 100).toFixed(0) : 0;
          return (
            '<div class="donut-legend-item">' +
              '<span><span class="dot" style="background:' + colors[i % colors.length] + '"></span>' + esc(cat.label) + '</span>' +
              '<span class="mono">' + formatBRL(cat.valor) + ' (' + pct + '%)</span>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }

  function renderTabSummaryReceitas(mes) {
    const payload = buildReceitasTabPayload(mes);
    if (payload.count === 0) {
      return (
        '<div class="panel tab-summary">' +
          '<div class="panel-head"><h3>Resumo — ' + monthLabel(mes) + '</h3></div>' +
          '<div class="chart-empty tab-summary-empty">Nenhum lançamento neste mês.</div>' +
        '</div>'
      );
    }
    return (
      '<div class="panel tab-summary">' +
        '<div class="panel-head"><h3>Resumo — ' + monthLabel(mes) + '</h3></div>' +
        '<div class="tab-summary-kpis">' +
          '<span>Total <span class="highlight mono">' + formatBRL(payload.total) + '</span></span>' +
          '<span>' + payload.count + ' lançamento(s)</span>' +
          '<span>Fixas <span class="highlight mono">' + formatBRL(payload.fixas) + '</span></span>' +
          '<span>Variáveis <span class="highlight mono">' + formatBRL(payload.variaveis) + '</span></span>' +
        '</div>' +
        '<div class="tab-summary-grid">' +
          '<div class="chart-wrap chart-mini"><canvas id="chartReceitasTab" role="img" aria-label="Receitas por categoria"></canvas></div>' +
          renderDonutLegend(payload.categorias, 'receita') +
        '</div>' +
      '</div>'
    );
  }

  function renderTabSummaryDespesas(mes) {
    const payload = buildDespesasTabPayload(mes);
    if (payload.count === 0) {
      return (
        '<div class="panel tab-summary">' +
          '<div class="panel-head"><h3>Resumo — ' + monthLabel(mes) + '</h3></div>' +
          '<div class="chart-empty tab-summary-empty">Nenhum lançamento neste mês.</div>' +
        '</div>'
      );
    }
    return (
      '<div class="panel tab-summary">' +
        '<div class="panel-head"><h3>Resumo — ' + monthLabel(mes) + '</h3></div>' +
        '<div class="tab-summary-kpis">' +
          '<span>Total <span class="highlight mono">' + formatBRL(payload.total) + '</span></span>' +
          '<span>' + payload.count + ' lançamento(s)</span>' +
          '<span>Pago <span class="highlight mono">' + formatBRL(payload.pagoVal) + '</span></span>' +
          '<span>Pendente <span class="highlight mono" style="color:var(--red)">' + formatBRL(payload.pendenteVal) + '</span></span>' +
        '</div>' +
        '<div class="paid-track tab-summary-paid"><div class="paid-fill" style="--paid-scale:' + (payload.pctPago / 100).toFixed(4) + '"></div></div>' +
        '<div class="tab-summary-paid-meta">' + payload.pctPago.toFixed(0) + '% pago neste mês</div>' +
        '<div class="tab-summary-grid">' +
          '<div class="chart-wrap chart-mini"><canvas id="chartDespesasTab" role="img" aria-label="Despesas por categoria"></canvas></div>' +
          renderDonutLegend(payload.categorias, 'despesa') +
        '</div>' +
      '</div>'
    );
  }

  function renderDashboard() {
    const mes = state.currentMonth;
    const mesAnt = addMonths(mes, -1);
    const receitas = getReceitasMes(mes);
    const despesas = getDespesasMes(mes);
    const recAnt = getReceitasMes(mesAnt);
    const despAnt = getDespesasMes(mesAnt);
    const saldo = receitas.total - despesas.total;
    const saldoAnt = recAnt.total - despAnt.total;
    const saldoDevedor = getSaldoDevedorTotal();
    const alerts = buildAlerts(receitas, despesas);
    const vencProx = getVencimentosProximos();

    let pagoVal = 0, pendenteVal = 0, pendCount = 0;
    despesas.itens.forEach(function (d) {
      const chave = chavePg(entidadeDoItemDespesa(d), d.id, mes);
      if (getPg(chave).pago) pagoVal += d.valorEfetivo;
      else { pendenteVal += d.valorEfetivo; pendCount++; }
    });
    const pctPago = despesas.total > 0 ? (pagoVal / despesas.total * 100) : 0;
    const atrasados = buildAtrasados();
    const taxaPoup = receitas.total > 0 ? ((saldo / receitas.total) * 100).toFixed(0) : null;
    const chartPayload = buildDashboardChartPayload();
    const catsDonut = chartPayload.categorias;

    const saldoContaHtml = state.saldoContaAtualizadoEm ? (
      '<div class="saldo-conta-box dash-reveal">' +
        '<div><div class="sc-label">Saldo em conta (manual)</div>' +
        '<div class="sc-value mono' + (state.saldoConta >= 0 ? ' pos' : ' neg') + '">' + formatBRL(state.saldoConta) + '</div>' +
        '<div class="sc-meta">Atualizado em ' + nowLabel(state.saldoContaAtualizadoEm) + '</div></div>' +
        '<a href="/app/orcamentos" class="btn btn-ghost btn-sm">Atualizar saldo</a>' +
      '</div>'
    ) : '';

    const saldoSub = saldo >= 0
      ? 'sobra no mês' + (taxaPoup !== null ? ' · ' + taxaPoup + '% da receita' : '')
      : 'déficit no mês';

    const fluxoEmpty = chartPayload.fluxo.every(function (p) { return p.receitas === 0 && p.despesas === 0; });

    return (
      saldoContaHtml +
      renderPendingBills(mes) +
      '<div class="dash-bento dash-reveal">' +
        '<div class="kpi kpi-hero kpi-saldo ' + (saldo >= 0 ? 'positive' : 'negative') + '">' +
          '<span class="label">Saldo do mês</span>' +
          '<div class="value mono">' + formatBRL(saldo) + '</div>' +
          renderDelta(saldo, saldoAnt, false) +
          '<div class="sub">' + saldoSub + '</div>' +
          '<div class="kpi-sparkline kpi-sparkline-hero"><canvas id="sparkSaldo" aria-hidden="true"></canvas></div>' +
        '</div>' +
        '<div class="kpi kpi-mini accent-income">' +
          '<span class="label">Receitas</span>' +
          '<div class="value mono">' + formatBRL(receitas.total) + '</div>' +
          renderDelta(receitas.total, recAnt.total, false) +
          '<div class="sub">' + receitas.itens.length + ' lanç.</div>' +
          '<div class="kpi-sparkline"><canvas id="sparkReceitas" aria-hidden="true"></canvas></div>' +
        '</div>' +
        '<div class="kpi kpi-mini accent-expense">' +
          '<span class="label">Despesas</span>' +
          '<div class="value mono">' + formatBRL(despesas.total) + '</div>' +
          renderDelta(despesas.total, despAnt.total, true) +
          '<div class="sub">' + despesas.itens.length + ' lanç.</div>' +
          '<div class="kpi-sparkline"><canvas id="sparkDespesas" aria-hidden="true"></canvas></div>' +
        '</div>' +
        '<div class="kpi kpi-mini accent-debt">' +
          '<span class="label">Saldo devedor</span>' +
          '<div class="value mono">' + formatBRL(saldoDevedor) + '</div>' +
          '<div class="sub">parcelas + empréstimos</div>' +
          '<div class="kpi-sparkline"><canvas id="sparkDevedor" aria-hidden="true"></canvas></div>' +
        '</div>' +
      '</div>' +
      '<div class="panel chart-panel chart-panel-fluxo dash-reveal">' +
        '<div class="panel-head"><h3>Fluxo mensal</h3><span class="panel-hint-pill">7 meses</span></div>' +
        (fluxoEmpty
          ? renderChartEmpty('Cadastre receitas e despesas para ver o gráfico.', true)
          : '<div class="chart-wrap chart-fluxo"><canvas id="chartFluxo" role="img" aria-label="Gráfico de receitas e despesas"></canvas></div>') +
      '</div>' +
      '<div class="grid-3 dash-reveal">' +
        '<div class="panel">' +
          '<div class="panel-head"><h3>Pagamentos do mês</h3><span class="panel-hint-pill">' + pctPago.toFixed(0) + '% pago</span></div>' +
          (pagoVal === 0 && pendenteVal === 0
            ? renderChartEmpty('Sem despesas neste mês.', true)
            : renderPaidProgress(pctPago, formatBRL(pagoVal) + ' pago · pendente ' + formatBRL(pendenteVal)) +
              '<div class="chart-wrap chart-donut"><canvas id="chartPagamentos" role="img" aria-label="Gráfico de pagamentos"></canvas></div>' +
              '<div class="chart-caption">Pendente: <b class="mono val-neg">' + formatBRL(pendenteVal) + '</b> · ' + pendCount + ' item(ns)</div>') +
        '</div>' +
        '<div class="panel">' +
          '<div class="panel-head"><h3>Gastos por categoria</h3><span class="panel-hint-pill">' + monthLabelShort(mes) + '</span></div>' +
          (catsDonut.length === 0
            ? renderChartEmpty('Sem despesas neste mês.', true)
            : '<div class="chart-wrap chart-donut"><canvas id="chartCategorias" role="img" aria-label="Gráfico de categorias"></canvas></div>' +
              renderDonutLegend(catsDonut)) +
        '</div>' +
        '<div class="panel"><div class="panel-head"><h3>Alertas</h3><span class="panel-hint-pill">' + monthLabelShort(mes) + '</span></div>' +
          vencProx.map(function (v) {
            return '<div class="alert info"><span class="ic">📅</span><span>' + esc(v.nome) + ' vence ' + (v.diff === 0 ? 'hoje' : v.diff === 1 ? 'amanhã' : 'em ' + v.diff + ' dias') + ' — ' + formatBRL(v.valor) + '</span><button type="button" class="alert-action" onclick="togglePago(\'' + v.chave + '\')">marcar pago</button></div>';
          }).join('') +
          (alerts.length === 0 && vencProx.length === 0 ? '<div class="alert-empty">Nenhum alerta neste mês.</div>' : alerts.map(function (a) {
            return '<div class="alert ' + a.level + '"><span class="ic">' + a.icon + '</span><span>' + a.text + '</span></div>';
          }).join('')) +
        '</div>' +
      '</div>' +
      (atrasados.length > 0 ? (
        '<div class="panel panel-overdue dash-reveal"><div class="panel-head"><h3>Em atraso</h3><span class="panel-hint-pill">' + atrasados.length + ' item(ns)</span></div>' +
        atrasados.map(function (a) {
          return '<div class="alert danger"><span class="ic">⏰</span><span>' + esc(a.nome) + ' — ' + monthLabelShort(a.mes) + ' — ' + formatBRL(a.valor) + '</span><button type="button" class="alert-action" onclick="togglePago(\'' + a.chave + '\')">marcar pago</button></div>';
        }).join('') + '</div>'
      ) : '') +
      '<div class="panel chart-panel chart-panel-proj dash-reveal">' +
        '<div class="panel-head"><h3>Projeção — próximos 6 meses</h3><span class="panel-hint-pill">receitas fixas + compromissos</span></div>' +
        (chartPayload.forecast.every(function (f) { return f.receitas === 0 && f.despesas === 0; })
          ? renderChartEmpty('Cadastre lançamentos para ver a projeção.', true)
          : '<div class="chart-wrap chart-proj"><canvas id="chartProjecao" role="img" aria-label="Projeção de saldo"></canvas></div>') +
      '</div>'
    );
  }

  function renderTipoTag(item, mes, isReceita) {
    if (isReceita) {
      return '<span class="tag ' + (item.tipo === 'fixa' ? 'tag-fixa' : 'tag-variavel') + '">' + (item.tipo === 'fixa' ? 'Fixa' + (item.duracaoMeses ? ' (' + item.duracaoMeses + 'm)' : ' (∞)') : 'Variável') + '</span>';
    }
    if (item.tipo === 'fixa') return '<span class="tag tag-fixa">Fixa' + (item.duracaoMeses ? ' (' + item.duracaoMeses + 'm)' : ' (∞)') + '</span>';
    if (item.formaPagamento === 'parcelado') {
      const rest = parcelasRestantes(item, mes);
      const pagas = item.numParcelas - rest;
      return '<span class="tag tag-parcelado">Parcelada ' + (pagas + 1) + '/' + item.numParcelas + '</span>';
    }
    return '<span class="tag tag-variavel">Variável (à vista)</span>';
  }

  function renderItemTable(items, mes, entidade, tipo) {
    if (items.length === 0) {
      return '<div class="empty-state">Nenhum lançamento neste mês.<div class="empty-action"><button type="button" class="btn btn-primary btn-sm" onclick="openModal()">+ Novo lançamento</button></div></div>';
    }

    const isReceita = tipo === 'receita';
    const rows = items.map(function (item) {
      const tipoTag = renderTipoTag(item, mes, isReceita);
      const vencTag = !isReceita && item.diaVencimento ? '<span class="tag tag-venc">dia ' + item.diaVencimento + '</span>' : '';
      const valCls = isReceita ? 'val-pos' : 'val-neg';
      const arrKey = isReceita ? 'receitas' : item.tipo === 'emprestimo' ? 'emprestimos' : 'despesas';
      const editEnt = isReceita ? 'receita' : item.tipo === 'emprestimo' ? 'emprestimo' : 'despesa';
      return '<tr><td>' + esc(item.nome) + ' ' + vencTag + '</td><td>' + tipoTag + '</td><td><span class="tag">' + esc(item.categoria) + '</span></td><td class="mono ' + valCls + '">' + formatBRL(item.valorEfetivo) + '</td><td>' + renderPagoCell(entidade, item.id, mes) + '</td><td class="row-actions"><button type="button" class="icon-btn" aria-label="Editar" onclick="editItem(\'' + editEnt + '\',\'' + item.id + '\')">✎</button><button type="button" class="icon-btn danger" aria-label="Excluir" onclick="removeItem(\'' + arrKey + '\',\'' + item.id + '\',\'' + editEnt + '\')">✕</button></td></tr>';
    }).join('');

    const mobileCards = items.map(function (item) {
      const valCls = isReceita ? 'val-pos' : 'val-neg';
      const arrKey = isReceita ? 'receitas' : item.tipo === 'emprestimo' ? 'emprestimos' : 'despesas';
      const editEnt = isReceita ? 'receita' : item.tipo === 'emprestimo' ? 'emprestimo' : 'despesa';
      return '<div class="m-card"><div class="m-card-head"><strong>' + esc(item.nome) + '</strong><span class="mono ' + valCls + '">' + formatBRL(item.valorEfetivo) + '</span></div><div class="m-card-row"><span>' + renderTipoTag(item, mes, isReceita) + '</span><span class="tag">' + esc(item.categoria) + '</span></div><div class="m-card-row">' + renderPagoCell(entidade, item.id, mes) + '</div><div class="m-card-actions"><button type="button" class="btn btn-ghost btn-sm" onclick="editItem(\'' + editEnt + '\',\'' + item.id + '\')">Editar</button><button type="button" class="btn btn-danger-ghost btn-sm" onclick="removeItem(\'' + arrKey + '\',\'' + item.id + '\',\'' + editEnt + '\')">Excluir</button></div></div>';
    }).join('');

    return '<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Categoria</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table><div class="mobile-cards">' + mobileCards + '</div></div>';
  }

  function renderReceitas() {
    const mes = state.currentMonth;
    const itens = getReceitasMes(mes).itens.filter(function (r) { return passesFilter(r, 'receita', mes); });
    return (
      '<div class="section-title-row"><h2>Receitas — ' + monthLabel(mes) + '</h2></div>' +
      renderTabSummaryReceitas(mes) +
      '<div class="panel">' + renderFilterBar(CATEGORIAS_RECEITA) + renderItemTable(itens, mes, 'receita', 'receita') + '</div>'
    );
  }

  function renderDespesas() {
    const mes = state.currentMonth;
    const itens = getDespesasMes(mes).itens.filter(function (d) { return d.tipo !== 'emprestimo' && passesFilter(d, 'despesa', mes); });
    return (
      '<div class="section-title-row"><h2>Despesas — ' + monthLabel(mes) + '</h2></div>' +
      renderTabSummaryDespesas(mes) +
      '<div class="panel">' + renderFilterBar(CATEGORIAS_DESPESA) + renderItemTable(itens, mes, 'despesa', 'despesa') + '</div>'
    );
  }

  function renderCompromissoTable(items, entidade, isEmp) {
    if (items.length === 0) return '<div class="empty-state">Nada cadastrado.</div>';
    const mes = state.currentMonth;
    const arrKey = isEmp ? 'emprestimos' : 'despesas';
    const editEnt = isEmp ? 'emprestimo' : 'despesa';

    return '<div class="table-wrap"><table><thead><tr><th>Nome</th>' + (isEmp ? '<th>Juros</th>' : '') + '<th>Total</th><th>Parcela</th><th>Progresso</th><th>Status</th><th></th></tr></thead><tbody>' +
      items.map(function (item) {
        const valorParcela = isEmp ? valorParcelaEmprestimo(item) : valorParcelaSimples(item);
        const restantes = parcelasRestantes(item, mes);
        const pagas = item.numParcelas - restantes;
        const pct = Math.min(100, Math.max(0, (pagas / item.numParcelas) * 100));
        let statusTxt, cls;
        if (diffMonths(item.mesInicio, mes) < 0) { statusTxt = 'não iniciado'; cls = ''; }
        else if (restantes <= 0) { statusTxt = 'quitado'; cls = 'val-pos'; }
        else { statusTxt = restantes + ' restante(s)'; cls = 'val-neg'; }
        return '<tr><td>' + esc(item.nome) + '</td>' + (isEmp ? '<td class="mono">' + (item.juros || 0) + '%</td>' : '') + '<td class="mono">' + formatBRL(item.valorTotal) + '</td><td class="mono">' + formatBRL(valorParcela) + ' <span style="color:var(--muted-2)">/ ' + item.numParcelas + 'x</span></td><td><span class="progress-mini"><div style="--prog-scale:' + (pct / 100).toFixed(4) + '"></div></span><span class="mono" style="font-size:12px;color:var(--muted)">' + pagas + '/' + item.numParcelas + '</span></td><td class="mono ' + cls + '">' + statusTxt + '</td><td class="row-actions"><button type="button" class="icon-btn" onclick="editItem(\'' + editEnt + '\',\'' + item.id + '\')">✎</button><button type="button" class="icon-btn danger" onclick="removeItem(\'' + arrKey + '\',\'' + item.id + '\',\'' + editEnt + '\')">✕</button></td></tr>';
      }).join('') +
    '</tbody></table></div>';
  }

  function renderCompromissos() {
    const mes = state.currentMonth;
    const parcelados = state.despesas.filter(function (d) { return d.formaPagamento === 'parcelado'; });
    return '<div class="section-title-row"><h2>Parcelas &amp; Empréstimos</h2></div><div class="panel" style="margin-bottom:16px;"><div class="panel-head"><h3>Compras parceladas</h3><span class="hint">' + monthLabelShort(mes) + '</span></div>' + renderCompromissoTable(parcelados, 'despesa', false) + '</div><div class="panel"><div class="panel-head"><h3>Empréstimos</h3><span class="hint">juros simplificado</span></div>' + renderCompromissoTable(state.emprestimos, 'emprestimo', true) + '</div>';
  }

  function renderOrcamentos() {
    return '<div class="section-title-row"><h2>Orçamentos &amp; Conta</h2></div><div class="panel" style="margin-bottom:16px;"><div class="panel-head"><h3>Saldo em conta</h3><span class="hint">valor manual para conciliação</span></div><form onsubmit="salvarSaldoConta(event)" class="field-row" style="align-items:end;"><div class="field" style="margin:0;"><label for="saldoContaInput">Quanto você tem agora (R$)</label><input id="saldoContaInput" type="number" step="0.01" value="' + (state.saldoConta || '') + '" required></div><button type="submit" class="btn btn-primary">Salvar saldo</button></form>' + (state.saldoContaAtualizadoEm ? '<p style="font-size:12px;color:var(--muted-2);margin:12px 0 0;">Última atualização: ' + nowLabel(state.saldoContaAtualizadoEm) + '</p>' : '') + '</div><div class="panel"><div class="panel-head"><h3>Orçamento mensal por categoria</h3><span class="hint">teto de gasto · alertas no dashboard</span></div><form onsubmit="salvarOrcamentos(event)"><div class="budget-grid">' + CATEGORIAS_DESPESA.map(function (cat) {
      return '<div class="budget-item"><label for="orc_' + cat + '">' + esc(cat) + '</label><input id="orc_' + cat + '" type="number" step="0.01" min="0" placeholder="Sem limite" value="' + (state.orcamentos[cat] || '') + '"></div>';
    }).join('') + '</div><div style="margin-top:16px;"><button type="submit" class="btn btn-primary">Salvar orçamentos</button></div></form></div>';
  }

  async function salvarSaldoConta(e) {
    e.preventDefault();
    try {
      await saveSettings({
        saldoConta: Number(document.getElementById('saldoContaInput').value) || 0,
        saldoContaAtualizadoEm: new Date().toISOString(),
      });
      state.saldoConta = Number(document.getElementById('saldoContaInput').value) || 0;
      state.saldoContaAtualizadoEm = new Date().toISOString();
      toast('Saldo em conta atualizado');
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function salvarOrcamentos(e) {
    e.preventDefault();
    const orcamentos = {};
    CATEGORIAS_DESPESA.forEach(function (cat) {
      const v = document.getElementById('orc_' + cat).value;
      if (v) orcamentos[cat] = Number(v);
    });
    try {
      await apiFetch('/api/finance/orcamentos', { method: 'PUT', body: { orcamentos: orcamentos } });
      state.orcamentos = orcamentos;
      toast('Orçamentos salvos');
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderPrevisao() {
    const N = 12;
    let cumulativo = 0;
    const rows = [];
    for (let i = 0; i < N; i++) {
      const mes = addMonths(state.currentMonth, i);
      const r = getReceitasMes(mes).total;
      const d = getDespesasMes(mes).total;
      const saldo = r - d;
      cumulativo += saldo;
      rows.push({ mes: mes, r: r, d: d, saldo: saldo, cumulativo: cumulativo });
    }
    return '<div class="section-title-row"><h2>Previsão — próximos 12 meses</h2></div><div class="panel"><div class="table-wrap"><table><thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Saldo</th><th>Acumulado</th></tr></thead><tbody>' + rows.map(function (row) {
      return '<tr><td>' + monthLabel(row.mes) + '</td><td class="mono val-pos">' + formatBRL(row.r) + '</td><td class="mono val-neg">' + formatBRL(row.d) + '</td><td class="mono ' + (row.saldo >= 0 ? 'val-pos' : 'val-neg') + '">' + formatBRL(row.saldo) + '</td><td class="mono ' + (row.cumulativo >= 0 ? 'val-pos' : 'val-neg') + '">' + formatBRL(row.cumulativo) + '</td></tr>';
    }).join('') + '</tbody></table></div></div><p class="footer-note" style="text-align:left;margin-top:16px;">Entram receitas/despesas fixas e parcelas ativas. Variáveis futuras não lançadas não entram — atualize conforme planejar.</p>';
  }

  async function removeItem(arrKey, id, entidade) {
    const ok = await confirmAction({
      title: 'Excluir lançamento?',
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const resource = arrKey === 'receitas' ? 'receitas' : arrKey === 'emprestimos' ? 'emprestimos' : 'despesas';
    try {
      await apiFetch('/api/finance/' + resource + '/' + id, { method: 'DELETE' });
      state[arrKey] = state[arrKey].filter(function (i) { return i.id !== id; });
      render();
      toast('Lançamento excluído');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function setFilter(key, val) {
    listFilters[key] = val;
    render();
  }

  function isMobileModal() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function modalIsReady(c) {
    return c.entidade === 'emprestimo' || (c.entidade && c.tipo && (c.entidade === 'receita' || c.tipo === 'fixa' || c.forma));
  }

  function modalTypeSummaryLabel(c) {
    const map = {
      receita: 'Receita',
      despesa: 'Despesa',
      emprestimo: 'Empréstimo',
      fixa: 'Fixa',
      variavel: 'Variável',
      avista: 'À vista',
      parcelado: 'Parcelado',
    };
    const parts = [map[c.entidade]];
    if (c.entidade === 'receita' || c.entidade === 'despesa') parts.push(map[c.tipo]);
    if (c.entidade === 'despesa' && c.tipo === 'variavel') parts.push(map[c.forma]);
    return parts.filter(Boolean).join(' · ');
  }

  var ENTITY_RAIL = [
    { value: 'receita', label: 'Receita', shortLabel: 'Receita', icon: '↑', desc: 'Entrada de dinheiro no mês', iconClass: 'in' },
    { value: 'despesa', label: 'Despesa', shortLabel: 'Despesa', icon: '↓', desc: 'Conta, compra ou gasto', iconClass: 'out' },
    { value: 'emprestimo', label: 'Empréstimo', shortLabel: 'Emprést.', icon: '%', desc: 'Parcelas com juros', iconClass: 'loan' },
  ];

  function entityRailItem(item, c, locked) {
    const active = c.entidade === item.value;
    const itemLocked = locked && !active;
    const cls = 'modal-rail-item' + (active ? ' active' : '') + (itemLocked ? ' locked' : '');
    const clickAttr = itemLocked ? '' : ' onclick="setEntidade(\'' + item.value + '\')"';
    const ariaCurrent = active ? ' aria-current="true"' : '';
    const disabled = itemLocked ? ' disabled' : '';
    return (
      '<button type="button" class="' + cls + '" data-value="' + esc(item.value) + '"' + clickAttr + ariaCurrent + disabled + '>' +
      '<span class="modal-rail-icon ' + item.iconClass + '" aria-hidden="true">' + item.icon + '</span>' +
      '<span class="modal-rail-copy">' +
      '<span class="modal-rail-label">' + esc(item.label) + '</span>' +
      '<span class="modal-rail-label-short">' + esc(item.shortLabel || item.label) + '</span>' +
      '<span class="modal-rail-desc">' + esc(item.desc) + '</span>' +
      '</span></button>'
    );
  }

  function buildEntityRailHtml(c, locked) {
    return ENTITY_RAIL.map(function (item) { return entityRailItem(item, c, locked); }).join('');
  }

  function buildPickersHtml(c, locked) {
    let html = '';

    if (c.entidade === 'receita' || c.entidade === 'despesa') {
      html += '<p class="picker-label">Fixa ou variável</p><div class="type-picker modal-type-picker">';
      html += tipoOptBtn('fixa', c.tipo === 'fixa', 'Fixa (repete)', locked, "setTipo('fixa')", 'Repete todo mês');
      html += tipoOptBtn('variavel', c.tipo === 'variavel', 'Variável', locked, "setTipo('variavel')", c.entidade === 'despesa' ? 'À vista ou parcelada' : 'Lançamento pontual');
      html += '</div>';
    }

    if (c.entidade === 'despesa' && c.tipo === 'variavel') {
      html += '<p class="picker-label">Forma de pagamento</p><div class="type-picker modal-type-picker">';
      html += tipoOptBtn('avista', c.forma === 'avista', 'À vista', locked, "setForma('avista')", 'Um pagamento');
      html += tipoOptBtn('parcelado', c.forma === 'parcelado', 'Parcelado', locked, "setForma('parcelado')", 'Divide em N meses');
      html += '</div>';
    }

    return html;
  }

  function buildMainPanelHtml(c, locked) {
    let html = '';
    if (!c.entidade) {
      html +=
        '<p class="modal-panel-empty">' +
        '<span class="empty-desktop">Escolha um tipo na barra ao lado para continuar.</span>' +
        '<span class="empty-mobile">Escolha um tipo na barra acima para continuar.</span>' +
        '</p>';
      return html;
    }
    html += buildPickersHtml(c, locked);
    if (modalIsReady(c)) {
      html += '<form id="modalForm" class="modal-form">' + buildCamposHtml(c) + '</form>';
    }
    return html;
  }

  function toggleModalPickers(show) {
    modalCtx.showPickers = typeof show === 'boolean' ? show : !modalCtx.showPickers;
    renderModal();
  }

  function openModal() {
    modalCtx = { entidade: null, tipo: null, forma: null, duracaoTipo: 'indeterminado', editing: null };
    modalDraft = {};
    modalSnapshot = null;
    renderModal();
    openModalDialog();
  }

  function editItem(entidade, id) {
    const arr = entidade === 'receita' ? state.receitas : entidade === 'despesa' ? state.despesas : state.emprestimos;
    const item = arr.find(function (i) { return i.id === id; });
    if (!item) return;
    modalCtx = {
      entidade: entidade,
      tipo: item.tipo || 'fixa',
      forma: item.formaPagamento || null,
      duracaoTipo: item.duracaoMeses ? 'definida' : 'indeterminado',
      editing: item,
    };
    modalDraft = {};
    modalSnapshot = null;
    renderModal();
    openModalDialog();
  }

  function setEntidade(v) {
    modalCtx.entidade = v;
    modalCtx.tipo = null;
    modalCtx.forma = null;
    renderModal();
  }
  function setTipo(v) {
    modalCtx.tipo = v;
    modalCtx.forma = null;
    renderModal();
  }
  function setForma(v) {
    modalCtx.forma = v;
    renderModal();
  }
  function setDuracaoTipo(v) {
    captureFormDraft();
    if (modalCtx.duracaoTipo === v) return;
    modalCtx.duracaoTipo = v;

    const form = document.getElementById('modalForm');
    const picker = document.querySelector('.duracao-picker');
    if (!form || !picker) {
      renderModal();
      return;
    }

    picker.querySelectorAll('.type-opt').forEach(function (btn) {
      const btnVal = btn.getAttribute('data-value');
      btn.classList.toggle('active', btnVal === v);
    });

    let wrap = document.getElementById('f_duracaoMesesWrap');
    if (v === 'definida') {
      if (!wrap) {
        const mesesVal = draftVal('f_duracaoMeses', '');
        form.insertAdjacentHTML(
          'beforeend',
          '<div class="field" id="f_duracaoMesesWrap"><label for="f_duracaoMeses">Quantos meses</label>' +
          '<input id="f_duracaoMeses" type="number" min="1" inputmode="numeric" value="' + esc(String(mesesVal)) + '" required></div>',
        );
      }
    } else if (wrap) {
      wrap.remove();
    }

    refreshModalSnapshot();
  }
  function confirmAction(opts) {
    if (window.FinanceUI && window.FinanceUI.showConfirm) {
      return window.FinanceUI.showConfirm(opts);
    }
    return Promise.resolve(window.confirm(opts.message || 'Confirmar?'));
  }

  function captureModalSnapshot() {
    const form = document.getElementById('modalForm');
    if (!form) {
      return JSON.stringify({
        entidade: modalCtx.entidade,
        tipo: modalCtx.tipo,
        forma: modalCtx.forma,
        duracaoTipo: modalCtx.duracaoTipo,
      });
    }
    const data = {};
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (!el.id) return;
      data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return JSON.stringify(data);
  }

  function isModalDirty() {
    if (!modalSnapshot) return false;
    return captureModalSnapshot() !== modalSnapshot;
  }

  function shouldConfirmClose() {
    if (modalCtx.editing) return isModalDirty();
    return !!(modalCtx.entidade || modalCtx.tipo || modalCtx.forma) || isModalDirty();
  }

  function refreshModalSnapshot() {
    requestAnimationFrame(function () {
      modalSnapshot = captureModalSnapshot();
    });
  }

  function focusFirstModalField() {
    const dialog = document.getElementById('modalDialog');
    if (!dialog) return;
    const field = dialog.querySelector(
      'input:not([type="hidden"]):not([readonly]), select, textarea, button.modal-rail-item:not(.locked):not([disabled]), button.type-opt:not(.locked):not([disabled])',
    );
    if (field) field.focus();
  }

  function openModalDialog() {
    const dialog = document.getElementById('modalDialog');
    if (!dialog) return;
    document.body.classList.add('modal-open');
    dialog.showModal();
    applyModalViewport();
    refreshModalSnapshot();
    const scrollEl = dialog.querySelector('.modal-scroll');
    if (scrollEl) scrollEl.scrollTop = 0;
    if (!modalIsReady(modalCtx)) focusFirstModalField();
  }

  async function requestCloseModal() {
    if (modalSubmitting) return;
    if (window.FinanceUI && window.FinanceUI.init) FinanceUI.init();
    if (shouldConfirmClose()) {
      const ok = await confirmAction({
        title: 'Sair sem salvar?',
        message: 'Você começou um lançamento. Se sair agora, o que foi preenchido será perdido.',
        confirmLabel: 'Sair',
        cancelLabel: 'Continuar editando',
        danger: true,
      });
      if (!ok) return;
    }
    closeModal();
  }

  function closeModal() {
    modalSubmitting = false;
    modalSnapshot = null;
    modalDraft = {};
    document.body.classList.remove('modal-open');
    document.documentElement.style.removeProperty('--modal-vvh');
    const dialog = document.getElementById('modalDialog');
    if (dialog) dialog.close();
  }

  function syncFieldToDraft(el) {
    if (!el || !el.id) return;
    modalDraft[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  }

  function captureFormDraft() {
    const form = document.getElementById('modalForm');
    if (!form) return;
    const active = document.activeElement;
    if (active && active.id && form.contains(active)) {
      syncFieldToDraft(active);
    }
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.type === 'radio') {
        if (el.checked) modalDraft[el.name || el.id] = el.value;
        return;
      }
      if (!el.id) return;
      syncFieldToDraft(el);
    });
  }

  function bindModalDraftSync() {
    const dialog = document.getElementById('modalDialog');
    if (!dialog || dialog._draftSyncBound) return;
    dialog._draftSyncBound = true;
    dialog.addEventListener('input', function (e) {
      if (e.target && e.target.id && e.target.closest('#modalForm')) syncFieldToDraft(e.target);
    }, true);
    dialog.addEventListener('change', function (e) {
      if (e.target && e.target.id && e.target.closest('#modalForm')) syncFieldToDraft(e.target);
    }, true);
  }

  function applyModalViewport() {
    const dialog = document.getElementById('modalDialog');
    if (!dialog || !dialog.open) return;
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--modal-vvh', Math.round(h) + 'px');
  }

  function bindModalViewportSync() {
    if (!window.visualViewport || window._modalVvBound) return;
    window._modalVvBound = true;
    window.visualViewport.addEventListener('resize', applyModalViewport);
    window.visualViewport.addEventListener('scroll', applyModalViewport);
  }

  function draftVal(id, fallback) {
    if (Object.prototype.hasOwnProperty.call(modalDraft, id)) {
      const v = modalDraft[id];
      if (v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')) return v;
    }
    return fallback ?? '';
  }

  function tipoOptBtn(value, active, label, locked, onclick, desc) {
    const cls = 'type-opt' + (active ? ' active' : '') + (locked && !active ? ' locked' : '');
    const clickAttr = locked ? '' : ' onclick="' + onclick + '"';
    return '<button type="button" class="' + cls + '" data-value="' + esc(value) + '"' + clickAttr + (locked ? ' disabled' : '') + '><div class="t-title">' + label + '</div>' + (desc ? '<div class="t-desc">' + desc + '</div>' : '') + '</button>';
  }

  function duracaoCampo(c, it) {
    const mesesVal = draftVal('f_duracaoMeses', it.duracaoMeses || '');
    return (
      '<p class="picker-label">Duração</p>' +
      '<div class="type-picker duracao-picker modal-type-picker">' +
      tipoOptBtn('indeterminado', c.duracaoTipo === 'indeterminado', 'Sem prazo', false, "setDuracaoTipo('indeterminado')", 'Repete todo mês') +
      tipoOptBtn('definida', c.duracaoTipo === 'definida', 'Com prazo', false, "setDuracaoTipo('definida')", 'Informar nº de meses') +
      '</div>' +
      (c.duracaoTipo === 'definida'
        ? '<div class="field" id="f_duracaoMesesWrap"><label for="f_duracaoMeses">Quantos meses</label><input id="f_duracaoMeses" type="number" min="1" inputmode="numeric" value="' + esc(String(mesesVal)) + '" required></div>'
        : '')
    );
  }

  function buildCamposHtml(c) {
    const it = c.editing || {};
    let html = '';
    const nome = function (label, ph) {
      return '<div class="field"><label for="f_nome">' + label + '</label><input id="f_nome" type="text" value="' + esc(draftVal('f_nome', it.nome || '')) + '" placeholder="' + ph + '" required></div>';
    };
    const catField = function (opts, val) {
      const selected = draftVal('f_categoria', val);
      return '<div class="field"><label for="f_categoria">Categoria</label><select id="f_categoria">' + opts.map(function (o) { return '<option value="' + esc(o) + '" ' + (selected === o ? 'selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></div>';
    };
    const mesField = function (label, val) {
      return '<div class="field"><label for="f_mes">' + label + '</label><input id="f_mes" type="month" value="' + esc(draftVal('f_mes', val || state.currentMonth)) + '" required></div>';
    };
    const vencField = function () {
      if (c.entidade !== 'despesa') return '';
      return '<div class="field"><label for="f_diaVenc">Dia do vencimento (opcional)</label><input id="f_diaVenc" type="number" min="1" max="31" placeholder="Ex: 10" value="' + esc(draftVal('f_diaVenc', it.diaVencimento || '')) + '"></div>';
    };

    if (c.entidade === 'receita') {
      html += nome('Descrição', 'Ex: Salário');
      html += '<div class="field"><label for="f_valor">Valor (R$)</label><input id="f_valor" type="number" step="0.01" min="0" value="' + esc(draftVal('f_valor', it.valor || '')) + '" required></div>';
      html += mesField(c.tipo === 'fixa' ? 'Mês de início' : 'Mês', it.mesInicio);
      html += catField(CATEGORIAS_RECEITA, it.categoria);
      if (c.tipo === 'fixa') html += duracaoCampo(c, it);
    }

    if (c.entidade === 'despesa') {
      html += nome('Descrição', 'Ex: Aluguel');
      if (c.tipo === 'fixa') {
        html += '<div class="field"><label for="f_valor">Valor mensal (R$)</label><input id="f_valor" type="number" step="0.01" min="0" value="' + esc(draftVal('f_valor', it.valor || '')) + '" required></div>';
        html += mesField('Mês de início', it.mesInicio);
        html += catField(CATEGORIAS_DESPESA, it.categoria);
        html += vencField();
        html += duracaoCampo(c, it);
      } else if (c.forma === 'avista') {
        html += '<div class="field"><label for="f_valor">Valor (R$)</label><input id="f_valor" type="number" step="0.01" min="0" value="' + esc(draftVal('f_valor', it.valor || '')) + '" required></div>';
        html += mesField('Mês', it.mesInicio);
        html += catField(CATEGORIAS_DESPESA, it.categoria);
        html += vencField();
      } else if (c.forma === 'parcelado') {
        html += '<div class="field-row"><div class="field"><label for="f_valorTotal">Valor total (R$)</label><input id="f_valorTotal" type="number" step="0.01" min="0" value="' + esc(draftVal('f_valorTotal', it.valorTotal || '')) + '" required></div><div class="field"><label for="f_numParcelas">Nº parcelas</label><input id="f_numParcelas" type="number" min="1" value="' + esc(draftVal('f_numParcelas', it.numParcelas || '')) + '" required></div></div>';
        html += mesField('Mês da 1ª parcela', it.mesInicio);
        html += catField(CATEGORIAS_DESPESA, it.categoria);
        html += vencField();
      }
    }

    if (c.entidade === 'emprestimo') {
      html += nome('Descrição', 'Ex: Empréstimo banco X');
      html += '<div class="field"><label for="f_valorTotal">Valor principal (R$)</label><input id="f_valorTotal" type="number" step="0.01" min="0" value="' + esc(draftVal('f_valorTotal', it.valorTotal || '')) + '" required></div>';
      html += '<div class="field-row"><div class="field"><label for="f_juros">Juros total (%)</label><input id="f_juros" type="number" step="0.01" min="0" value="' + esc(draftVal('f_juros', it.juros || 0)) + '"></div><div class="field"><label for="f_numParcelas">Nº parcelas</label><input id="f_numParcelas" type="number" min="1" value="' + esc(draftVal('f_numParcelas', it.numParcelas || '')) + '" required></div></div>';
      html += mesField('Mês da 1ª parcela', it.mesInicio);
    }

    return html;
  }

  function renderModal() {
    const dialog = document.getElementById('modalDialog');
    const scrollEl = dialog && dialog.querySelector('.modal-scroll');
    const prevScroll = scrollEl ? scrollEl.scrollTop : 0;
    const activeId = document.activeElement && document.activeElement.id ? document.activeElement.id : null;

    captureFormDraft();
    const c = modalCtx;
    const locked = !!c.editing;
    const pronto = modalIsReady(c);
    const panelHtml = buildMainPanelHtml(c, locked);
    const subCopy = c.editing
      ? 'Tipo bloqueado na edição — altere valores e datas.'
      : 'Selecione o tipo e preencha os dados.';

    let html =
      '<div class="modal-grab" aria-hidden="true"></div>' +
      '<div class="modal-header"><h3 id="modalTitle">' + (c.editing ? 'Editar lançamento' : 'Novo lançamento') + '</h3>' +
      '<button type="button" class="modal-close" aria-label="Fechar" onclick="requestCloseModal()">×</button></div>' +
      '<p class="modal-sub">' + subCopy + '</p>' +
      '<div class="modal-shell">' +
      '<nav class="modal-type-rail" aria-label="Tipo de lançamento">' + buildEntityRailHtml(c, locked) + '</nav>' +
      '<div class="modal-panel"><div class="modal-scroll">' + panelHtml + '</div></div>' +
      '</div>';

    if (pronto) {
      html +=
        '<div class="modal-footer">' +
        '<button type="button" class="btn btn-ghost btn-modal-action" onclick="requestCloseModal()">Cancelar</button>' +
        '<button type="submit" class="btn btn-primary btn-modal-action" id="modalSubmitBtn" form="modalForm">' + (c.editing ? 'Salvar' : 'Adicionar') + '</button>' +
        '</div>';
    }

    document.getElementById('modalBody').innerHTML = html;
    const modalBody = document.getElementById('modalBody');
    modalBody.className = 'modal-body' +
      (c.entidade ? ' modal-body--has-entity' : ' modal-body--no-entity') +
      (pronto ? ' modal-body--ready' : '') +
      (locked ? ' modal-body--editing' : '');
    const form = document.getElementById('modalForm');
    if (form) form.onsubmit = handleSubmit;

    const newScrollEl = dialog && dialog.querySelector('.modal-scroll');
    if (newScrollEl && prevScroll > 0) newScrollEl.scrollTop = prevScroll;

    if (activeId) {
      const restore = document.getElementById(activeId);
      if (restore && restore.focus) {
        try { restore.focus({ preventScroll: true }); } catch (err) { restore.focus(); }
      }
    }

    refreshModalSnapshot();

    if (dialog && dialog.open) {
      requestAnimationFrame(function () {
        applyModalViewport();
        const scrollElAfter = dialog.querySelector('.modal-scroll');
        if (scrollElAfter && pronto) scrollElAfter.scrollTop = 0;
      });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (modalSubmitting) return;
    const c = modalCtx;
    const submitBtn = document.getElementById('modalSubmitBtn');
    const submitLabel = c.editing ? 'Salvar' : 'Adicionar';
    modalSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvando…';
    }
    const val = function (id) { const el = document.getElementById(id); return el ? el.value : null; };
    const diaVenc = val('f_diaVenc');
    const diaVencimento = diaVenc ? Number(diaVenc) : null;
    const base = { nome: val('f_nome'), categoria: val('f_categoria'), mesInicio: val('f_mes') };
    let payload;
    let resource;

    if (c.entidade === 'receita') {
      resource = 'receitas';
      payload = Object.assign({}, base, { tipo: c.tipo, valor: Number(val('f_valor')) });
      if (c.tipo === 'fixa') payload.duracaoMeses = c.duracaoTipo === 'definida' ? Number(val('f_duracaoMeses')) : null;
    } else if (c.entidade === 'despesa') {
      resource = 'despesas';
      if (c.tipo === 'fixa') {
        payload = Object.assign({}, base, { tipo: 'fixa', formaPagamento: 'avista', valor: Number(val('f_valor')), duracaoMeses: c.duracaoTipo === 'definida' ? Number(val('f_duracaoMeses')) : null, diaVencimento: diaVencimento });
      } else if (c.forma === 'avista') {
        payload = Object.assign({}, base, { tipo: 'variavel', formaPagamento: 'avista', valor: Number(val('f_valor')), diaVencimento: diaVencimento });
      } else {
        payload = { nome: base.nome, categoria: base.categoria, mesInicio: val('f_mes'), tipo: 'variavel', formaPagamento: 'parcelado', valorTotal: Number(val('f_valorTotal')), numParcelas: Number(val('f_numParcelas')), diaVencimento: diaVencimento };
      }
    } else if (c.entidade === 'emprestimo') {
      resource = 'emprestimos';
      payload = { nome: base.nome, categoria: 'Empréstimo', mesInicio: val('f_mes'), valorTotal: Number(val('f_valorTotal')), juros: Number(val('f_juros') || 0), numParcelas: Number(val('f_numParcelas')) };
    }

    try {
      let saved;
      if (c.editing) {
        saved = await apiFetch('/api/finance/' + resource + '/' + c.editing.id, { method: 'PATCH', body: payload });
        Object.assign(c.editing, unwrapSavedItem(saved, resource));
      } else {
        saved = await apiFetch('/api/finance/' + resource, { method: 'POST', body: payload });
        state[resource].push(unwrapSavedItem(saved, resource));
      }
      closeModal();
      render();
      toast(c.editing ? 'Lançamento atualizado' : 'Lançamento adicionado');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      modalSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
      }
    }
  }

  function initApp() {
    if (!window.FinanceAuth || !FinanceAuth.requireAuth()) return;
    FinanceAuth.initAppAuth();

    const page = document.body.dataset.page;
    if (page === 'perfil') return;

    if (window.FinanceUI) FinanceUI.init();

    const modal = document.getElementById('modalDialog');
    if (modal && window.FinanceUI) {
      FinanceUI.bindModal(modal, function () { requestCloseModal(); });
    }
    bindModalDraftSync();
    bindModalViewportSync();

    loadState();
  }

  window.changeMonth = changeMonth;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.requestCloseModal = requestCloseModal;
  window.editItem = editItem;
  window.removeItem = removeItem;
  window.setFilter = setFilter;
  window.togglePago = togglePago;
  window.anexarComprovante = anexarComprovante;
  window.verComprovante = verComprovante;
  window.exportPDF = exportPDF;
  window.salvarSaldoConta = salvarSaldoConta;
  window.salvarOrcamentos = salvarOrcamentos;
  window.setEntidade = setEntidade;
  window.setTipo = setTipo;
  window.setForma = setForma;
  window.setDuracaoTipo = setDuracaoTipo;
  window.toggleModalPickers = toggleModalPickers;

  document.addEventListener('DOMContentLoaded', initApp);
})();
