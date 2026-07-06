const PRO_PLAN = {
  monthlyPriceBrl: 9.9,
  accessDays: 30,
  currency: 'BRL',
};

function formatProMonthlyPriceShort() {
  return PRO_PLAN.monthlyPriceBrl.toLocaleString('pt-BR', {
    style: 'currency',
    currency: PRO_PLAN.currency,
  });
}

function formatProMonthlyPrice() {
  return `${formatProMonthlyPriceShort()}/mês`;
}

function getProPlanPricing() {
  const priceShort = formatProMonthlyPriceShort();
  const label = `${priceShort} · ${PRO_PLAN.accessDays} dias`;

  return {
    monthlyPriceBrl: PRO_PLAN.monthlyPriceBrl,
    accessDays: PRO_PLAN.accessDays,
    currency: PRO_PLAN.currency,
    label,
    priceShort,
    accessLabel: `${PRO_PLAN.accessDays} dias de acesso`,
    subline: `Pague ${priceShort} · use por ${PRO_PLAN.accessDays} dias`,
    paymentMethods: ['Pix', 'Cartão de crédito'],
    accessMethods: [
      { label: '30 dias de acesso', detail: 'Renove a cada 30 dias no perfil' },
      { label: 'Web + PWA', detail: 'Painel no navegador ou instalado no celular' },
      { label: 'Compra na landing', detail: 'Pague, receba login e entre no painel' },
    ],
  };
}

module.exports = {
  PRO_PLAN,
  formatProMonthlyPrice,
  formatProMonthlyPriceShort,
  getProPlanPricing,
};
