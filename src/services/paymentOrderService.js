const crypto = require('crypto');
const { getPool } = require('../db/pool');

async function createOrder({ userId, orderNsu, amountCents, checkoutSource = 'profile' }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO payment_orders (user_id, order_nsu, amount_cents, status, checkout_source)
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING *`,
    [userId, orderNsu, amountCents, checkoutSource],
  );
  return rows[0];
}

async function createGuestOrder({ orderNsu, amountCents, customerNome, customerEmail }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO payment_orders (order_nsu, amount_cents, status, customer_nome, customer_email, checkout_source)
     VALUES ($1, $2, 'pending', $3, $4, 'guest')
     RETURNING *`,
    [orderNsu, amountCents, customerNome, customerEmail],
  );
  return rows[0];
}

async function getOrderByNsu(orderNsu) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM payment_orders WHERE order_nsu = $1 LIMIT 1',
    [orderNsu],
  );
  return rows[0] || null;
}

async function markOrderPaid({ orderNsu, invoiceSlug, transactionNsu }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE payment_orders
     SET status = 'paid',
         invoice_slug = COALESCE($2, invoice_slug),
         transaction_nsu = COALESCE($3, transaction_nsu),
         paid_at = NOW()
     WHERE order_nsu = $1 AND status = 'pending'
     RETURNING *`,
    [orderNsu, invoiceSlug || null, transactionNsu || null],
  );
  return rows[0] || null;
}

async function linkOrderToUser(orderNsu, userId) {
  const pool = getPool();
  await pool.query(
    'UPDATE payment_orders SET user_id = $2 WHERE order_nsu = $1',
    [orderNsu, userId],
  );
}

async function createManualPaidOrder({ userId, customerNome, customerEmail, amountCents }) {
  const pool = getPool();
  const orderNsu = `manual-${crypto.randomUUID()}`;
  const { rows } = await pool.query(
    `INSERT INTO payment_orders (
       user_id, order_nsu, amount_cents, status,
       customer_nome, customer_email, checkout_source, paid_at
     )
     VALUES ($1, $2, $3, 'paid', $4, $5, 'manual', NOW())
     RETURNING *`,
    [userId, orderNsu, amountCents, customerNome, customerEmail],
  );
  return rows[0];
}

module.exports = {
  createOrder,
  createGuestOrder,
  getOrderByNsu,
  markOrderPaid,
  linkOrderToUser,
  createManualPaidOrder,
};
