const fs = require('fs');
const path = require('path');
const { getProPlanPricing } = require('../config/plan');

const LANDING_SHOTS_DIR = path.join(__dirname, '../../public/images/landing');

function getAppUrl() {
  const port = process.env.PORT || 3001;
  return (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, '');
}

function landingShot(name) {
  const base = path.join(LANDING_SHOTS_DIR, name);
  for (const ext of ['.webp', '.png', '.jpg']) {
    if (fs.existsSync(base + ext)) {
      return `/images/landing/${name}${ext}`;
    }
  }
  return null;
}

function loginPage(req, res) {
  res.render('auth/login', { title: 'Login' });
}

function appDashboard(req, res) {
  res.render('app/dashboard', { title: 'Dashboard', activeTab: 'dashboard' });
}

function appReceitas(req, res) {
  res.render('app/receitas', { title: 'Receitas', activeTab: 'receitas' });
}

function appDespesas(req, res) {
  res.render('app/despesas', { title: 'Despesas', activeTab: 'despesas' });
}

function appCompromissos(req, res) {
  res.render('app/compromissos', { title: 'Parcelas & Empréstimos', activeTab: 'compromissos' });
}

function appOrcamentos(req, res) {
  res.render('app/orcamentos', { title: 'Orçamentos', activeTab: 'orcamentos' });
}

function appPrevisao(req, res) {
  res.render('app/previsao', { title: 'Previsão', activeTab: 'previsao' });
}

function appPerfil(req, res) {
  res.render('app/perfil', { title: 'Conta', activeTab: 'perfil' });
}

function adminUsers(req, res) {
  res.render('admin/users', { title: 'Usuários — Admin' });
}

function adminClients(req, res) {
  res.render('admin/clients', { title: 'Clientes manuais — Admin' });
}

function landingPage(req, res) {
  const ogImagePath = landingShot('og-cover') || '/images/logo-home-financas.png';

  res.render('landing/index', {
    title: 'Home Finanças',
    appUrl: getAppUrl(),
    ogImage: `${getAppUrl()}${ogImagePath}`,
    pricing: getProPlanPricing(),
  });
}

function redirectApp(req, res) {
  res.redirect('/app/dashboard');
}

function notFoundPage(req, res) {
  res.status(404).render('errors/not-found', { title: 'Página não encontrada' });
}

module.exports = {
  loginPage,
  appDashboard,
  appReceitas,
  appDespesas,
  appCompromissos,
  appOrcamentos,
  appPrevisao,
  appPerfil,
  adminUsers,
  adminClients,
  landingPage,
  redirectApp,
  notFoundPage,
};
