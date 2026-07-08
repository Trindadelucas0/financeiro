function diffMonths(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function valorParcelaPorIndice(total, numParcelas, indice) {
  const n = Number(numParcelas);
  if (!n || n <= 0) return 0;
  const totalCents = Math.round(Number(total) * 100);
  const baseCents = Math.floor(totalCents / n);
  const remainder = totalCents - baseCents * n;
  if (indice === n - 1) {
    return (baseCents + remainder) / 100;
  }
  return baseCents / 100;
}

function indiceParcelaNoMes(mesInicio, mes) {
  return diffMonths(mesInicio, mes);
}

function valorParcelaNoMes(item, mes, totalComJuros) {
  const idx = indiceParcelaNoMes(item.mesInicio, mes);
  if (idx < 0 || idx >= item.numParcelas) return 0;
  const total = totalComJuros != null ? totalComJuros : item.valorTotal;
  return valorParcelaPorIndice(total, item.numParcelas, idx);
}

function valorParcelaSimples(item, mes) {
  return valorParcelaNoMes(item, mes, item.valorTotal);
}

function valorParcelaEmprestimo(item, mes) {
  const total = item.valorTotal * (1 + (item.juros || 0) / 100);
  return valorParcelaNoMes(item, mes, total);
}

function somaParcelasRestantes(item, mes, totalComJuros) {
  const n = item.numParcelas;
  if (!n || n <= 0) return 0;
  const total = totalComJuros != null ? totalComJuros : item.valorTotal;
  const idx = indiceParcelaNoMes(item.mesInicio, mes);
  const start = idx < 0 ? 0 : idx;
  if (start >= n) return 0;
  let sum = 0;
  for (let i = start; i < n; i++) {
    sum += valorParcelaPorIndice(total, n, i);
  }
  return roundMoney(sum);
}

function vencimentoNoMes(ano, mes, dia) {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return new Date(ano, mes - 1, Math.min(dia, ultimoDia));
}

module.exports = {
  diffMonths,
  roundMoney,
  valorParcelaPorIndice,
  valorParcelaNoMes,
  valorParcelaSimples,
  valorParcelaEmprestimo,
  somaParcelasRestantes,
  vencimentoNoMes,
};
