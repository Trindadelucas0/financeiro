function slugifyFirstName(nome) {
  const first = String(nome || '').trim().split(/\s+/)[0] || '';
  const slug = first
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return slug || 'usuario';
}

function generateTempPassword(nome) {
  return `${slugifyFirstName(nome)}123`;
}

module.exports = { generateTempPassword, slugifyFirstName };
