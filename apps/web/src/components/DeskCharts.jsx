import { useMemo, useState } from "react";
import { paiseToInr } from "../data/seed.js";

function weekDate(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

function shortDate(iso) {
  return weekDate(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

function longDate(iso) {
  return weekDate(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function axisInr(paise) {
  const rupees = paise / 100;
  const sign = rupees < 0 ? "−" : "";
  const abs = Math.abs(rupees);
  const trim = (value) => {
    if (value >= 100) return String(Math.round(value));
    const digits = value >= 10 ? 1 : 2;
    return value.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
  };
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

function niceBounds(minPaise, maxPaise) {
  let low = minPaise;
  let high = maxPaise;
  if (low === high) {
    const pad = Math.max(100, Math.abs(high) * 0.25);
    low -= pad;
    high += pad;
  }
  const span = Math.max(1, high - low);
  const rough = span / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const error = rough / power;
  const nice = error >= 7.5 ? 10 : error >= 3.5 ? 5 : error >= 1.5 ? 2 : 1;
  const step = Math.max(1, nice * power);
  const floor = Math.floor(low / step) * step;
  const ticks = [];
  for (let value = floor; value <= high + step * 0.01; value += step) ticks.push(Math.round(value));
  return { low: ticks[0], high: ticks.at(-1), ticks };
}

function money(amount) {
  return amount == null || !Number.isFinite(amount) ? "Unavailable" : paiseToInr(amount);
}

export function CashflowChart({ weeks, leanDates = [] }) {
  const [active, setActive] = useState(null);
  const bounds = useMemo(() => {
    const values = weeks.flatMap((week) => week.missing ? [0] : [week.inflow, week.outflow, week.inflow - week.outflow]);
    return niceBounds(Math.min(0, ...values), Math.max(1, ...values));
  }, [weeks]);
  if (!weeks.length) return <p className="dashboard-cashflow-empty">No weekly records on file.</p>;

  const span = Math.max(1, bounds.high - bounds.low);
  const yPct = (value) => (value - bounds.low) / span * 100;
  const fallback = weeks.findIndex((week) => leanDates.includes(week.date));
  const index = active != null && weeks[active] ? active : fallback >= 0 ? fallback : weeks.findLastIndex((week) => !week.missing);
  const selected = weeks[Math.max(0, index)] || weeks[0];
  const netOf = (week) => week.inflow - week.outflow;
  const segments = weeks.reduce((groups, week, weekIndex) => {
    if (week.missing) return [...groups, []];
    const point = `${weekIndex * 100 + 50},${(1 - (netOf(week) - bounds.low) / span) * 1000}`;
    groups.at(-1).push(point);
    return groups;
  }, [[]]).filter((group) => group.length > 1);

  return <div className="dashboard-cashflow">
    <div className="dashboard-cashflow-key" aria-hidden="true"><span className="is-in">Inflow</span><span className="is-out">Outflow</span><span className="is-net">Net</span>{leanDates.length > 0 && <span className="is-lean">Weakest four weeks</span>}</div>
    <div className="dashboard-cashflow-readout">
      <strong>Week of {longDate(selected.date)}</strong>
      {selected.missing ? <span>No records</span> : <>
        <span>Inflow <b>{paiseToInr(selected.inflow)}</b></span>
        <span>Outflow <b>{paiseToInr(selected.outflow)}</b></span>
        <span>Net <b>{paiseToInr(netOf(selected))}</b></span>
      </>}
      {leanDates.includes(selected.date) && <span className="dashboard-cashflow-lean-tag">Weakest four weeks</span>}
    </div>
    <div className="dashboard-cashflow-body">
      <div className="dashboard-cashflow-y" aria-hidden="true"><div className="dashboard-cashflow-y-plot">{bounds.ticks.map((tick) => <span key={tick} style={{ bottom: `${yPct(tick)}%` }}>{axisInr(tick)}</span>)}</div></div>
      <div className="dashboard-cashflow-scroll">
        <div className="dashboard-cashflow-stage" style={{ minWidth: `${Math.max(weeks.length * 44, 280)}px` }}>
          <div className="dashboard-cashflow-grid" aria-hidden="true">
            {bounds.ticks.map((tick) => <span key={tick} style={{ bottom: `${yPct(tick)}%` }} />)}
            {bounds.low < 0 && bounds.high > 0 && <span className="is-zero" style={{ bottom: `${yPct(0)}%` }} />}
          </div>
          <svg className="dashboard-cashflow-line" viewBox={`0 0 ${weeks.length * 100} 1000`} preserveAspectRatio="none" aria-hidden="true">
            {segments.map((points) => <polyline key={points[0]} points={points.join(" ")} fill="none" stroke="#151e3d" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />)}
          </svg>
          <div className="dashboard-cashflow-dots" aria-hidden="true">
            {weeks.map((week, weekIndex) => week.missing ? null : <i key={week.date} style={{ left: `${(weekIndex + 0.5) / weeks.length * 100}%`, bottom: `${yPct(netOf(week))}%` }} />)}
          </div>
          <div className="dashboard-cashflow-cols" role="list" aria-label={`Weekly synthetic cashflow from ${weeks[0].date} to ${weeks.at(-1).date}`}>
            {weeks.map((week, weekIndex) => {
              const lean = leanDates.includes(week.date);
              const bar = (value) => {
                const base = yPct(0);
                const tip = yPct(value);
                return { bottom: `${Math.min(base, tip)}%`, height: `${Math.max(Math.abs(tip - base), value === 0 ? 0 : 0.6)}%`, transformOrigin: value < 0 ? "top center" : "bottom center" };
              };
              return <div role="listitem" tabIndex={0} key={week.date} className={`dashboard-cashflow-col${lean ? " is-lean" : ""}${weekIndex === Math.max(0, index) ? " is-active" : ""}`} aria-label={`${longDate(week.date)}${week.missing ? ", no records" : `, inflow ${paiseToInr(week.inflow)}, outflow ${paiseToInr(week.outflow)}, net ${paiseToInr(netOf(week))}`}${lean ? ", weakest four weeks" : ""}`} onMouseEnter={() => setActive(weekIndex)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(weekIndex)} onBlur={() => setActive(null)}>
                <span className="dashboard-cashflow-plotcol">
                  {week.missing ? <span className="dashboard-cashflow-missing">No records</span> : <>
                    <i className="dashboard-cashflow-bar is-in" style={bar(week.inflow)} />
                    <i className="dashboard-cashflow-bar is-out" style={bar(week.outflow)} />
                  </>}
                </span>
                <span className="dashboard-cashflow-xlabel">{shortDate(week.date)}</span>
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>
    <p className="dashboard-cashflow-note">Dashed line is ₹0. Hover or focus a week for its inflow, outflow, and net.{leanDates.length > 0 && " Shaded columns are the policy lean period."}</p>
  </div>;
}

export function AmountComparison({ requested, policyMax, offer }) {
  const rows = [
    { key: "requested", label: "Requested", amount: requested, tone: "requested" },
    { key: "policy", label: "Policy maximum", amount: policyMax, tone: "policy" },
    { key: "offer", label: "We can give", amount: offer, tone: "offer" },
  ];
  const known = rows.filter((row) => row.amount != null && Number.isFinite(row.amount));
  const scaleMax = Math.max(1, ...known.map((row) => Math.max(0, row.amount)));
  const low = known.length ? Math.min(...known.map((row) => row.amount)) : 0;
  const high = known.length ? Math.max(...known.map((row) => row.amount)) : 0;
  const spread = high - low;
  const showLens = known.length >= 2 && spread > 0 && spread / Math.max(Math.abs(high), 1) < 0.12;
  const gap = Number.isFinite(requested) && Number.isFinite(offer) && requested > offer && offer > 0 ? requested - offer : 0;
  const gapPct = requested > 0 ? Math.round(gap / requested * 100) : 0;
  const clusters = known
    .map((row) => ({ ...row, pct: spread === 0 ? 50 : (row.amount - low) / spread * 100 }))
    .sort((a, b) => a.pct - b.pct)
    .reduce((groups, row) => {
      const last = groups.at(-1);
      if (last && Math.abs(last.pct - row.pct) < 3) {
        last.items.push(row);
        last.pct = last.items.reduce((sum, item) => sum + item.pct, 0) / last.items.length;
      } else groups.push({ pct: row.pct, items: [row] });
      return groups;
    }, []);

  return <div className="dashboard-amounts">
    <div className="dashboard-amount-list" aria-label="Requested, policy maximum and proposed principal on a common rupee scale">
      {rows.map((row) => <div className={`dashboard-amount-row is-${row.tone}`} key={row.key}>
        <i aria-hidden="true" />
        <span>{row.label}</span>
        <strong>{money(row.amount)}</strong>
        <span className="dashboard-amount-track">{row.amount != null && <b style={{ width: `${Math.max(0, row.amount) / scaleMax * 100}%` }} />}</span>
      </div>)}
    </div>
    {showLens && <div className="dashboard-amount-lens" aria-label={`Spread of ${paiseToInr(spread)} between these amounts`}>
      <div className="dashboard-amount-lens-label"><span>Spread between these amounts</span><strong>{paiseToInr(spread)}</strong></div>
      <div className="dashboard-amount-lens-scale">
        <i className="dashboard-amount-lens-line" aria-hidden="true" />
        {clusters.map((cluster) => <span key={cluster.items.map((item) => item.key).join("-")} className={`dashboard-amount-pin${cluster.pct < 18 ? " is-start" : cluster.pct > 82 ? " is-end" : ""}`} style={{ left: `${cluster.pct}%` }}>
          <span className="dashboard-amount-pin-label">{cluster.items.map((item) => item.label).join(" · ")}<b>{money(cluster.items[0].amount)}</b></span>
          <span className="dashboard-amount-pin-dots">{cluster.items.map((item) => <i key={item.key} className={`is-${item.tone}`} />)}</span>
        </span>)}
      </div>
      <p>This scale runs from {paiseToInr(low)} to {paiseToInr(high)}. The bars above still start at ₹0.</p>
    </div>}
    {gap > 0 && <p className="dashboard-counteroffer">The amount we can give is {paiseToInr(gap)} ({gapPct}%) below the requested amount.</p>}
    {gap === 0 && known.length === 3 && spread === 0 && <p className="dashboard-counteroffer">Requested, policy maximum, and the amount we can give are the same.</p>}
  </div>;
}
