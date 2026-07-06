const { getPool } = require('../db/pool');

async function createOrder({ userId, orderNsu, amountCents }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO payment_orders (user_id, order_nsu, amount_cents, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING *`,
    [userId, orderNsu, amountCents],
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

module.exports = {
  createOrder,
  getOrderByNsu,
  markOrderPaid,
};
