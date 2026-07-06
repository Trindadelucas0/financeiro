#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { getPool } = require('../src/db/pool');

const SEED_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@local.dev').toLowerCase();

async function main() {
  const pool = getPool();

  const { rows: admins } = await pool.query(
    `SELECT id, username, email, role, created_at
     FROM users WHERE role = 'admin' ORDER BY created_at`,
  );

  console.log('Usuários com role admin:', admins.length);
  admins.forEach((u) => console.log(`  - @${u.username} (${u.email})`));

  const { rows: toFix } = await pool.query(
    `UPDATE users SET role = 'user'
     WHERE role = 'admin' AND LOWER(email) <> $1
     RETURNING id, username, email`,
    [SEED_ADMIN_EMAIL],
  );

  if (toFix.length === 0) {
    console.log('Nenhum usuário indevido para rebaixar.');
  } else {
    console.log('Rebaixados para user:');
    toFix.forEach((u) => console.log(`  - @${u.username} (${u.email})`));
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
