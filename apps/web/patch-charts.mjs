import fs from "fs";

const path = "apps/web/src/pages/LenderDesk.jsx";
let s = fs.readFileSync(path, "utf8");
if (!s.includes("DeskCharts.jsx")) {
  s = s.replace(
    'import { paiseToInr, verdictLabel } from "../data/seed.js";',
    'import { paiseToInr, verdictLabel } from "../data/seed.js";\nimport { AmountComparison, CashflowChart } from "../components/DeskCharts.jsx";'
  );
}
const calcStart = s.indexOf("  const max = Math.max(1, ...weeks.flatMap");
const calcEnd = s.indexOf("  const drivers = d.drivers || [];");
if (calcStart < 0 || calcEnd < 0) throw new Error(`calc block not found ${calcStart} ${calcEnd}`);
s = `${s.slice(0, calcStart)}  const leanDates = decision?.capacity?.worst_4_week_dates || [];\n${s.slice(calcEnd)}`;
const keyStart = s.indexOf('<div className="dashboard-chart-key">');
const netStart = s.indexOf('<div className="dashboard-net-strip"');
if (keyStart < 0 || netStart < 0) throw new Error(`chart anchors ${keyStart} ${netStart}`);
s = `${s.slice(0, keyStart)}<CashflowChart weeks={weeks} leanDates={leanDates} />${s.slice(netStart)}`;
const amountStart = s.indexOf("<h2>Amount comparison</h2>");
const calcHead = s.indexOf("<h2>Calculation</h2>");
if (amountStart < 0 || calcHead < 0) throw new Error(`amount anchors ${amountStart} ${calcHead}`);
const replacement = "<h2>Amount comparison</h2><AmountComparison requested={application.requested_amount_paise} policyMax={decision.capacity?.max_principal_paise} offer={decision.principal_paise} />";
s = s.slice(0, amountStart) + replacement + s.slice(calcHead);
fs.writeFileSync(path, s);
console.log({
  chart: s.includes("CashflowChart"),
  amount: s.includes("AmountComparison"),
  oldScale: s.includes("offerScaleMax"),
  oldKey: s.includes("dashboard-chart-key"),
});
