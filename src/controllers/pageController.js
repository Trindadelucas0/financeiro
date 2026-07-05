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
  res.render('app/perfil', { title: 'Meu perfil', activeTab: 'perfil' });
}

function adminUsers(req, res) {
  res.render('admin/users', { title: 'Usuários — Admin' });
}

function redirectHome(req, res) {
  res.redirect('/login');
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
  redirectHome,
  redirectApp,
  notFoundPage,
};
