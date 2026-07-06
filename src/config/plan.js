const PRO_PLAN = {
  monthlyPriceBrl: 9.9,
  accessDays: 30,
  currency: 'BRL',
};

const RENEWAL_REMINDER_DAYS = 4;

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
  };
}

module.exports = {
  PRO_PLAN,
  RENEWAL_REMINDER_DAYS,
  formatProMonthlyPrice,
  formatProMonthlyPriceShort,
  getProPlanPricing,
};
