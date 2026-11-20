import { useMemo, useState } from "react";
import { paiseToInr } from "../data/seed.js";
import { buildStatementGraph } from "../data/statementGraph.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "payer", label: "Payers" },
  { id: "payee", label: "Operating" },
  { id: "vpa", label: "Payment IDs" },
];

const PATTERN_LABEL = {
  recurring: "Recurring",
  repeats_variable: "Repeats, amounts vary",
  repeated_irregular: "Repeated, irregular gaps",
  short: "Too few to judge",
  submitted: "Submitted ID",
  account: "Account holder",
};

function seriesText(entity) {
  if (entity.kind === "account") return "The shop on this application. Lines show who paid in and where operating payments went.";
  if (entity.kind === "vpa") return "Submitted with the application. These statement rows do not show that this ID received the credits.";
  const range = `${paiseToInr(entity.min_amount_paise)}–${paiseToInr(entity.max_amount_paise)}`;
  if (entity.pattern === "recurring") {
    const outlier = entity.outlier_count ? ` ${entity.outlier_count} date${entity.outlier_count === 1 ? " sits" : "s sit"} outside the usual band.` : "";
    return `${entity.role} on a ${entity.cadence} cadence, ${entity.date_count} dates from ${entity.first} to ${entity.last}. Amounts stay near ${paiseToInr(entity.median_amount_paise)} (${range}). This counts as recurring.${outlier}`;
  }
  if (entity.pattern === "repeats_variable") {
    return `Shows up ${entity.cadence} across ${entity.date_count} dates, from ${entity.first} to ${entity.last}, but amounts move from ${paiseToInr(entity.min_amount_paise)} to ${paiseToInr(entity.max_amount_paise)}. Repeated, not a stable recurring series.`;
  }
  if (entity.pattern === "repeated_irregular") {
    return `${entity.date_count} dates from ${entity.first} to ${entity.last} without a regular gap. Not treated as recurring.`;
  }
  if (entity.date_count <= 1) return "Appears once. Not enough history to call it recurring.";
  return `Appears on ${entity.date_count} dates. Not enough history to call it recurring.`;
}

function matchesQuery(entity, query) {
  if (!query) return true;
  const haystack = `${entity.label} ${entity.role} ${entity.payer_id || ""}`.toLowerCase();
  return haystack.includes(query);
}

function layout(entities) {
  const width = 860;
  const height = 600;
  const center = { x: 360, y: 250 };
  const positions = new Map();
  const account = entities.find((entity) => entity.kind === "account");
  const payers = entities.filter((entity) => entity.kind === "payer");
  const payees = entities.filter((entity) => entity.kind === "payee");
  const vpas = entities.filter((entity) => entity.kind === "vpa");
  const radiusFor = (entity) => {
    if (entity.kind === "account") return 34;
    if (entity.kind === "vpa") return 15;
    return 15 + Math.sqrt(entity.share || 0) * 22;
  };
  if (account) positions.set(account.id, { ...center, r: radiusFor(account) });
  const placeArc = (items, radius, start, span) => {
    items.forEach((entity, index) => {
      const angle = items.length === 1 ? start + span / 2 : start + (index / (items.length - 1)) * span;
      positions.set(entity.id, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
        r: radiusFor(entity),
      });
    });
  };
  placeArc(payers, 168, Math.PI - Math.PI * 0.46, Math.PI * 0.92);
  placeArc(payees, 188, -0.42, payees.length === 1 ? 0 : Math.min(1.1, 0.38 * payees.length));
  vpas.forEach((entity) => {
    positions.set(entity.id, { x: center.x + 196, y: center.y + 168, r: radiusFor(entity) });
  });
  return { width, height, center, positions };
}

function edgeEnds(source, target) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const start = { x: source.x + (dx / length) * (source.r + 2), y: source.y + (dy / length) * (source.r + 2) };
  const end = { x: target.x - (dx / length) * (target.r + 8), y: target.y - (dy / length) * (target.r + 8) };
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const bend = 26;
  return `M ${start.x} ${start.y} Q ${mx - (dy / length) * bend} ${my + (dx / length) * bend} ${end.x} ${end.y}`;
}

function labelAnchor(point, center) {
  const dx = point.x - center.x;
  if (dx < -12) return "end";
  if (dx > 12) return "start";
  return "middle";
}

function labelPoint(point, center) {
  if (point.x === center.x && point.y === center.y) return { x: point.x, y: point.y + point.r + 18 };
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  const gap = point.r + 14;
  return { x: point.x + (dx / length) * gap, y: point.y + (dy / length) * gap };
}

export function StatementGraph({ rows, shopName, vpa }) {
  const graph = useMemo(() => buildStatementGraph(rows, { shopName, vpa }), [rows, shopName, vpa]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [showShort, setShowShort] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    const wanted = graph.entities.filter((entity) => {
      if (entity.kind === "account") return false;
      if (kind !== "all" && entity.kind !== kind) return false;
      if (!showShort && entity.pattern === "short") return false;
      return matchesQuery(entity, needle);
    });
    const ids = new Set(wanted.map((entity) => entity.id));
    if (wanted.length) ids.add("account");
    const entities = graph.entities.filter((entity) => ids.has(entity.id));
    const links = graph.links.filter((link) => ids.has(link.source) && ids.has(link.target));
    return { entities, links, positions: layout(entities) };
  }, [graph, kind, needle, showShort]);

  const selected = graph.entities.find((entity) => entity.id === selectedId && visible.entities.some((item) => item.id === entity.id)) || null;
  const recurring = graph.entities.filter((entity) => entity.pattern === "recurring");
  const variable = graph.entities.filter((entity) => entity.pattern === "repeats_variable");
  const moneyEntities = graph.entities.filter((entity) => entity.kind === "payer" || entity.kind === "payee");
  const connected = new Set(selected ? [selected.id, ...graph.links.filter((link) => link.source === selected.id || link.target === selected.id).flatMap((link) => [link.source, link.target])] : []);

  function choose(id) {
    setSelectedId((current) => current === id ? null : id);
  }
  function focusEntity(id) {
    setKind("all");
    setShowShort(true);
    setQuery("");
    setSelectedId(id);
  }

  return <section className="stmt-graph" aria-label="Statement entities">
    <div className="stmt-graph-heading">
      <div>
        <h2>Statement entities</h2>
        <p>Counterparties read from the synthetic statement rows. A series is recurring when the same entity shows up on a regular cadence and the amounts stay in a narrow band.</p>
      </div>
    </div>
    <div className="stmt-graph-stats">
      {[[graph.summary.counterparty_count, "Counterparties"], [graph.summary.payment_id_count, "Payment IDs"], [graph.summary.recurring_count, "Recurring series"], [graph.summary.review_count, "Concentration flags"]].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
    </div>
    {graph.summary.review_notes.length > 0 && <p className="stmt-graph-flag">{graph.summary.review_notes.join(". ")}. A large share is a review flag, not a finding of fraud.</p>}
    <div className="stmt-graph-tools">
      <label className="stmt-graph-search">Find an entity<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or payment ID" /></label>
      <div className="stmt-graph-filters" role="group" aria-label="Entity type">
        {FILTERS.map((filter) => <button key={filter.id} type="button" aria-pressed={kind === filter.id} onClick={() => setKind(filter.id)}>{filter.label}</button>)}
      </div>
      <label className="stmt-graph-check"><input type="checkbox" checked={showShort} onChange={(event) => setShowShort(event.target.checked)} /> Show one-off links</label>
    </div>
    <div className="stmt-graph-body">
      <div className="stmt-graph-canvas">
        {visible.entities.length === 0 ? <p className="stmt-graph-empty">{graph.summary.counterparty_count === 0 && !needle ? "No statement rows are on this application yet." : "No entities match this search."}</p> : <svg viewBox={`0 0 ${visible.positions.width} ${visible.positions.height}`} role="group" aria-label={`Relationship graph for ${shopName || "this shop"}`}>
          <defs>
            <marker id="stmt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="context-stroke" />
            </marker>
          </defs>
          {visible.links.map((link) => {
            const source = visible.positions.positions.get(link.source);
            const target = visible.positions.positions.get(link.target);
            if (!source || !target) return null;
            const dim = selected && link.source !== selected.id && link.target !== selected.id;
            const width = link.kind === "submitted_id" ? 1.5 : 1.4 + Math.sqrt(link.share || 0) * 3.4;
            return <path key={link.id} d={edgeEnds(source, target)} className={`stmt-edge stmt-edge-${link.kind} stmt-edge-${link.pattern}`} markerEnd="url(#stmt-arrow)" strokeWidth={width} opacity={dim ? 0.15 : 1}>
              <title>{`${link.label}: ${PATTERN_LABEL[link.pattern] || link.pattern}`}</title>
            </path>;
          })}
          {visible.entities.map((entity) => {
            const point = visible.positions.positions.get(entity.id);
            if (!point) return null;
            const label = labelPoint(point, visible.positions.center);
            const dim = selected && !connected.has(entity.id);
            const pressed = selected?.id === entity.id;
            return <g key={entity.id} className={`stmt-node stmt-node-${entity.kind}${entity.review ? " is-review" : ""}${entity.pattern === "repeats_variable" ? " is-variable" : ""}${pressed ? " is-selected" : ""}`} opacity={dim ? 0.28 : 1} transform={`translate(${point.x} ${point.y})`}>
              <g role="button" tabIndex="0" aria-pressed={pressed} aria-label={`${entity.label}, ${entity.role}, ${PATTERN_LABEL[entity.pattern] || entity.pattern}`} onClick={() => choose(entity.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(entity.id); } }}>
                {entity.kind === "payee" ? <rect x={-point.r} y={-point.r} width={point.r * 2} height={point.r * 2} rx="4" /> : entity.kind === "vpa" ? <polygon points={`0,${-point.r} ${point.r},0 0,${point.r} ${-point.r},0`} /> : <circle r={point.r} />}
              </g>
              <text x={label.x - point.x} y={label.y - point.y} textAnchor={entity.kind === "account" ? "middle" : labelAnchor(point, visible.positions.center)}>{entity.label.length > 24 ? `${entity.label.slice(0, 23)}…` : entity.label}</text>
            </g>;
          })}
        </svg>}
      </div>
      <aside>
        <h3>How to read this</h3>
        <ul>
          <li>Size follows the share of credits or operating payments.</li>
          <li>Blue circles paid the shop. Green squares were paid by the shop. The purple diamond is the submitted payment ID.</li>
          <li>A solid line is a stable recurring series. A dashed amber line repeats on a schedule, but the amounts move. A grey line is too short to judge.</li>
          <li>A red ring means one payer is at least half of credits. That is a review flag, not a finding of fraud.</li>
        </ul>
        <h3>Recurring series</h3>
        {recurring.length === 0 ? <p>No stable recurring series on these rows.</p> : <ul className="stmt-graph-series">{recurring.map((entity) => <li key={entity.id}><button type="button" onClick={() => focusEntity(entity.id)}><strong>{entity.label}</strong><span>{entity.cadence} · {entity.date_count} dates · {paiseToInr(entity.total_paise)}</span></button></li>)}</ul>}
        <h3>Repeats, amounts vary</h3>
        {variable.length === 0 ? <p>No repeating series with unstable amounts.</p> : <ul className="stmt-graph-series">{variable.map((entity) => <li key={entity.id}><button type="button" onClick={() => focusEntity(entity.id)}><strong>{entity.label}</strong><span>{entity.cadence} · {paiseToInr(entity.min_amount_paise)}–{paiseToInr(entity.max_amount_paise)}</span></button></li>)}</ul>}
        {selected && <div className="stmt-graph-detail"><h3>{selected.label}</h3><p>{selected.role} · {PATTERN_LABEL[selected.pattern]}</p><p>{seriesText(selected)}</p>{selected.review && <p>This payer is {Math.round(selected.share * 100)}% of credits.</p>}{selected.total_paise > 0 && <p>{selected.direction === "in" ? "Credits" : "Payments"} {paiseToInr(selected.total_paise)} · {Math.round(selected.share * 100)}% of that direction · {selected.count} rows.</p>}</div>}
      </aside>
    </div>
    <div className="stmt-graph-table dashboard-week-table">
      <table>
        <caption>Entities extracted from the statement rows. The same relationships are drawn above.</caption>
        <thead><tr><th>Entity</th><th>Role</th><th>Pattern</th><th>Cadence</th><th>Dates</th><th>Usual amount</th><th>Total</th><th>Share</th></tr></thead>
        <tbody>
          {moneyEntities.length === 0 ? <tr><td colSpan="8">No counterparties on this statement.</td></tr> : moneyEntities.map((entity) => <tr key={entity.id} className={selected?.id === entity.id ? "is-selected" : ""}><th>{entity.label}</th><td>{entity.role}</td><td>{PATTERN_LABEL[entity.pattern]}</td><td>{entity.cadence}</td><td>{entity.date_count}{entity.first ? ` · ${entity.first} to ${entity.last}` : ""}</td><td>{entity.median_amount_paise ? paiseToInr(entity.median_amount_paise) : "—"}</td><td>{paiseToInr(entity.total_paise)}</td><td>{Math.round(entity.share * 100)}%{entity.review ? " · review" : ""}</td></tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}
