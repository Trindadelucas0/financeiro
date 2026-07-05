const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase().replace(/^@/, '');
}

function isValidUsername(username) {
  return USERNAME_RE.test(username);
}

function validateUsername(raw) {
  const username = normalizeUsername(raw);
  if (!isValidUsername(username)) {
    const err = new Error('Username deve ter 3–30 caracteres (a-z, 0-9, _)');
    err.status = 400;
    throw err;
  }
  return username;
}

function usernameFromEmail(email) {
  const local = String(email || '').split('@')[0].toLowerCase();
  let base = local.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (base.length < 3) base = `${base}_usr`.replace(/_+/g, '_').slice(0, 30);
  if (base.length < 3) base = 'user';
  return base.slice(0, 30);
}

async function ensureUniqueUsername(client, base, excludeUserId) {
  let candidate = base.slice(0, 30);
  let n = 1;
  while (true) {
    const params = excludeUserId ? [candidate, excludeUserId] : [candidate];
    const sql = excludeUserId
      ? 'SELECT 1 FROM users WHERE username = $1 AND id <> $2 LIMIT 1'
      : 'SELECT 1 FROM users WHERE username = $1 LIMIT 1';
    const { rows } = await client.query(sql, params);
    if (rows.length === 0) return candidate;
    const suffix = String(n++);
    candidate = `${base.slice(0, Math.max(1, 30 - suffix.length))}${suffix}`;
  }
}

module.exports = {
  normalizeUsername,
  isValidUsername,
  validateUsername,
  usernameFromEmail,
  ensureUniqueUsername,
};
