/** Entities and relationships read from synthetic statement rows. */

const WITHIN = 0.35;
const STABLE_SHARE = 0.8;
const REGULAR_SHARE = 0.75;
const REVIEW_SHARE = 0.5;

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function dayNumber(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function cadenceName(gap) {
  if (gap >= 6 && gap <= 8) return "weekly";
  if (gap >= 13 && gap <= 16) return "fortnightly";
  if (gap >= 26 && gap <= 35) return "monthly";
  return `every ${Math.round(gap)} days`;
}

function classify(dates, amounts) {
  const dateCount = dates.length;
  const result = {
    date_count: dateCount,
    first: dates[0] || null,
    last: dates[dateCount - 1] || null,
    min_amount_paise: dateCount ? Math.min(...amounts) : 0,
    max_amount_paise: dateCount ? Math.max(...amounts) : 0,
    median_amount_paise: median(amounts),
    median_gap_days: null,
    cadence: dateCount <= 1 ? "one-off" : "short",
    pattern: "short",
    amount_stability: "unknown",
    outlier_count: 0,
  };
  if (dateCount < 3) return result;
  const gaps = [];
  for (let index = 1; index < dates.length; index += 1) gaps.push(dayNumber(dates[index]) - dayNumber(dates[index - 1]));
  const medianGap = median(gaps);
  const tolerance = Math.max(2, medianGap * 0.25);
  const regular = gaps.filter((gap) => Math.abs(gap - medianGap) <= tolerance).length / gaps.length;
  const medianAmount = median(amounts);
  const outliers = medianAmount > 0 ? amounts.filter((amount) => Math.abs(amount - medianAmount) / medianAmount > WITHIN) : amounts;
  const stable = medianAmount > 0 && (amounts.length - outliers.length) / amounts.length >= STABLE_SHARE;
  const cadence = regular >= REGULAR_SHARE ? cadenceName(medianGap) : "irregular";
  let pattern = "repeated_irregular";
  if (cadence !== "irregular" && stable) pattern = "recurring";
  else if (cadence !== "irregular") pattern = "repeats_variable";
  return {
    ...result,
    median_gap_days: medianGap,
    cadence,
    pattern,
    amount_stability: stable ? "stable" : "variable",
    outlier_count: outliers.length,
  };
}

function collapse(entries) {
  const byDate = new Map();
  for (const entry of entries) byDate.set(entry.date, (byDate.get(entry.date) || 0) + entry.amount);
  const dates = [...byDate.keys()].sort();
  const amounts = dates.map((date) => byDate.get(date));
  return {
    total_paise: amounts.reduce((sum, amount) => sum + amount, 0),
    count: entries.length,
    ...classify(dates, amounts),
  };
}

const PAYER_NAMES = {
  p_0: "Ananya Rao",
  p_1: "Karthik Menon",
  p_2: "Meera Iyer",
  p_3: "Imran Sheikh",
  p_4: "Divya Nair",
  p_5: "Suresh Patil",
  dominant: "Arjun Desai",
  unnamed: "Unknown person",
};

function payerLabel(payerId) {
  if (PAYER_NAMES[payerId]) return PAYER_NAMES[payerId];
  const roster = Object.values(PAYER_NAMES).filter((name) => name !== "Unknown person");
  let hash = 0;
  for (const char of String(payerId)) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return roster[hash % roster.length];
}

function readRow(row) {
  const date = String(row.t || row.posted_at || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const inflow = Number(row.inflow_paise ?? row.inflowPaise ?? 0);
  const outflow = Number(row.outflow_paise ?? row.outflowPaise ?? 0);
  const payerId = String(row.payer_id || row.payerId || "unnamed");
  return { date, inflow, outflow, payerId };
}

export function buildStatementGraph(rows, { shopName = "This shop", vpa = "" } = {}) {
  const credits = new Map();
  const debits = new Map();
  for (const raw of rows || []) {
    const row = readRow(raw);
    if (!row) continue;
    if (row.inflow > 0) {
      const bucket = credits.get(row.payerId) || [];
      bucket.push({ date: row.date, amount: row.inflow });
      credits.set(row.payerId, bucket);
    }
    if (row.outflow > 0) {
      const bucket = debits.get(row.payerId) || [];
      bucket.push({ date: row.date, amount: row.outflow });
      debits.set(row.payerId, bucket);
    }
  }

  const creditSeries = [...credits.entries()].map(([payerId, entries]) => ({ payerId, ...collapse(entries) }));
  const debitSeries = [...debits.entries()].map(([payerId, entries]) => ({ payerId, ...collapse(entries) }));
  const creditTotal = creditSeries.reduce((sum, series) => sum + series.total_paise, 0);
  const debitTotal = debitSeries.reduce((sum, series) => sum + series.total_paise, 0);

  const account = {
    id: "account",
    kind: "account",
    label: shopName || "This shop",
    role: "Account holder",
    direction: null,
    payer_id: null,
    total_paise: 0,
    count: 0,
    share: 0,
    review: false,
    pattern: "account",
    cadence: null,
    date_count: 0,
    first: null,
    last: null,
    min_amount_paise: 0,
    max_amount_paise: 0,
    median_amount_paise: 0,
    outlier_count: 0,
    amount_stability: "unknown",
  };

  const payers = creditSeries
    .sort((a, b) => a.payerId.localeCompare(b.payerId))
    .map(({ payerId, ...series }) => {
      const share = creditTotal > 0 ? series.total_paise / creditTotal : 0;
      return {
        id: `payer:${payerId}`,
        kind: "payer",
        label: payerLabel(payerId),
        role: "Customer receipt",
        direction: "in",
        payer_id: payerId,
        share,
        review: share >= REVIEW_SHARE,
        ...series,
      };
    });

  const payees = debitSeries
    .sort((a, b) => a.payerId.localeCompare(b.payerId))
    .map(({ payerId, ...series }) => ({
      id: `payee:${payerId}`,
      kind: "payee",
      label: debitSeries.length === 1 ? "Operating payments" : `Operating payments · ${payerId}`,
      role: "Operating payment",
      direction: "out",
      payer_id: payerId,
      share: debitTotal > 0 ? series.total_paise / debitTotal : 0,
      review: false,
      ...series,
    }));

  const paymentId = String(vpa || "").trim();
  const paymentNodes = paymentId ? [{
    id: "vpa",
    kind: "vpa",
    label: paymentId,
    role: "Submitted payment ID",
    direction: null,
    payer_id: null,
    total_paise: 0,
    count: 0,
    share: 0,
    review: false,
    pattern: "submitted",
    cadence: null,
    date_count: 0,
    first: null,
    last: null,
    min_amount_paise: 0,
    max_amount_paise: 0,
    median_amount_paise: 0,
    outlier_count: 0,
    amount_stability: "unknown",
  }] : [];

  const entities = [account, ...payers, ...payees, ...paymentNodes];
  const links = [
    ...payers.map((entity) => ({
      id: `credit:${entity.id}`,
      source: entity.id,
      target: "account",
      kind: "credit",
      label: entity.label,
      total_paise: entity.total_paise,
      share: entity.share,
      pattern: entity.pattern,
      cadence: entity.cadence,
      date_count: entity.date_count,
    })),
    ...payees.map((entity) => ({
      id: `debit:${entity.id}`,
      source: "account",
      target: entity.id,
      kind: "debit",
      label: entity.label,
      total_paise: entity.total_paise,
      share: entity.share,
      pattern: entity.pattern,
      cadence: entity.cadence,
      date_count: entity.date_count,
    })),
    ...paymentNodes.map((entity) => ({
      id: "submitted:vpa",
      source: entity.id,
      target: "account",
      kind: "submitted_id",
      label: entity.label,
      total_paise: 0,
      share: 0,
      pattern: "submitted",
      cadence: null,
      date_count: 0,
    })),
  ];

  const recurring = entities.filter((entity) => entity.pattern === "recurring");
  const review = payers.filter((entity) => entity.review);
  return {
    entities,
    links,
    summary: {
      counterparty_count: payers.length + payees.length,
      payer_count: payers.length,
      payee_count: payees.length,
      payment_id_count: paymentNodes.length,
      recurring_count: recurring.length,
      variable_count: entities.filter((entity) => entity.pattern === "repeats_variable").length,
      review_count: review.length,
      review_notes: review.map((entity) => `${entity.label} is ${Math.round(entity.share * 100)}% of credits`),
      credit_total_paise: creditTotal,
      debit_total_paise: debitTotal,
    },
  };
}
