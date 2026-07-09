const { esc, renderEmailLayout } = require('./emailLayout');

function firstName(nome) {
  const parts = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return parts[0] || 'você';
}

function credentialsTemplate({ nome, email, username, tempPassword, appUrl }) {
  const name = firstName(nome);
  const loginUrl = `${appUrl}/login`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Olá, <strong style="color:#f3f7fb;">${esc(name)}</strong>.</p>
    <p style="margin:0 0 16px;">Seu pagamento foi confirmado e sua conta no Home Finanças está pronta. Use os dados abaixo para entrar:</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;background:#0d1218;border:1px solid #243041;border-radius:12px;">
      <tr><td style="padding:14px 16px;font-size:13px;color:#7b8a99;">E-mail</td></tr>
      <tr><td style="padding:0 16px 14px;font-size:15px;color:#f3f7fb;font-family:Consolas,Monaco,monospace;">${esc(email)}</td></tr>
      <tr><td style="padding:14px 16px 0;font-size:13px;color:#7b8a99;">Usuário</td></tr>
      <tr><td style="padding:0 16px 14px;font-size:15px;color:#f3f7fb;font-family:Consolas,Monaco,monospace;">@${esc(username)}</td></tr>
      <tr><td style="padding:14px 16px 0;font-size:13px;color:#7b8a99;">Senha temporária</td></tr>
      <tr><td style="padding:0 16px 14px;font-size:15px;color:#fbbf24;font-family:Consolas,Monaco,monospace;">${esc(tempPassword)}</td></tr>
    </table>
    <p style="margin:0;">Por segurança, altere sua senha no primeiro acesso em <strong style="color:#f3f7fb;">Meu perfil</strong>.</p>`;

  return {
    subject: 'Suas credenciais de acesso — Home Finanças',
    preheader: `Login: @${username} — senha temporária enviada`,
    html: renderEmailLayout({
      preheader: `Suas credenciais de acesso — @${username}`,
      title: 'Conta criada com sucesso',
      bodyHtml,
      ctaLabel: 'Entrar no app',
      ctaUrl: loginUrl,
      appUrl,
    }),
  };
}

function welcomeTemplate({ nome, appUrl }) {
  const name = firstName(nome);
  const dashboardUrl = `${appUrl}/app/dashboard`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Olá, <strong style="color:#f3f7fb;">${esc(name)}</strong>.</p>
    <p style="margin:0 0 16px;">Bem-vindo(a) ao <strong style="color:#f3f7fb;">Home Finanças</strong>. A partir de agora você pode:</p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#c5d0db;">
      <li style="margin-bottom:8px;">Registrar receitas, despesas e empréstimos</li>
      <li style="margin-bottom:8px;">Acompanhar saldo, orçamentos e previsões</li>
      <li style="margin-bottom:8px;">Gerar relatórios em PDF com análise inteligente</li>
    </ul>
    <p style="margin:0;">Estamos felizes em ter você conosco. Qualquer dúvida, fale com nosso suporte.</p>`;

  return {
    subject: 'Bem-vindo(a) ao Home Finanças',
    preheader: 'Sua conta está pronta para organizar suas finanças',
    html: renderEmailLayout({
      preheader: 'Bem-vindo(a) ao Home Finanças',
      title: 'Boas-vindas!',
      bodyHtml,
      ctaLabel: 'Abrir dashboard',
      ctaUrl: dashboardUrl,
      appUrl,
    }),
  };
}

function reportPdfTemplate({ nome, mesLabel, appUrl }) {
  const name = firstName(nome);
  const dashboardUrl = `${appUrl}/app/dashboard`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Olá, <strong style="color:#f3f7fb;">${esc(name)}</strong>.</p>
    <p style="margin:0 0 16px;">Seu relatório financeiro de <strong style="color:#f3f7fb;">${esc(mesLabel)}</strong> foi gerado e está em anexo neste e-mail.</p>
    <p style="margin:0 0 16px;">O PDF inclui resumo do mês, gráficos, categorias, pendências e insights quando disponíveis.</p>
    <p style="margin:0;">Você também pode gerar um novo relatório a qualquer momento pelo botão <strong style="color:#f3f7fb;">Relatório PDF</strong> no app.</p>`;

  return {
    subject: `Relatório financeiro — ${mesLabel}`,
    preheader: `Relatório de ${mesLabel} em anexo`,
    html: renderEmailLayout({
      preheader: `Relatório financeiro de ${mesLabel}`,
      title: 'Relatório em anexo',
      bodyHtml,
      ctaLabel: 'Ver no app',
      ctaUrl: dashboardUrl,
      appUrl,
    }),
  };
}

function subscriptionExpiredTemplate({
  nome,
  appUrl,
  isTrial,
  trialDays,
  accessDays,
  priceShort,
}) {
  const name = firstName(nome);
  const perfilUrl = `${appUrl}/app/perfil`;
  const expiredLine = isTrial
    ? `Seu período de teste de <strong style="color:#f3f7fb;">${trialDays} dias</strong> terminou.`
    : `Seu acesso de <strong style="color:#f3f7fb;">${accessDays} dias</strong> terminou.`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Olá, <strong style="color:#f3f7fb;">${esc(name)}</strong>.</p>
    <p style="margin:0 0 16px;">${expiredLine}</p>
    <p style="margin:0 0 16px;">Para continuar usando o dashboard completo, relatórios em PDF e previsões, renove seu acesso por apenas <strong style="color:#f3f7fb;">${esc(priceShort)}</strong> por ${accessDays} dias.</p>
    <p style="margin:0;">Seus dados continuam salvos — basta renovar para voltar a usar tudo.</p>`;

  return {
    subject: 'Seu acesso ao Home Finanças expirou',
    preheader: isTrial ? 'Seu período de teste terminou' : 'Renove seu acesso ao Home Finanças',
    html: renderEmailLayout({
      preheader: 'Seu acesso ao Home Finanças expirou',
      title: 'Acesso expirado',
      bodyHtml,
      ctaLabel: 'Renovar acesso',
      ctaUrl: perfilUrl,
      appUrl,
    }),
  };
}

const EMAIL_LAYOUTS = ['credentials', 'welcome', 'reportPdf', 'subscriptionExpired'];

module.exports = {
  EMAIL_LAYOUTS,
  credentialsTemplate,
  welcomeTemplate,
  reportPdfTemplate,
  subscriptionExpiredTemplate,
};
