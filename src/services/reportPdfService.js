const PDFDocument = require('pdfkit');
const { formatBRL } = require('./reportService');
const {
  COLORS,
  drawGroupedBarChart,
  drawHorizontalBars,
  drawPaymentSplit,
  drawLineForecast,
  drawBudgetBars,
} = require('./reportPdfCharts');

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 40;
const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

let pageCount = 0;

function resetPageState() {
  pageCount = 0;
}

function resetTextCursor(doc, y = doc.y) {
  doc.x = MARGIN;
  doc.y = y;
}

function ensureSpace(doc, needed = 60) {
  if (doc.y + needed > PAGE_BOTTOM) {
    doc.addPage();
    pageCount += 1;
    doc.y = MARGIN;
    resetTextCursor(doc, MARGIN);
  }
}

function drawContinuationBand(doc, report) {
  const bandH = 28;
  doc.save();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.black)
    .text('Home Finanças', MARGIN, MARGIN);
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
    .text(report.mesLabel, MARGIN + 200, MARGIN, { width: CONTENT_WIDTH - 200, align: 'right' });
  doc.moveTo(MARGIN, MARGIN + bandH - 4)
    .lineTo(PAGE_WIDTH - MARGIN, MARGIN + bandH - 4)
    .strokeColor(COLORS.border).stroke();
  doc.restore();
  doc.y = MARGIN + bandH;
  resetTextCursor(doc, doc.y);
}

function drawHeaderBand(doc, report) {
  const dateStr = report.generatedAt.toLocaleString('pt-BR');
  const bandH = 72;

  doc.save();
  doc.rect(0, 0, PAGE_WIDTH, bandH).fill(COLORS.black);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(16)
    .text('Home Finanças', MARGIN, 18);
  doc.font('Helvetica').fontSize(9).fillColor('#cccccc')
    .text('Relatório financeiro pessoal', MARGIN, 38);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.white)
    .text(report.mesLabel, MARGIN, 52);
  doc.font('Helvetica').fontSize(8).fillColor('#aaaaaa')
    .text(`${report.userName} · ${dateStr}`, MARGIN + 280, 54, { width: 220, align: 'right' });
  doc.restore();

  doc.y = bandH + 16;
}

function drawKpiCards(doc, report) {
  const k = report.kpis;
  const cardW = (CONTENT_WIDTH - 18) / 4;
  const cardH = 58;
  const startY = doc.y;
  const cards = [
    {
      label: 'Receitas',
      value: formatBRL(k.receitas.total),
      delta: k.receitas.delta?.text || '',
      color: COLORS.green,
    },
    {
      label: 'Despesas',
      value: formatBRL(k.despesas.total),
      delta: k.despesas.delta?.text || '',
      color: COLORS.red,
    },
    {
      label: 'Saldo',
      value: formatBRL(k.saldo.total),
      delta: k.saldo.delta?.text || '',
      color: k.saldo.positivo ? COLORS.green : COLORS.red,
    },
    {
      label: 'Quitado',
      value: `${report.pagamentos.pctPago.toFixed(0)}%`,
      delta: `${report.pagamentos.pendCount} pendente(s)`,
      color: COLORS.black,
    },
  ];

  cards.forEach((card, i) => {
    const x = MARGIN + i * (cardW + 6);
    doc.save();
    doc.roundedRect(x, startY, cardW, cardH, 4).fillColor(COLORS.light).fill();
    doc.strokeColor(COLORS.border).roundedRect(x, startY, cardW, cardH, 4).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(card.label, x + 8, startY + 8);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(card.color)
      .text(card.value, x + 8, startY + 22, { width: cardW - 16 });
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
      .text(card.delta, x + 8, startY + 42, { width: cardW - 16, ellipsis: true });
    doc.restore();
  });

  doc.y = startY + cardH + 14;
}

function drawExecutiveBox(doc, report) {
  const insights = report.aiInsights || {};
  const title = report.aiEnabled ? 'Resumo executivo' : 'Resumo do mês';
  const text = insights.resumoExecutivo || '';
  doc.font('Helvetica').fontSize(9);
  const textH = doc.heightOfString(text, { width: CONTENT_WIDTH - 20, lineGap: 2 });
  const boxH = Math.max(40, textH + 20);

  ensureSpace(doc, boxH + 36);
  resetTextCursor(doc);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.black).text(title);
  doc.moveDown(0.3);
  doc.save();
  const boxY = doc.y;
  doc.roundedRect(MARGIN, boxY, CONTENT_WIDTH, boxH, 4).fillColor('#f0f9ff').fill();
  doc.strokeColor('#bfdbfe').roundedRect(MARGIN, boxY, CONTENT_WIDTH, boxH, 4).stroke();
  doc.fillColor('#1e3a5f').font('Helvetica').fontSize(9)
    .text(text, MARGIN + 10, boxY + 10, { width: CONTENT_WIDTH - 20, lineGap: 2 });
  doc.restore();
  doc.y = boxY + boxH + 8;
  resetTextCursor(doc, doc.y);

  if (report.aiEnabled && insights.generatedAt) {
    const genDate = new Date(insights.generatedAt).toLocaleString('pt-BR');
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
      .text(`Análise gerada em ${genDate} — válida por 24h`, MARGIN, doc.y);
    doc.moveDown(0.6);
    resetTextCursor(doc, doc.y);
  }
}

function sectionTitle(doc, title) {
  ensureSpace(doc, 44);
  resetTextCursor(doc);
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.black).text(title, MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.25);
  doc.moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y).strokeColor(COLORS.border).stroke();
  doc.moveDown(0.35);
  doc.font('Helvetica').fontSize(9).fillColor('#333333');
}

function drawTable(doc, cols, rows, emptyMsg) {
  if (!rows.length) {
    doc.text(emptyMsg || 'Nenhum registro.');
    doc.moveDown(0.4);
    return;
  }

  const drawHeader = () => {
    ensureSpace(doc, 28);
    resetTextCursor(doc);
    const headerY = doc.y;
    let x = MARGIN;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#444444');
    cols.forEach((col) => {
      doc.text(col.label, x, headerY, { width: col.width });
      x += col.width;
    });
    doc.y = headerY + 14;
    doc.moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y).strokeColor(COLORS.border).stroke();
    doc.moveDown(0.2);
    resetTextCursor(doc, doc.y);
  };

  drawHeader();

  rows.forEach((values, rowIdx) => {
    const cellHeights = values.map((val, i) => doc.heightOfString(String(val ?? ''), {
      width: cols[i].width,
      align: cols[i].align || 'left',
    }));
    const rowH = Math.max(...cellHeights, 10) + 6;
    const prevY = doc.y;
    ensureSpace(doc, rowH + 4);
    if (doc.y === MARGIN && prevY !== MARGIN) {
      drawHeader();
    }

    const rowY = doc.y;
    if (rowIdx % 2 === 1) {
      doc.save();
      doc.rect(MARGIN, rowY - 2, CONTENT_WIDTH, rowH + 2).fillColor(COLORS.light).fill();
      doc.restore();
    }

    let x = MARGIN;
    doc.font('Helvetica').fontSize(8).fillColor('#222222');
    values.forEach((val, i) => {
      doc.text(String(val ?? ''), x, rowY, {
        width: cols[i].width,
        align: cols[i].align || 'left',
        lineGap: 1,
      });
      x += cols[i].width;
    });
    doc.y = rowY + rowH;
  });
  doc.moveDown(0.4);
}

function bulletList(doc, items) {
  (items || []).forEach((item) => {
    ensureSpace(doc, 28);
    doc.text(`• ${item}`, { indent: 10, lineGap: 2 });
  });
  doc.moveDown(0.3);
}

function drawCenteredFooterLine(doc, text, y) {
  const w = doc.widthOfString(text);
  doc.text(text, (PAGE_WIDTH - w) / 2, y, { lineBreak: false });
}

function drawPageFooters(doc) {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  const disclaimer1 = 'Relatório gerado automaticamente com base nos lançamentos cadastrados.';
  const disclaimer2 = 'Não constitui assessoria financeira profissional.';

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.save();
    const pageNum = i - range.start + 1;
    doc.font('Helvetica').fontSize(7).fillColor('#999999');
    drawCenteredFooterLine(doc, `Página ${pageNum} de ${totalPages} · Home Finanças`, PAGE_HEIGHT - 36);
    drawCenteredFooterLine(doc, disclaimer1, PAGE_HEIGHT - 26);
    drawCenteredFooterLine(doc, disclaimer2, PAGE_HEIGHT - 18);
    doc.restore();
  }
}

function generateMonthlyReportPdf(report) {
  resetPageState();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    pageCount = 1;

    // —— Página 1: visão geral ——
    drawHeaderBand(doc, report);
    drawKpiCards(doc, report);
    drawExecutiveBox(doc, report);

    const fluxoY = doc.y;
    drawGroupedBarChart(doc, MARGIN, fluxoY, CONTENT_WIDTH, 130, report.charts.fluxo);
    resetTextCursor(doc, fluxoY + 150);

    // —— Página 2: composição ——
    doc.addPage();
    pageCount += 1;
    doc.y = MARGIN;
    drawContinuationBand(doc, report);
    sectionTitle(doc, 'Composição e pagamentos');

    const catEndY = drawHorizontalBars(doc, MARGIN, doc.y, CONTENT_WIDTH, 160, report.charts.categorias);
    resetTextCursor(doc, catEndY + 8);

    const payEndY = drawPaymentSplit(doc, MARGIN, doc.y, CONTENT_WIDTH, 80, report.charts.pagamentos);
    resetTextCursor(doc, payEndY + 8);

    const lineEndY = drawLineForecast(doc, MARGIN, doc.y, CONTENT_WIDTH, 110, report.charts.forecast);
    resetTextCursor(doc, lineEndY + 8);

    sectionTitle(doc, 'Projeção mensal');
    drawTable(
      doc,
      [
        { label: 'Mês', width: 70 },
        { label: 'Receitas', width: 115, align: 'right' },
        { label: 'Despesas', width: 115, align: 'right' },
        { label: 'Saldo', width: 115, align: 'right' },
      ],
      report.forecast.map((f) => [
        f.mesLabel,
        formatBRL(f.receitas),
        formatBRL(f.despesas),
        formatBRL(f.saldo),
      ]),
      'Sem projeção disponível.',
    );

    // —— Página 3: lançamentos ——
    doc.addPage();
    pageCount += 1;
    doc.y = MARGIN;
    drawContinuationBand(doc, report);
    sectionTitle(doc, 'Alertas e pendências');

    if (report.alerts?.length) {
      bulletList(doc, report.alerts.map((a) => a.text));
    } else {
      doc.text('Nenhum alerta ativo neste mês.');
      doc.moveDown(0.4);
    }

    if (report.atrasados.length > 0) {
      sectionTitle(doc, 'Pagamentos em atraso');
      drawTable(
        doc,
        [
          { label: 'Descrição', width: 200 },
          { label: 'Mês', width: 80 },
          { label: 'Valor', width: 100, align: 'right' },
        ],
        report.atrasados.map((a) => [a.nome, a.mesLabel, formatBRL(a.valor)]),
      );
    }

    if (report.vencimentosProximos?.length > 0) {
      sectionTitle(doc, 'Vencimentos nos próximos 5 dias');
      drawTable(
        doc,
        [
          { label: 'Descrição', width: 220 },
          { label: 'Dias', width: 60, align: 'right' },
          { label: 'Valor', width: 100, align: 'right' },
        ],
        report.vencimentosProximos.map((v) => [
          v.nome,
          String(v.diff),
          formatBRL(v.valor),
        ]),
      );
    }

    sectionTitle(doc, 'Receitas do mês');
    drawTable(
      doc,
      [
        { label: 'Descrição', width: 170 },
        { label: 'Categoria', width: 110 },
        { label: 'Valor', width: 90, align: 'right' },
        { label: 'Status', width: 80 },
      ],
      report.receitasItens.map((r) => [r.nome, r.categoria, formatBRL(r.valor), r.status]),
      'Nenhuma receita neste mês.',
    );

    sectionTitle(doc, 'Despesas do mês');
    drawTable(
      doc,
      [
        { label: 'Descrição', width: 140 },
        { label: 'Categoria', width: 90 },
        { label: 'Valor', width: 80, align: 'right' },
        { label: 'Status', width: 70 },
        { label: 'Venc.', width: 55 },
      ],
      report.despesasItens.map((d) => [
        d.nome,
        d.categoria,
        formatBRL(d.valor),
        d.status,
        d.vencimento || '—',
      ]),
      'Nenhuma despesa neste mês.',
    );

    // —— Página 4: orçamentos e análise ——
    doc.addPage();
    pageCount += 1;
    doc.y = MARGIN;
    drawContinuationBand(doc, report);

    const budgetEndY = drawBudgetBars(doc, MARGIN, doc.y, CONTENT_WIDTH, report.categorias);
    resetTextCursor(doc, budgetEndY + 12);

    if (report.saldoConta > 0) {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
        .text(`Saldo em conta informado: ${formatBRL(report.saldoConta)}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
      doc.moveDown(0.5);
      resetTextCursor(doc, doc.y);
    }

    if (report.previsao.length > 0) {
      const last = report.previsao[report.previsao.length - 1];
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
        .text(`Saldo acumulado projetado (${last.mes}): ${formatBRL(last.cumulativo)}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
      doc.moveDown(0.8);
      resetTextCursor(doc, doc.y);
    }

    const insights = report.aiInsights || {};
    sectionTitle(doc, report.aiEnabled ? 'Pontos de atenção' : 'O que melhorar');
    bulletList(doc, insights.pontosAtencao || report.improvements.map((i) => i.text));

    sectionTitle(doc, report.aiEnabled ? 'Plano de ação' : 'Conselhos para se organizar');
    bulletList(doc, insights.planoAcao || report.advice);

    drawPageFooters(doc);
    doc.end();
  });
}

module.exports = { generateMonthlyReportPdf };
