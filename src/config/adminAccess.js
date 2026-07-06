const { loadEnv } = require('./env');

let cachedAdminEmail = null;

function getAdminEmail() {
  if (!cachedAdminEmail) {
    cachedAdminEmail = loadEnv().admin.email;
  }
  return cachedAdminEmail;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEnvAdminEmail(email) {
  return normalizeEmail(email) === getAdminEmail();
}

function canManagePlatform(user) {
  if (!user) return false;
  return user.role === 'admin' && isEnvAdminEmail(user.email);
}

module.exports = {
  isEnvAdminEmail,
  canManagePlatform,
};
