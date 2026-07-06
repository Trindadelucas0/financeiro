(function () {
  'use strict';

  var instances = [];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function getColors() {
    return {
      text: cssVar('--text') || 'oklch(0.93 0 0)',
      muted: cssVar('--muted') || 'oklch(0.62 0.01 155)',
      muted2: cssVar('--muted-2') || 'oklch(0.52 0.012 155)',
      red: cssVar('--red') || 'oklch(0.72 0.14 25)',
      ice: cssVar('--ice') || 'oklch(0.94 0.008 240)',
      green: cssVar('--green') || 'oklch(0.78 0.16 155)',
      surface2: cssVar('--surface-2') || 'oklch(0.17 0 0)',
      surface3: cssVar('--surface-3') || 'oklch(0.21 0 0)',
      border: cssVar('--border') || 'oklch(0.24 0 0)',
      bg: cssVar('--bg') || 'oklch(0.09 0 0)',
    };
  }

  function formatBRL(v) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function fontFamily() {
    return "'IBM Plex Sans', system-ui, sans-serif";
  }

  function monoFamily() {
    return "'IBM Plex Mono', monospace";
  }

  function destroy() {
    instances.forEach(function (c) { c.destroy(); });
    instances = [];
  }

  function track(chart) {
    instances.push(chart);
    return chart;
  }

  function getCanvas(id) {
    var el = document.getElementById(id);
    return el && el.getContext ? el : null;
  }

  function basePlugins(c) {
    return {
      legend: {
        labels: {
          color: c.muted,
          font: { family: fontFamily(), size: 11 },
          boxWidth: 10,
          padding: 12,
        },
      },
      tooltip: {
        backgroundColor: c.surface3,
        titleColor: c.text,
        bodyColor: c.muted,
        borderColor: c.border,
        borderWidth: 1,
        titleFont: { family: fontFamily(), size: 12 },
        bodyFont: { family: monoFamily(), size: 12 },
        padding: 10,
        cornerRadius: 8,
      },
    };
  }

  function initSparkline(id, labels, data, opts) {
    var canvas = getCanvas(id);
    if (!canvas || typeof Chart === 'undefined') return;
    opts = opts || {};
    var c = getColors();
    var lineColor = opts.color || c.muted;
    var pointColors = data.map(function (v) {
      if (opts.semantic) return v >= 0 ? c.green : c.red;
      return lineColor;
    });
    var segmentColors = [];
    if (opts.semantic && data.length > 1) {
      for (var i = 0; i < data.length - 1; i++) {
        segmentColors.push(data[i] >= 0 && data[i + 1] >= 0 ? c.green : c.red);
      }
    }

    track(new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          borderColor: opts.semantic ? c.green : lineColor,
          segment: opts.semantic ? {
            borderColor: function (ctx) {
              var idx = ctx.p0DataIndex;
              if (data[idx] >= 0 && data[idx + 1] >= 0) return c.green;
              if (data[idx] < 0 && data[idx + 1] < 0) return c.red;
              return c.red;
            },
          } : undefined,
          backgroundColor: 'transparent',
          pointRadius: 0,
          pointHoverRadius: 3,
          pointBackgroundColor: pointColors,
          borderWidth: 2,
          tension: 0.35,
          fill: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion() ? false : { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            callbacks: {
              label: function (ctx) { return formatBRL(ctx.parsed.y); },
            },
            backgroundColor: c.surface3,
            titleColor: c.text,
            bodyColor: c.muted,
            borderColor: c.border,
            borderWidth: 1,
          },
        },
        scales: {
          x: { display: false },
          y: { display: false },
        },
      },
    }));
  }

  function initFluxo(id, payload) {
    var canvas = getCanvas(id);
    if (!canvas || !payload || !payload.length) return;
    var c = getColors();
    var labels = payload.map(function (p) { return p.mesLabel; });
    var receitas = payload.map(function (p) { return p.receitas; });
    var despesas = payload.map(function (p) { return p.despesas; });
    var lastThree = payload.slice(-4, -1);
    var avgDesp = lastThree.length
      ? lastThree.reduce(function (s, p) { return s + p.despesas; }, 0) / lastThree.length
      : 0;

    track(new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Receitas',
            data: receitas,
            backgroundColor: 'oklch(0.94 0.008 240 / 0.55)',
            borderRadius: 4,
            barPercentage: 0.7,
          },
          {
            label: 'Despesas',
            data: despesas,
            backgroundColor: c.red,
            borderRadius: 4,
            barPercentage: 0.7,
          },
          {
            label: 'Média despesas (3m)',
            data: labels.map(function () { return avgDesp; }),
            type: 'line',
            borderColor: c.muted2,
            borderDash: [4, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion() ? false : { duration: 400 },
        plugins: Object.assign({}, basePlugins(c), {
          tooltip: {
            backgroundColor: c.surface3,
            titleColor: c.text,
            bodyColor: c.muted,
            borderColor: c.border,
            borderWidth: 1,
            callbacks: {
              label: function (ctx) {
                return ctx.dataset.label + ': ' + formatBRL(ctx.parsed.y);
              },
            },
          },
        }),
        scales: {
          x: {
            grid: { color: c.border, drawBorder: false },
            ticks: { color: c.muted2, font: { family: fontFamily(), size: 11 } },
          },
          y: {
            grid: { color: c.border, drawBorder: false },
            ticks: {
              color: c.muted2,
              font: { family: monoFamily(), size: 10 },
              callback: function (v) {
                return v >= 1000 ? 'R$ ' + (v / 1000).toFixed(0) + 'k' : formatBRL(v);
              },
            },
          },
        },
      },
    }));
  }

  function initDonutPagamentos(id, pagoVal, pendenteVal) {
    var canvas = getCanvas(id);
    if (!canvas) return;
    var c = getColors();
    if (pagoVal === 0 && pendenteVal === 0) return;

    track(new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Pago', 'Pendente'],
        datasets: [{
          data: [pagoVal, pendenteVal],
          backgroundColor: [c.surface3, c.red],
          borderColor: [c.ice, c.bg],
          borderWidth: [2, 2],
          hoverOffset: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: reducedMotion() ? false : { duration: 400 },
        plugins: Object.assign({}, basePlugins(c), {
          tooltip: {
            backgroundColor: c.surface3,
            titleColor: c.text,
            bodyColor: c.muted,
            borderColor: c.border,
            borderWidth: 1,
            callbacks: {
              label: function (ctx) {
                var total = pagoVal + pendenteVal;
                var pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(0) : 0;
                return ctx.label + ': ' + formatBRL(ctx.parsed) + ' (' + pct + '%)';
              },
            },
          },
        }),
      },
    }));
  }

  var CAT_COLORS = [
    'oklch(0.72 0.14 25)',
    'oklch(0.58 0.10 25)',
    'oklch(0.45 0.06 25)',
    'oklch(0.62 0.01 155)',
    'oklch(0.52 0.012 155)',
    'oklch(0.38 0.04 25)',
  ];

  var CAT_COLORS_RECEITA = [
    'oklch(0.94 0.008 240)',
    'oklch(0.78 0.16 155)',
    'oklch(0.62 0.008 240)',
    'oklch(0.52 0.01 240)',
    'oklch(0.21 0 0)',
    'oklch(0.17 0 0)',
  ];

  function initTabDonut(id, categorias, palette) {
    var canvas = getCanvas(id);
    if (!canvas || !categorias || !categorias.length) return;
    var c = getColors();
    var colors = palette === 'receita' ? CAT_COLORS_RECEITA : CAT_COLORS;

    track(new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: categorias.map(function (cat) { return cat.label; }),
        datasets: [{
          data: categorias.map(function (cat) { return cat.valor; }),
          backgroundColor: categorias.map(function (_, i) { return colors[i % colors.length]; }),
          borderColor: c.bg,
          borderWidth: 2,
          hoverOffset: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        animation: reducedMotion() ? false : { duration: 350 },
        plugins: Object.assign({}, basePlugins(c), {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.surface3,
            titleColor: c.text,
            bodyColor: c.muted,
            borderColor: c.border,
            borderWidth: 1,
            callbacks: {
              label: function (ctx) {
                var total = categorias.reduce(function (s, cat) { return s + cat.valor; }, 0);
                var pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(0) : 0;
                return ctx.label + ': ' + formatBRL(ctx.parsed) + ' (' + pct + '%)';
              },
            },
          },
        }),
      },
    }));
  }

  function initDonutCategorias(id, categorias) {
    var canvas = getCanvas(id);
    if (!canvas || !categorias || !categorias.length) return;
    var c = getColors();

    track(new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: categorias.map(function (cat) { return cat.label; }),
        datasets: [{
          data: categorias.map(function (cat) { return cat.valor; }),
          backgroundColor: categorias.map(function (_, i) { return CAT_COLORS[i % CAT_COLORS.length]; }),
          borderColor: c.bg,
          borderWidth: 2,
          hoverOffset: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        animation: reducedMotion() ? false : { duration: 400 },
        plugins: Object.assign({}, basePlugins(c), {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.surface3,
            titleColor: c.text,
            bodyColor: c.muted,
            borderColor: c.border,
            borderWidth: 1,
            callbacks: {
              label: function (ctx) {
                var total = categorias.reduce(function (s, cat) { return s + cat.valor; }, 0);
                var pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(0) : 0;
                return ctx.label + ': ' + formatBRL(ctx.parsed) + ' (' + pct + '%)';
              },
            },
          },
        }),
      },
    }));
  }

  function initProjecao(id, forecast) {
    var canvas = getCanvas(id);
    if (!canvas || !forecast || !forecast.length) return;
    var c = getColors();
    var labels = forecast.map(function (f) { return f.mesLabel; });
    var saldos = forecast.map(function (f) { return f.saldo; });

    track(new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Saldo projetado',
          data: saldos,
          borderColor: c.ice,
          backgroundColor: function (context) {
            var chart = context.chart;
            var ctx = chart.ctx;
            var gradient = ctx.createLinearGradient(0, 0, 0, chart.height);
            gradient.addColorStop(0, 'oklch(0.78 0.16 155 / 0.25)');
            gradient.addColorStop(0.5, 'oklch(0.78 0.16 155 / 0.05)');
            gradient.addColorStop(1, 'oklch(0.72 0.14 25 / 0.15)');
            return gradient;
          },
          segment: {
            borderColor: function (ctx) {
              return ctx.p1.parsed.y >= 0 ? c.green : c.red;
            },
          },
          pointBackgroundColor: saldos.map(function (v, i) {
            return i === 0 ? c.ice : (v >= 0 ? c.green : c.red);
          }),
          pointRadius: saldos.map(function (_, i) { return i === 0 ? 6 : 4; }),
          pointBorderColor: c.bg,
          pointBorderWidth: 2,
          borderWidth: 2.5,
          tension: 0.3,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion() ? false : { duration: 450 },
        plugins: Object.assign({}, basePlugins(c), {
          tooltip: {
            backgroundColor: c.surface3,
            titleColor: c.text,
            bodyColor: c.muted,
            borderColor: c.border,
            borderWidth: 1,
            callbacks: {
              afterTitle: function () { return ''; },
              label: function (ctx) { return 'Saldo: ' + formatBRL(ctx.parsed.y); },
              afterBody: function (items) {
                if (!items.length) return [];
                var idx = items[0].dataIndex;
                var f = forecast[idx];
                return ['Receitas: ' + formatBRL(f.receitas), 'Despesas: ' + formatBRL(f.despesas)];
              },
            },
          },
        }),
        scales: {
          x: {
            grid: { color: c.border, drawBorder: false },
            ticks: { color: c.muted2, font: { family: fontFamily(), size: 11 } },
          },
          y: {
            grid: { color: c.border, drawBorder: false },
            ticks: {
              color: c.muted2,
              font: { family: monoFamily(), size: 10 },
              callback: function (v) { return formatBRL(v); },
            },
          },
        },
      },
    }));
  }

  function initListTab(tab, payload) {
    destroy();
    if (!payload || typeof Chart === 'undefined') return;
    if (tab === 'receitas' && payload.categorias && payload.categorias.length) {
      initTabDonut('chartReceitasTab', payload.categorias, 'receita');
    }
    if (tab === 'despesas' && payload.categorias && payload.categorias.length) {
      initTabDonut('chartDespesasTab', payload.categorias, 'despesa');
    }
  }

  function resize() {
    instances.forEach(function (c) {
      if (c && typeof c.resize === 'function') c.resize();
    });
  }

  function init(payload) {
    destroy();
    if (!payload || typeof Chart === 'undefined') return;

    if (payload.sparklines) {
      payload.sparklines.forEach(function (sp) {
        initSparkline(sp.id, sp.labels, sp.data, sp.opts || {});
      });
    }
    if (payload.fluxo && payload.fluxo.length) initFluxo('chartFluxo', payload.fluxo);
    if (payload.pagamentos) {
      initDonutPagamentos('chartPagamentos', payload.pagamentos.pagoVal, payload.pagamentos.pendenteVal);
    }
    if (payload.categorias && payload.categorias.length) {
      initDonutCategorias('chartCategorias', payload.categorias);
    }
    if (payload.forecast && payload.forecast.length) {
      initProjecao('chartProjecao', payload.forecast);
    }
  }

  window.FinanceCharts = { init: init, initListTab: initListTab, destroy: destroy, resize: resize, formatBRL: formatBRL };
})();
