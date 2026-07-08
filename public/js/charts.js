(function () {
  'use strict';

  var instances = [];
  var resizeObservers = [];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches;
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

  function disconnectObservers() {
    resizeObservers.forEach(function (ro) { ro.disconnect(); });
    resizeObservers = [];
  }

  function destroy() {
    instances.forEach(function (c) { c.destroy(); });
    instances = [];
    disconnectObservers();
  }

  function track(chart, wrapEl) {
    instances.push(chart);
    if (wrapEl && typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        if (chart && typeof chart.resize === 'function') chart.resize();
      });
      ro.observe(wrapEl);
      resizeObservers.push(ro);
    }
    return chart;
  }

  function getCanvas(id) {
    var el = document.getElementById(id);
    return el && el.getContext ? el : null;
  }

  function waitForChartContainer(id, callback, attempt) {
    attempt = attempt || 0;
    var canvas = getCanvas(id);
    var wrap = canvas ? canvas.closest('.chart-wrap') : null;
    var width = wrap ? wrap.offsetWidth : (canvas ? canvas.offsetWidth : 0);
    if (canvas && width > 0) {
      callback(canvas);
      return;
    }
    if (attempt >= 10) return;
    requestAnimationFrame(function () {
      waitForChartContainer(id, callback, attempt + 1);
    });
  }

  function basePlugins(c) {
    return {
      legend: {
        labels: {
          color: c.muted,
          font: { family: fontFamily(), size: isMobile() ? 9 : 11 },
          boxWidth: isMobile() ? 8 : 10,
          padding: isMobile() ? 8 : 12,
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

  function axisOptions(c, mobile) {
    return {
      x: {
        grid: { color: c.border, drawBorder: false },
        ticks: {
          color: c.muted2,
          font: { family: fontFamily(), size: mobile ? 9 : 11 },
          maxRotation: mobile ? 0 : 50,
          autoSkip: true,
          maxTicksLimit: mobile ? 6 : 12,
        },
      },
      y: {
        grid: { color: c.border, drawBorder: false },
        ticks: {
          color: c.muted2,
          font: { family: monoFamily(), size: mobile ? 9 : 10 },
          maxTicksLimit: mobile ? 5 : 8,
          callback: function (v) {
            return v >= 1000 || v <= -1000 ? 'R$ ' + (v / 1000).toFixed(0) + 'k' : formatBRL(v);
          },
        },
      },
    };
  }

  function initSparkline(id, labels, data, opts) {
    waitForChartContainer(id, function (canvas) {
      opts = opts || {};
      var c = getColors();
      var lineColor = opts.color || c.muted;
      var pointColors = data.map(function (v) {
        if (opts.semantic) return v >= 0 ? c.green : c.red;
        return lineColor;
      });

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
          devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
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
      }), canvas.closest('.kpi-sparkline') || canvas.parentElement);
    });
  }

  function initFluxo(id, payload) {
    if (!payload || !payload.length) return;
    waitForChartContainer(id, function (canvas) {
      var c = getColors();
      var mobile = isMobile();
      var labels = payload.map(function (p) { return p.mesLabel; });
      var receitas = payload.map(function (p) { return p.receitas; });
      var despesas = payload.map(function (p) { return p.despesas; });
      var saldos = payload.map(function (p) { return p.receitas - p.despesas; });

      track(new Chart(canvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Receitas',
              data: receitas,
              backgroundColor: 'oklch(0.94 0.008 240 / 0.65)',
              borderColor: c.ice,
              borderWidth: 1,
              borderRadius: 4,
              barPercentage: mobile ? 0.55 : 0.65,
              categoryPercentage: 0.8,
              order: 2,
            },
            {
              label: 'Despesas',
              data: despesas,
              backgroundColor: 'oklch(0.72 0.14 25 / 0.75)',
              borderColor: c.red,
              borderWidth: 1,
              borderRadius: 4,
              barPercentage: mobile ? 0.55 : 0.65,
              categoryPercentage: 0.8,
              order: 3,
            },
            {
              label: 'Saldo',
              data: saldos,
              type: 'line',
              borderColor: c.green,
              backgroundColor: 'transparent',
              borderWidth: 2.5,
              pointRadius: mobile ? 3 : 4,
              pointHoverRadius: 6,
              pointBackgroundColor: saldos.map(function (v) { return v >= 0 ? c.green : c.red; }),
              pointBorderColor: c.bg,
              pointBorderWidth: 2,
              tension: 0.25,
              fill: false,
              order: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: reducedMotion() ? false : { duration: 400 },
          plugins: Object.assign({}, basePlugins(c), {
            legend: {
              display: true,
              position: mobile ? 'bottom' : 'top',
              align: mobile ? 'center' : 'end',
              labels: {
                color: c.muted,
                font: { family: fontFamily(), size: mobile ? 9 : 11 },
                boxWidth: mobile ? 8 : 10,
                padding: mobile ? 8 : 12,
                usePointStyle: true,
              },
            },
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
          scales: axisOptions(c, mobile),
        },
      }), canvas.closest('.chart-wrap'));
    });
  }

  function initDonutPagamentos(id, pagoVal, pendenteVal) {
    waitForChartContainer(id, function (canvas) {
      var c = getColors();
      if (pagoVal === 0 && pendenteVal === 0) return;
      var mobile = isMobile();

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
          cutout: mobile ? '72%' : '68%',
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
                  var total = pagoVal + pendenteVal;
                  var pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(0) : 0;
                  return ctx.label + ': ' + formatBRL(ctx.parsed) + ' (' + pct + '%)';
                },
              },
            },
          }),
        },
      }), canvas.closest('.chart-wrap'));
    });
  }

  var CAT_COLORS = [
    'oklch(0.72 0.14 25)',
    'oklch(0.58 0.10 25)',
    'oklch(0.45 0.06 25)',
    'oklch(0.62 0.01 155)',
    'oklch(0.52 0.012 155)',
    'oklch(0.38 0.04 25)',
  ];

  function initDonutCategorias(id, categorias) {
    if (!categorias || !categorias.length) return;
    waitForChartContainer(id, function (canvas) {
      var c = getColors();
      var mobile = isMobile();

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
          cutout: mobile ? '72%' : '62%',
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
      }), canvas.closest('.chart-wrap'));
    });
  }

  function initProjecao(id, forecast) {
    if (!forecast || !forecast.length) return;
    waitForChartContainer(id, function (canvas) {
      var c = getColors();
      var mobile = isMobile();
      var labels = forecast.map(function (f) { return f.mesLabel; });
      var receitas = forecast.map(function (f) { return f.receitas; });
      var despesas = forecast.map(function (f) { return f.despesas; });
      var saldos = forecast.map(function (f) { return f.saldo; });

      var datasets = [];
      if (!mobile) {
        datasets.push(
          {
            label: 'Receitas',
            data: receitas,
            backgroundColor: 'oklch(0.94 0.008 240 / 0.55)',
            borderColor: c.ice,
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.65,
            categoryPercentage: 0.8,
            order: 2,
          },
          {
            label: 'Despesas',
            data: despesas,
            backgroundColor: 'oklch(0.72 0.14 25 / 0.7)',
            borderColor: c.red,
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.65,
            categoryPercentage: 0.8,
            order: 3,
          }
        );
      }
      datasets.push({
        label: 'Saldo projetado',
        data: saldos,
        type: 'line',
        borderColor: c.green,
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointRadius: saldos.map(function (v, i) { return forecast[i].isCurrent ? 5 : (mobile ? 3 : 4); }),
        pointHoverRadius: 6,
        pointBackgroundColor: saldos.map(function (v, i) {
          if (forecast[i].isCurrent) return c.ice;
          return v >= 0 ? c.green : c.red;
        }),
        pointBorderColor: c.bg,
        pointBorderWidth: 2,
        segment: {
          borderColor: function (ctx) {
            var idx = ctx.p0DataIndex;
            if (saldos[idx] >= 0 && saldos[idx + 1] >= 0) return c.green;
            if (saldos[idx] < 0 && saldos[idx + 1] < 0) return c.red;
            return c.red;
          },
        },
        tension: 0.25,
        fill: false,
        order: 1,
      });

      track(new Chart(canvas, {
        type: mobile ? 'line' : 'bar',
        data: { labels: labels, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: reducedMotion() ? false : { duration: 450 },
          plugins: Object.assign({}, basePlugins(c), {
            legend: {
              display: !mobile || datasets.length > 1,
              position: mobile ? 'bottom' : 'top',
              align: mobile ? 'center' : 'end',
              labels: {
                color: c.muted,
                font: { family: fontFamily(), size: mobile ? 9 : 11 },
                boxWidth: mobile ? 8 : 10,
                padding: mobile ? 8 : 12,
                usePointStyle: true,
              },
            },
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
                afterBody: function (items) {
                  if (!items.length) return [];
                  var idx = items[0].dataIndex;
                  var f = forecast[idx];
                  if (items[0].dataset.label === 'Saldo projetado') {
                    return [
                      'Receitas: ' + formatBRL(f.receitas),
                      'Despesas: ' + formatBRL(f.despesas),
                      'Acumulado: ' + formatBRL(f.cumulativo),
                    ];
                  }
                  return [];
                },
              },
            },
          }),
          scales: Object.assign({}, axisOptions(c, mobile), {
            x: Object.assign({}, axisOptions(c, mobile).x, {
              ticks: Object.assign({}, axisOptions(c, mobile).x.ticks, {
                color: function (ctx) {
                  return forecast[ctx.index] && forecast[ctx.index].isCurrent ? c.ice : c.muted2;
                },
                font: function (ctx) {
                  var weight = forecast[ctx.index] && forecast[ctx.index].isCurrent ? '600' : '400';
                  return { family: fontFamily(), size: mobile ? 9 : 11, weight: weight };
                },
              }),
            }),
          }),
        },
      }), canvas.closest('.chart-wrap'));
    });
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
      var projId = document.getElementById('chartPrevisao') ? 'chartPrevisao' : 'chartProjecao';
      initProjecao(projId, payload.forecast);
    }
  }

  window.FinanceCharts = { init: init, destroy: destroy, resize: resize, formatBRL: formatBRL };
})();
