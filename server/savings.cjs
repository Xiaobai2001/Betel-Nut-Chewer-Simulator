const FIELDS = ['nutTier', 'nutPriceCents', 'nutsPerDay', 'smokePriceCents', 'cigarettesPerDay'];
function validBaseline(value) {
  return value && [50, 100, 200].includes(value.nutTier) && FIELDS.every(key => Number.isSafeInteger(value[key])) &&
    ['nutPriceCents', 'smokePriceCents'].every(key => value[key] >= 0 && value[key] <= 1000000) &&
    ['nutsPerDay', 'cigarettesPerDay'].every(key => value[key] >= 0 && value[key] <= 500);
}
function summarizeSavings(baseline, checkins, today) {
  if (!baseline) return { configured: false, baseline: null, totalCents: null, todayCents: null };
  const capacity = { 50: 10, 100: 15, 200: 20 }[baseline.nutTier];
  const rows = checkins.filter(row => row.day <= today);
  const nutDays = rows.filter(row => row.nut_free).length, smokeDays = rows.filter(row => row.smoke_free).length;
  // Round each cumulative component once, avoiding repeated per-day rounding drift.
  const nutCost = days => Math.round(days * baseline.nutPriceCents * baseline.nutsPerDay / capacity);
  const smokeCost = days => Math.round(days * baseline.smokePriceCents * baseline.cigarettesPerDay / 20);
  const current = rows.find(row => row.day === today);
  const nutCents = nutCost(nutDays), smokeCents = smokeCost(smokeDays);
  return { configured: true, baseline, nutDays, smokeDays, nutCents, smokeCents, totalCents: nutCents + smokeCents,
    todayCents: nutCost(current?.nut_free ? 1 : 0) + smokeCost(current?.smoke_free ? 1 : 0) };
}
module.exports = { FIELDS, validBaseline, summarizeSavings };
