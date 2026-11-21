export function weeklyCashflow(rows = []) {
  const byWeek = new Map();
  for (const row of rows) {
    const date = new Date(row.t);
    if (Number.isNaN(date.getTime())) continue;
    const week = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - (date.getUTCDay() + 6) % 7)).toISOString().slice(0, 10);
    const current = byWeek.get(week) || { date: week, inflow: 0, outflow: 0 };
    current.inflow += row.inflow_paise ?? row.inflowPaise ?? 0;
    current.outflow += row.outflow_paise ?? row.outflowPaise ?? 0;
    byWeek.set(week, current);
  }
  const observed = [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!observed.length) return [];
  const complete = [];
  for (let date = new Date(`${observed[0].date}T00:00:00Z`), last = new Date(`${observed.at(-1).date}T00:00:00Z`); date <= last; date.setUTCDate(date.getUTCDate() + 7)) {
    const week = date.toISOString().slice(0, 10);
    complete.push(byWeek.get(week) || { date: week, inflow: 0, outflow: 0, missing: true });
  }
  return complete;
}
