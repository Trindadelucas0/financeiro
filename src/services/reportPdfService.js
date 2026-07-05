const PDFDocument = require('pdfkit');
const { buildMonthlyReport, formatBRL } = require('./reportService');

const PAGE_BOTTOM = 760;
const MARGIN = 48;

function ensureSpace(doc, needed = 60) {
  if (doc.y + needed > PAGE_BOTTOM) {
    doc.addPage();
  }
}

function sectionTitle(doc, title) {
  ensureSpace(doc, 50);
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(title);
  doc.moveDown(0.35);
  doc.font('Helvetica').fontSize(10).fillColor('#333333');
}

function bulletList(doc, items, prefix) {
  items.forEach((item, idx) => {
    ensureSpace(doc, 36);
    const label = prefix ? `${prefix}${idx + 1}. ` : '• ';
    doc.text(`${label}${item}`, { indent: 12, lineGap: 3 });
  });
}

function drawTableHeader(doc, cols) {
  ensureSpace(doc, 24);
  const startX = MARGIN;
  let x = startX;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#444444');
  cols.forEach((col) => {
    doc.text(col.label, x, doc.y, { width: col.width, continued: false });
    x += col.width;
  });
  doc.moveDown(0.2);
  doc.moveTo(startX, doc.y).lineTo(547, doc.y).strokeColor('#cccccc').stroke();
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(9).fillColor('#222222');
}

function drawTableRow(doc, cols, values) {
  ensureSpace(doc, 18);
  const y = doc.y;
  let x = MARGIN;
  values.forEach((val, i) => {
    doc.text(String(val ?? ''), x, y, { width: cols[i].width, lineBreak: false });
    x += cols[i].width;
  });
  doc.moveDown(0.55);
}

async function generateMonthlyReportPdf(userId, mes) {
  const report = await buildMonthlyReport(userId, mes);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const dateStr = report.generatedAt.toLocaleString('pt-BR');

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0a0a0a').text('Home Finanças', { align: 'left' });
    doc.font('Helvetica').fontSize(11).fillColor('#555555')
      .text('Relatório financeiro pessoal', { align: 'left' });
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111').text(report.mesLabel);
    doc.font('Helvetica').fontSize(10).fillColor('#666666')
      .text(`${report.userName} · gerado em ${dateStr}`);

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text('Resumo do mês');
    doc.moveDown(0.4);

    const k = report.kpis;
    const summaryLines = [
      `Receitas: ${formatBRL(k.receitas.total)} (${k.receitas.count} lançamento(s))`,
      `Despesas: ${formatBRL(k.despesas.total)} (${k.despesas.count} lançamento(s))`,
      `Saldo do mês: ${formatBRL(k.saldo.total)}${k.saldo.positivo ? '' : ' (negativo)'}`,
      `Pagamentos: ${report.pagamentos.pctPago.toFixed(0)}% das despesas quitadas`,
      `Compromissos futuros: ${formatBRL(k.saldoDevedor.total)}`,
    ];
    if (report.saldoConta > 0) {
      summaryLines.push(`Saldo em conta (informado): ${formatBRL(report.saldoConta)}`);
    }
    summaryLines.forEach((line) => doc.text(`• ${line}`, { indent: 8, lineGap: 2 }));

    sectionTitle(doc, 'Receitas do mês');
    if (report.receitasItens.length === 0) {
      doc.text('Nenhuma receita neste mês.');
    } else {
      const cols = [
        { label: 'Descrição', width: 200 },
        { label: 'Categoria', width: 120 },
        { label: 'Valor', width: 90 },
        { label: 'Status', width: 90 },
      ];
      drawTableHeader(doc, cols);
      report.receitasItens.forEach((r) => {
        drawTableRow(doc, cols, [r.nome, r.categoria, formatBRL(r.valor), r.status]);
      });
    }

    sectionTitle(doc, 'Despesas do mês');
    if (report.despesasItens.length === 0) {
      doc.text('Nenhuma despesa neste mês.');
    } else {
      const cols = [
        { label: 'Descrição', width: 160 },
        { label: 'Categoria', width: 100 },
        { label: 'Valor', width: 80 },
        { label: 'Status', width: 70 },
        { label: 'Venc.', width: 60 },
      ];
      drawTableHeader(doc, cols);
      report.despesasItens.forEach((d) => {
        drawTableRow(doc, cols, [d.nome, d.categoria, formatBRL(d.valor), d.status, d.vencimento || '—']);
      });
    }

    if (report.categorias.length > 0) {
      sectionTitle(doc, 'Gastos por categoria');
      report.categorias.slice(0, 8).forEach((c) => {
        ensureSpace(doc, 16);
        let line = `${c.categoria}: ${formatBRL(c.valor)}`;
        if (c.orcamento > 0) {
          line += ` (orçamento ${formatBRL(c.orcamento)}${c.overBudget ? ' — acima do limite' : ''})`;
        }
        doc.text(`• ${line}`, { indent: 8 });
      });
    }

    sectionTitle(doc, 'O que melhorar');
    bulletList(
      doc,
      report.improvements.map((i) => i.text),
      '',
    );

    sectionTitle(doc, 'Próximos meses (projeção)');
    const colsF = [
      { label: 'Mês', width: 80 },
      { label: 'Receitas', width: 110 },
      { label: 'Despesas', width: 110 },
      { label: 'Saldo', width: 110 },
    ];
    drawTableHeader(doc, colsF);
    report.forecast.forEach((f) => {
      drawTableRow(doc, colsF, [
        f.mesLabel,
        formatBRL(f.receitas),
        formatBRL(f.despesas),
        formatBRL(f.saldo),
      ]);
    });

    if (report.previsao.length > 0) {
      ensureSpace(doc, 40);
      doc.font('Helvetica').fontSize(9).fillColor('#666666')
        .text(`Saldo acumulado em ${report.previsao[report.previsao.length - 1].mes}: ${formatBRL(report.previsao[report.previsao.length - 1].cumulativo)}`);
    }

    sectionTitle(doc, 'Conselhos para se organizar');
    bulletList(doc, report.advice, '');

    doc.moveDown(1.2);
    ensureSpace(doc, 30);
    doc.font('Helvetica').fontSize(8).fillColor('#888888')
      .text(
        'Relatório gerado automaticamente com base nos lançamentos cadastrados. Não constitui assessoria financeira profissional.',
        { align: 'left', lineGap: 2 },
      );

    doc.end();
  });
}

module.exports = { generateMonthlyReportPdf };
