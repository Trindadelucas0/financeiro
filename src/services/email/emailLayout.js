function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderEmailLayout({ preheader, title, bodyHtml, ctaLabel, ctaUrl, footerNote, appUrl }) {
  const preheaderText = esc(preheader || title || '');
  const safeTitle = esc(title || 'Home Finanças');
  const safeFooter = esc(footerNote || 'Home Finanças — controle financeiro pessoal');
  const safeAppUrl = esc(appUrl || 'https://cashome.avadesk.com.br');

  const ctaBlock = ctaLabel && ctaUrl
    ? `<tr>
        <td style="padding:28px 32px 8px;text-align:center;">
          <a href="${esc(ctaUrl)}" style="display:inline-block;background:#22c55e;color:#0a0f0d;font-weight:600;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:10px;">
            ${esc(ctaLabel)}
          </a>
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#0a0f0d;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e8edf2;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheaderText}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0f0d;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#121820;border:1px solid #243041;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 12px;text-align:center;border-bottom:1px solid #243041;">
              <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#22c55e;">Home Finanças</div>
              <h1 style="margin:12px 0 0;font-size:24px;line-height:1.3;color:#f3f7fb;">${safeTitle}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px;font-size:15px;line-height:1.65;color:#c5d0db;">
              ${bodyHtml}
            </td>
          </tr>
          ${ctaBlock}
          <tr>
            <td style="padding:24px 32px 28px;text-align:center;font-size:12px;line-height:1.5;color:#7b8a99;">
              ${safeFooter}<br>
              <a href="${safeAppUrl}" style="color:#9ee6b8;text-decoration:none;">${safeAppUrl}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { esc, renderEmailLayout };
