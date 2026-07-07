const COLORS = {
  black: '#0a0a0a',
  green: '#22c55e',
  red: '#ef4444',
  blue: '#3b82f6',
  muted: '#666666',
  light: '#f7f7f7',
  border: '#e5e5e5',
  white: '#ffffff',
};

function formatShortBRL(v) {
  const n = Number(v) || 0;
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(1)}k`;
  return `R$ ${n.toFixed(0)}`;
}

function chartTitle(doc, x, y, title) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.black).text(title, x, y);
  return y + 16;
}

function drawGroupedBarChart(doc, x, y, w, h, fluxo) {
  let cy = chartTitle(doc, x, y, 'Fluxo mensal — receitas vs despesas');
  const chartY = cy + 4;
  const chartH = h - 20;
  const barW = Math.min(18, (w - 40) / (fluxo.length * 2.5));
  const gap = barW * 0.4;
  const groupW = barW * 2 + gap;
  const maxVal = Math.max(
    1,
    ...fluxo.flatMap((f) => [f.receitas, f.despesas]),
  );

  doc.save();
  doc.rect(x, chartY, w, chartH).fillColor(COLORS.light).fill();
  doc.strokeColor(COLORS.border).lineWidth(0.5).rect(x, chartY, w, chartH).stroke();

  const baseY = chartY + chartH - 18;
  fluxo.forEach((f, i) => {
    const gx = x + 20 + i * (groupW + 8);
    const recH = (f.receitas / maxVal) * (chartH - 28);
    const despH = (f.despesas / maxVal) * (chartH - 28);
    doc.fillColor(COLORS.green).rect(gx, baseY - recH, barW, recH).fill();
    doc.fillColor(COLORS.red).rect(gx + barW + gap, baseY - despH, barW, despH).fill();
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
      .text(f.mesLabel, gx - 2, baseY + 2, { width: groupW + 4, align: 'center' });
  });

  doc.font('Helvetica').fontSize(7).fillColor(COLORS.green).text('■ Receitas', x + 8, chartY + 6);
  doc.fillColor(COLORS.red).text('■ Despesas', x + 70, chartY + 6);
  doc.restore();
  doc.x = x;

  return chartY + chartH + 8;
}

function drawHorizontalBars(doc, x, y, w, h, categorias) {
  let cy = chartTitle(doc, x, y, 'Gastos por categoria');
  const items = categorias.filter((c) => c.valor > 0);
  if (items.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text('Sem despesas no mês.', x, cy + 4);
    doc.x = x;
    return cy + 24;
  }

  const maxVal = Math.max(...items.map((c) => c.valor), 1);
  const barH = 12;
  const rowH = 22;
  let rowY = cy + 6;

  items.forEach((c) => {
    const barW = ((w - 120) * c.valor) / maxVal;
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.black)
      .text(c.label, x, rowY, { width: 72, ellipsis: true });
    doc.fillColor(COLORS.border).rect(x + 76, rowY + 2, w - 120, barH).fill();
    doc.fillColor(COLORS.blue).rect(x + 76, rowY + 2, Math.max(barW, 2), barH).fill();
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
      .text(formatShortBRL(c.valor), x + w - 40, rowY, { width: 40, align: 'right' });
    rowY += rowH;
  });

  doc.x = x;
  return rowY + 4;
}

function drawPaymentSplit(doc, x, y, w, h, pagamentos) {
  let cy = chartTitle(doc, x, y, 'Pagamentos do mês');
  const { pagoVal, pendenteVal, pctPago } = pagamentos;
  const total = pagoVal + pendenteVal;
  if (total <= 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text('Sem despesas cadastradas.', x, cy + 4);
    doc.x = x;
    return cy + 24;
  }

  const barY = cy + 10;
  const barH = 20;
  const pagoW = (w - 4) * (pagoVal / total);
  doc.fillColor(COLORS.green).rect(x, barY, pagoW, barH).fill();
  doc.fillColor(COLORS.red).rect(x + pagoW, barY, w - pagoW, barH).fill();
  doc.strokeColor(COLORS.border).rect(x, barY, w, barH).stroke();

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.black)
    .text(`${pctPago.toFixed(0)}% quitado`, x, barY + barH + 8);
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
    .text(`Pago: ${formatShortBRL(pagoVal)}  ·  Pendente: ${formatShortBRL(pendenteVal)}`, x, barY + barH + 24);

  doc.x = x;
  return barY + barH + 44;
}

function drawLineForecast(doc, x, y, w, h, forecast) {
  let cy = chartTitle(doc, x, y, 'Projeção de saldo (6 meses)');
  const chartY = cy + 4;
  const chartH = h - 8;
  const padX = 24;
  const padY = 16;
  const innerW = w - padX * 2;
  const innerH = chartH - padY * 2;

  const saldos = forecast.map((f) => f.saldo);
  const maxAbs = Math.max(...saldos.map(Math.abs), 1);
  const minS = Math.min(...saldos, 0);
  const maxS = Math.max(...saldos, 0);
  const range = maxS - minS || maxAbs * 2;
  const zeroY = chartY + padY + innerH * (maxS / range);

  doc.save();
  doc.rect(x, chartY, w, chartH).fillColor(COLORS.light).fill();
  doc.strokeColor(COLORS.border).rect(x, chartY, w, chartH).stroke();

  if (minS < 0 && maxS > 0) {
    doc.strokeColor('#cccccc').dash(3, { space: 3 })
      .moveTo(x + padX, zeroY).lineTo(x + w - padX, zeroY).stroke();
    doc.undash();
  }

  const stepX = innerW / Math.max(forecast.length - 1, 1);
  const points = forecast.map((f, i) => {
    const px = x + padX + i * stepX;
    const py = chartY + padY + innerH * (1 - (f.saldo - minS) / range);
    return { px, py, f };
  });

  doc.strokeColor(COLORS.black).lineWidth(1.5);
  points.forEach((p, i) => {
    if (i === 0) doc.moveTo(p.px, p.py);
    else doc.lineTo(p.px, p.py);
  });
  doc.stroke();

  points.forEach((p) => {
    const color = p.f.saldo >= 0 ? COLORS.green : COLORS.red;
    doc.fillColor(color).circle(p.px, p.py, 3).fill();
    doc.font('Helvetica').fontSize(6).fillColor(COLORS.muted)
      .text(p.f.mesLabel, p.px - 14, chartY + chartH - 12, { width: 28, align: 'center' });
  });

  doc.restore();
  return chartY + chartH + 8;
}

function drawBudgetBars(doc, x, y, w, categorias) {
  let cy = chartTitle(doc, x, y, 'Orçamento vs gasto');
  const withBudget = categorias.filter((c) => c.orcamento > 0);
  if (withBudget.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
      .text('Nenhum orçamento definido para este mês.', x, cy + 4);
    doc.x = x;
    return cy + 24;
  }

  const barH = 10;
  const rowH = 20;
  let rowY = cy + 6;

  withBudget.slice(0, 10).forEach((c) => {
    const pct = Math.min((c.valor / c.orcamento) * 100, 150);
    const barMaxW = w - 140;
    const barW = (barMaxW * pct) / 100;
    const color = c.overBudget ? COLORS.red : pct >= 80 ? '#f59e0b' : COLORS.green;

    doc.font('Helvetica').fontSize(8).fillColor(COLORS.black)
      .text(c.categoria, x, rowY, { width: 68, ellipsis: true });
    doc.fillColor(COLORS.border).rect(x + 72, rowY + 2, barMaxW, barH).fill();
    doc.fillColor(color).rect(x + 72, rowY + 2, Math.max(barW, 2), barH).fill();
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
      .text(`${pct.toFixed(0)}%`, x + w - 60, rowY, { width: 28, align: 'right' });
    doc.text(formatShortBRL(c.valor), x + w - 30, rowY, { width: 30, align: 'right' });
    rowY += rowH;
  });

  doc.x = x;
  return rowY + 4;
}

module.exports = {
  COLORS,
  drawGroupedBarChart,
  drawHorizontalBars,
  drawPaymentSplit,
  drawLineForecast,
  drawBudgetBars,
};
