const { Resend } = require('resend');
const { loadEnv } = require('../config/env');
const {
  credentialsTemplate,
  welcomeTemplate,
  reportPdfTemplate,
  EMAIL_LAYOUTS,
} = require('./email/templates');

let resendClient = null;
let configCache = null;

function resetConfigCache() {
  configCache = null;
  resendClient = null;
}

function getConfig() {
  if (!configCache) {
    configCache = loadEnv();
  }
  return configCache;
}

function getClient() {
  const config = getConfig();
  if (!config.resend.enabled) return null;
  if (!resendClient) {
    resendClient = new Resend(config.resend.apiKey);
  }
  return resendClient;
}

function assertEnabled() {
  const config = getConfig();
  if (!config.resend.enabled) {
    const err = new Error('Resend não configurado (RESEND_API_KEY ausente)');
    err.status = 503;
    throw err;
  }
}

async function sendEmail({ to, subject, html, attachments, from }) {
  assertEnabled();
  const config = getConfig();
  const client = getClient();

  const payload = {
    from: from || config.resend.from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((item) => ({
      filename: item.filename,
      content: item.content,
    }));
  }

  const { data, error } = await client.emails.send(payload);
  if (error) {
    const err = new Error(error.message || 'Falha ao enviar e-mail');
    err.status = 502;
    err.details = error;
    throw err;
  }

  return data;
}

async function sendCredentialsEmail({ to, nome, email, username, tempPassword }) {
  const config = getConfig();
  const template = credentialsTemplate({
    nome,
    email,
    username,
    tempPassword,
    appUrl: config.appUrl,
  });

  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
  });
}

async function sendWelcomeEmail({ to, nome }) {
  const config = getConfig();
  const template = welcomeTemplate({ nome, appUrl: config.appUrl });

  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
  });
}

async function sendReportPdfEmail({ to, nome, mes, mesLabel, pdfBuffer }) {
  const config = getConfig();
  const template = reportPdfTemplate({
    nome,
    mesLabel: mesLabel || mes,
    appUrl: config.appUrl,
  });

  const safeMes = String(mes || 'relatorio').replace(/[^\d-]/g, '') || 'relatorio';

  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    attachments: [{
      filename: `relatorio-financeiro-${safeMes}.pdf`,
      content: pdfBuffer,
    }],
  });
}

async function sendLayoutPreview({ layout, to, sampleData, from }) {
  const config = getConfig();
  const data = sampleData || {};
  let template;
  let attachments;

  if (layout === 'credentials') {
    template = credentialsTemplate({
      nome: data.nome || 'Lucas Rodrigues',
      email: data.email || to,
      username: data.username || 'lucasrodrigues',
      tempPassword: data.tempPassword || 'Lucas2026!',
      appUrl: config.appUrl,
    });
  } else if (layout === 'welcome') {
    template = welcomeTemplate({
      nome: data.nome || 'Lucas Rodrigues',
      appUrl: config.appUrl,
    });
  } else if (layout === 'reportPdf') {
    template = reportPdfTemplate({
      nome: data.nome || 'Lucas Rodrigues',
      mesLabel: data.mesLabel || 'Julho de 2026',
      appUrl: config.appUrl,
    });
    if (data.pdfBuffer) {
      attachments = [{
        filename: `relatorio-financeiro-${data.mes || '2026-07'}.pdf`,
        content: data.pdfBuffer,
      }];
    }
  } else {
    const err = new Error(`Layout de e-mail desconhecido: ${layout}`);
    err.status = 400;
    throw err;
  }

  return sendEmail({
    to,
    subject: `[Teste] ${template.subject}`,
    html: template.html,
    attachments,
    from,
  });
}

async function verifyResendConnection() {
  assertEnabled();
  const client = getClient();
  const { data, error } = await client.domains.list();
  if (error) {
    const err = new Error(error.message || 'Falha ao validar Resend');
    err.status = error.statusCode || 502;
    err.details = error;
    throw err;
  }
  return data;
}

async function sendAllLayoutPreviews(to, sampleData, options = {}) {
  const results = [];

  for (const layout of EMAIL_LAYOUTS) {
    const result = await sendLayoutPreview({
      layout,
      to,
      sampleData,
      from: options.from,
    });
    results.push({ layout, id: result?.id || null });
  }

  return results;
}

module.exports = {
  EMAIL_LAYOUTS,
  resetConfigCache,
  verifyResendConnection,
  sendEmail,
  sendCredentialsEmail,
  sendWelcomeEmail,
  sendReportPdfEmail,
  sendLayoutPreview,
  sendAllLayoutPreviews,
};
