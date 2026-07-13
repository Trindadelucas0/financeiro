function isValidEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 254) return false;
  // Practical RFC-inspired check: local@domain.tld (no spaces)
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

module.exports = { isValidEmail, normalizeEmail };
