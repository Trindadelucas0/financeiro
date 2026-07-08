const bcrypt = require('bcryptjs');
const { getPool } = require('../db/pool');
const { signToken } = require('../utils/jwt');
const { mapUser } = require('../services/profileService');
const subscriptionService = require('./subscriptionService');
const userService = require('./userService');
const { getProPlanPricing } = require('../config/plan');
const { canManagePlatform } = require('../config/adminAccess');

function withPlatformAccess(user) {
  return {
    ...user,
    canManagePlatform: canManagePlatform(user),
  };
}

function isEmailIdentifier(value) {
  return String(value || '').includes('@');
}

async function login(identifier, password) {
  const pool = getPool();
  const raw = String(identifier || '').trim();
  const normalized = isEmailIdentifier(raw) ? raw.toLowerCase() : raw.toLowerCase().replace(/^@/, '');

  if (!normalized || !password) {
    const err = new Error('Credenciais inválidas');
    err.status = 401;
    throw err;
  }

  const column = isEmailIdentifier(normalized) ? 'email' : 'username';
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE ${column} = $1 LIMIT 1`,
    [normalized],
  );

  if (rows.length === 0) {
    const err = new Error('Credenciais inválidas');
    err.status = 401;
    throw err;
  }

  const user = rows[0];

  if (!user.ativo) {
    const err = new Error('Usuário desativado');
    err.status = 403;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Credenciais inválidas');
    err.status = 401;
    throw err;
  }

  const payload = {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    nome: user.nome,
  };

  const token = signToken(payload);
  const subscription = subscriptionService.mapSubscription(user);
  const welcomeGrant = subscriptionService.resolveWelcomeGrant(user);

  return {
    token,
    user: withPlatformAccess(mapUser(user)),
    subscription,
    pricing: getProPlanPricing(),
    welcomeGrant,
  };
}

async function register({ nome, email, password, username }) {
  const { user, subscription } = await userService.createUserWithTrial({
    nome,
    email,
    password,
    username,
  });

  const payload = {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    nome: user.nome,
  };

  const token = signToken(payload);

  return {
    token,
    user: withPlatformAccess(user),
    subscription,
    pricing: getProPlanPricing(),
  };
}

async function getMe(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, nome, username, email, role, ativo, created_at, must_change_password,
            plan, subscription_status, subscription_current_period_end, access_grant_type
     FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );

  if (rows.length === 0) {
    const err = new Error('Usuário não encontrado');
    err.status = 404;
    throw err;
  }

  if (!rows[0].ativo) {
    const err = new Error('Usuário desativado');
    err.status = 403;
    throw err;
  }

  return {
    user: withPlatformAccess(mapUser(rows[0])),
    subscription: subscriptionService.mapSubscription(rows[0]),
    pricing: getProPlanPricing(),
  };
}

async function verifyPassword(userId, password) {
  if (!password) {
    const err = new Error('Senha incorreta');
    err.status = 401;
    throw err;
  }

  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT password_hash, ativo FROM users WHERE id = $1 LIMIT 1',
    [userId],
  );

  if (rows.length === 0) {
    const err = new Error('Usuário não encontrado');
    err.status = 404;
    throw err;
  }

  if (!rows[0].ativo) {
    const err = new Error('Usuário desativado');
    err.status = 403;
    throw err;
  }

  const valid = await bcrypt.compare(password, rows[0].password_hash);
  if (!valid) {
    const err = new Error('Senha incorreta');
    err.status = 401;
    throw err;
  }

  return { ok: true };
}

module.exports = { login, register, getMe, verifyPassword };
