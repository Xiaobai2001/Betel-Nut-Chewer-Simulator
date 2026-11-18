// Progress is derived from persisted evidence, so retries and account switches cannot award twice.
const ACTIVITY_FIELDS = ['nuts_50', 'nuts_100', 'nuts_200', 'completed_50', 'completed_100', 'completed_200', 'cigarettes_lit', 'cigarettes_smoked', 'cigarettes_finished', 'early_extinguished', 'early_discarded', 'puffs', 'breaths'];
const dayShift = (day, offset) => new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
function streak(rows, field, today) {
  const yes = row => field === 'both' ? !!row.nut_free && !!row.smoke_free : !!row[field];
  const accepted = new Set(rows.filter(yes).map(row => row.day));
  let current = 0, cursor = accepted.has(today) ? today : dayShift(today, -1);
  const through = accepted.has(cursor) ? cursor : null;
  while (accepted.has(cursor)) { current++; cursor = dayShift(cursor, -1); }
  let best = 0, length = 0, previous = null;
  for (const day of [...accepted].sort()) { length = previous && dayShift(previous, 1) === day ? length + 1 : 1; best = Math.max(best, length); previous = day; }
  return { current, best, through };
}
function summarizeProgress(total, todayStats, checkins, today) {
  const packs = [50, 100, 200].map((tier, i) => {
    const capacity = [10, 15, 20][i], count = total['nuts_' + tier] || 0;
    return { tier, capacity, count, completed: total['completed_' + tier] || 0, whole: Math.floor(count / capacity), remainder: count % capacity };
  });
  const lit = total.cigarettes_lit || 0;
  const real = {
    nut: streak(checkins, 'nut_free', today), smoke: streak(checkins, 'smoke_free', today), both: streak(checkins, 'both', today),
    recordedDays: checkins.filter(row => row.nut_free || row.smoke_free).length
  };
  const definitions = [
    ['awareness', '开始觉察', '留下第一份模拟用量记录。', 'reflect', total.nuts_started + lit, 1, '份'],
    ['pause_first', '把下一口留下', '在模拟中提前吐出槟榔或主动熄灭香烟。', 'pause', total.early_discarded + total.early_extinguished, 1, '次'],
    ['breath_one', '先停一分钟', '完整做一次一分钟呼吸练习。', 'pause', total.breaths, 1, '次'],
    ['breath_three', '给自己一点空间', '累计完成三次呼吸练习。', 'pause', total.breaths, 3, '次'],
    ['real_first', '现实第一步', '主动记录一个现实中没嚼槟榔或没吸烟的日子。', 'real', real.recordedDays, 1, '天'],
    ['nut_three', '给口腔一个休息', '曾连续三天打卡现实中没有嚼槟榔。', 'real', real.nut.best, 3, '天'],
    ['smoke_three', '三天清新', '曾连续三天打卡现实中没有吸烟。', 'real', real.smoke.best, 3, '天'],
    ['both_seven', '清新的一周', '曾连续七天打卡现实中两者都没有使用。', 'real', real.both.best, 7, '天'],
    ['both_thirty', '把健康留成习惯', '曾连续三十天打卡现实中两者都没有使用。', 'real', real.both.best, 30, '天']
  ];
  const achievements = definitions.map(([id, title, description, category, value, target, unit]) => ({ id, title, description, category, value, target, unit, unlocked: value >= target }));
  const calendar = Array.from({ length: 7 }, (_, i) => {
    const day = dayShift(today, -i), row = checkins.find(item => item.day === day);
    return { day, nutFree: !!row?.nut_free, smokeFree: !!row?.smoke_free, recorded: !!row };
  });
  const observations = [
    { id: 'daily_nuts', title: '今天嚼过的槟榔', count: todayStats.nuts_started, unit: '颗', line: 5 },
    { id: 'daily_smoke', title: '今天点燃的香烟', count: todayStats.cigarettes_lit, unit: '根', line: 5 }
  ].map(item => ({ ...item, reached: item.count >= item.line }));
  return {
    packs, cigaretteBoxes: { capacity: 20, count: lit, whole: Math.floor(lit / 20), remainder: lit % 20 },
    unknownLegacyNuts: Math.max(0, total.nuts_started - packs.reduce((sum, pack) => sum + pack.count, 0)),
    real, calendar, achievements, observations
  };
}
function validCheckin(body, today) {
  if (!body || typeof body.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.day) || typeof body.nutFree !== 'boolean' || typeof body.smokeFree !== 'boolean') return false;
  if (body.day > today || body.day < dayShift(today, -6)) return false;
  const parsed = Date.parse(body.day + 'T00:00:00Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === body.day;
}
module.exports = { ACTIVITY_FIELDS, dayShift, summarizeProgress, validCheckin };
