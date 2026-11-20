import test from "node:test";
import assert from "node:assert/strict";
import { buildStatementGraph } from "./statementGraph.js";

function datedRows(weeks, payers) {
  const start = new Date("2026-01-05T00:00:00Z");
  const rows = [];
  weeks.forEach((week, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index * 7);
    const iso = date.toISOString().slice(0, 10);
    const inflow = week * 100000;
    const outflow = Math.round(inflow * 0.72);
    for (let payer = 0; payer < payers; payer += 1) {
      rows.push({
        t: iso,
        inflow_paise: Math.round(inflow / payers),
        outflow_paise: payer === 0 ? outflow : 0,
        payer_id: payers === 1 ? "dominant" : `p_${payer}`,
      });
    }
  });
  return rows;
}

test("a diversified weekly shop yields recurring payers and one operating series", () => {
  const graph = buildStatementGraph(datedRows([42, 48, 39, 51, 44, 28, 46, 49, 41, 47, 43, 45], 6), {
    shopName: "Lakshmi Stores",
    vpa: "lakshmistores@upi",
  });
  const payers = graph.entities.filter((entity) => entity.kind === "payer");
  const payees = graph.entities.filter((entity) => entity.kind === "payee");
  assert.equal(payers.length, 6);
  assert.deepEqual(payers.map((entity) => entity.label), ["Ananya Rao", "Karthik Menon", "Meera Iyer", "Imran Sheikh", "Divya Nair", "Suresh Patil"]);
  assert.equal(payees.length, 1);
  assert.equal(payees[0].label, "Operating payments");
  assert.ok(payers.every((entity) => entity.pattern === "recurring" && entity.cadence === "weekly"));
  assert.equal(payees[0].pattern, "recurring");
  assert.equal(graph.summary.recurring_count, 7);
  assert.equal(graph.summary.review_count, 0);
  assert.equal(graph.summary.payment_id_count, 1);
  assert.ok(graph.links.some((link) => link.kind === "submitted_id" && link.label === "lakshmistores@upi"));
});

test("one payer with a spike repeats weekly but is not a stable recurring credit", () => {
  const graph = buildStatementGraph(datedRows([8, 9, 10, 90, 92, 88, 91, 89, 93, 90, 88, 91], 1), {
    shopName: "QuickTrade Hub",
  });
  const payer = graph.entities.find((entity) => entity.kind === "payer");
  assert.equal(payer.label, "Arjun Desai");
  assert.equal(payer.pattern, "repeats_variable");
  assert.equal(payer.cadence, "weekly");
  assert.equal(payer.review, true);
  assert.equal(graph.summary.review_notes[0], "Arjun Desai is 100% of credits");
  assert.equal(graph.summary.recurring_count, 0);
  assert.equal(graph.entities.some((entity) => entity.kind === "vpa"), false);
});

test("a single dip still counts as recurring when the rest of the dates stay close", () => {
  const graph = buildStatementGraph(datedRows([30, 28, 33, 31, 12, 29, 32, 30, 27, 31, 28, 30], 5), { shopName: "Meena Repair" });
  const payer = graph.entities.find((entity) => entity.payer_id === "p_0");
  assert.equal(payer.pattern, "recurring");
  assert.equal(payer.outlier_count, 1);
  assert.ok(payer.share < 0.5);
});

test("fewer than three dates is not called recurring", () => {
  const graph = buildStatementGraph([
    { t: "2026-01-05", inflow_paise: 100000, outflow_paise: 0, payer_id: "p_0" },
    { t: "2026-01-12", inflow_paise: 100000, outflow_paise: 0, payer_id: "p_0" },
  ], { shopName: "Short history" });
  const payer = graph.entities.find((entity) => entity.kind === "payer");
  assert.equal(payer.pattern, "short");
  assert.equal(payer.date_count, 2);
  assert.equal(graph.summary.recurring_count, 0);
});

test("a monthly cadence with stable amounts is recurring", () => {
  const graph = buildStatementGraph(["2026-01-05", "2026-02-04", "2026-03-06", "2026-04-05"].map((t) => ({
    t, inflow_paise: 2500000, outflow_paise: 800000, payer_id: "rent",
  })), { shopName: "Monthly shop" });
  const payer = graph.entities.find((entity) => entity.kind === "payer");
  const payee = graph.entities.find((entity) => entity.kind === "payee");
  assert.equal(payer.cadence, "monthly");
  assert.equal(payer.pattern, "recurring");
  assert.equal(payee.pattern, "recurring");
  assert.equal(payer.review, true);
});

test("an empty statement still names the account holder", () => {
  const graph = buildStatementGraph([], { shopName: "Empty shop", vpa: "empty@upi" });
  assert.deepEqual(graph.entities.map((entity) => entity.kind), ["account", "vpa"]);
  assert.equal(graph.summary.counterparty_count, 0);
  assert.equal(graph.summary.recurring_count, 0);
});
