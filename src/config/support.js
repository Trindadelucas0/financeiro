function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeWhatsappE164(raw) {
  const digits = digitsOnly(raw);
  if (!digits) return '5538998100827';
  if (digits.length === 11) return `55${digits}`;
  if (digits.startsWith('55')) return digits;
  return digits;
}

function formatWhatsappDisplay(e164) {
  const local = e164.replace(/^55/, '');
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  return local;
}

function getSupportContact() {
  const whatsappE164 = normalizeWhatsappE164(
    process.env.SUPPORT_WHATSAPP || '38998100827'
  );
  const email = process.env.SUPPORT_EMAIL || 'lucasrodrigues4@live.com';
  const whatsappMessage = encodeURIComponent(
    'Olá, preciso de ajuda com o Home Finanças.'
  );

  return {
    email,
    emailUrl: `mailto:${email}`,
    whatsappE164,
    whatsappDisplay: formatWhatsappDisplay(whatsappE164),
    whatsappUrl: `https://wa.me/${whatsappE164}?text=${whatsappMessage}`,
  };
}

module.exports = {
  getSupportContact,
};
