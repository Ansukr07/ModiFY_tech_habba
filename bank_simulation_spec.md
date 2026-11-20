# Bank simulation and evidence verification spec

## 1. Purpose and demo claim

ZeroCIBIL needs a third workspace for a **bank admin**. It holds synthetic customer accounts and transaction records that the business owner cannot edit. An owner requests that a selected demo account be linked to an application. The bank admin compares the application with the bank's records, confirms or rejects the match, and publishes a versioned verification result. The lender sees that result before assessing the application.

The claim shown to judges is: **"This application was checked against independent, server-owned synthetic bank records."** It is not a real bank connection, real KYC, account ownership proof, or proof that a transaction occurred. Every screen, report, and API response that presents this evidence must identify its provenance as `synthetic` and its successful status as `verified_simulated`.

### Goals

- Demonstrate separation of duties: owner submits claims; bank admin controls bank records and confirmation; lender assesses credit.
- Make the reason for verification inspectable: identity fields, account reference, transaction period, counts, totals, failed checks, reviewer, and timestamp.
- Ensure an owner cannot create verified evidence or cashflows by choosing a rail type or sending a payload.
- Ensure scoring uses only the bank-confirmed snapshot of applicable data. A pending, rejected, stale, or PDF-only request must not produce a positive principal from that evidence.
- Preserve the existing synthetic scoring policy, lender review, audit trail, and three useful demo outcomes.

### Out of scope for the hackathon

Live Account Aggregator or bank APIs, actual credential verification, uploads/OCR for PDFs, document signatures, real KYC, real loan disbursal, and a general-purpose bank core system. No user-entered transaction editor is needed for the demo.

## 2. Current system and changes required

| Existing behavior | Required change |
| --- | --- |
| `owner` and `lender` are the only roles; login accepts allowlisted demo email addresses. | Add `bank_admin` demo identity and server-side role checks. Keep the current cookie session mechanism. |
| Owner form creates a shop, posts `/api/shops/:id/rails` with a selected `aa`, `upi`, or `pdf`, then creates an application. | Owner form selects a public demo bank account reference and submits a **verification request** tied to the application. Selecting a bank account never creates a verified rail. PDF stays unverified. |
| `/api/shops/:id/rails` assigns `verified_simulated` for owner-submitted `aa`, `upi`, or `gst`; it accepts client `payload`. | Remove this route's ability to create verified evidence. Reject client trust, identity, provenance, transactions, and verification fields. Restrict this route to unverified PDF/supporting evidence or retire it for owner-facing operating rails. |
| Seeded shops already have verified rails and synthetic cashflows. | Keep legacy seeded cases readable for existing demos, but migrate bank-backed cases to bank-owned fixtures and confirmed snapshots. Do not display legacy rails as bank-admin-verified. |
| `verified_rail_count` checks a trust string, while `scorePayload` forwards all shop cashflows. | Count only a current bank-confirmed verification snapshot. Pass only linked, confirmed cashflows to scoring. Keep the existing ML `no_verified_rail` gate as defense in depth. |
| Scoring uses `application.input_revision`, copied from the shop at submission, but later rail changes update only the shop revision. | Verification confirmation must update the application evidence revision; scoring must compare the current application revision and verification ID. A changed verification invalidates the previous assessment. |
| Lender sees rail badges and a cashflow chart. | Add verification status, checks, bank record reference, reviewer/time, and source version. Show cashflows only when they belong to a confirmed snapshot. |

The current implementation touchpoints are `apps/api/src/createApp.js`, `apps/api/src/store.js`, `apps/api/src/seed/fixtures.js`, `ml/features.py`, `ml/service.py`, `ml/policy.py`, `apps/web/src/App.jsx`, `apps/web/src/pages/OwnerApply.jsx`, `apps/web/src/pages/LenderDesk.jsx`, `apps/web/src/pages/Login.jsx`, `apps/web/src/components/Shell.jsx`, and the corresponding API/web/ML tests. The UI also uses `apps/web/src/data/api.js` for requests and `apps/web/src/auth.jsx` for session state.

## 3. Roles and access

| Capability | Owner | Bank admin | Lender |
| --- | :---: | :---: | :---: |
| Enter shop details and amount | Yes, own shop | No | No |
| Select a demo account reference and request verification | Yes, own application | No | No |
| Read full bank customer and transactions | No | Yes | No |
| Review and confirm/reject verification | No | Yes | No |
| View verification summary and reasons | Own application | Yes | Yes |
| Run underwriting, stress, override | No | No | Yes |
| Change bank fixture records from UI | No | No | No |

Add `bank@demo` with role `bank_admin` to `DEMO_USERS`. Demo login remains an allowlist shortcut; the UI must call out that this is a role simulation, not production authentication. All bank routes require `requireSession` and `requireRole("bank_admin")`. Owner resource access continues to return 404 for another owner's application. Lenders must not receive full bank customer profiles or raw bank account numbers. Owners may see the selected masked account reference and public outcome, not other bank customers or raw transactions.

## 4. End-to-end workflow

1. **Seed/demo setup.** `seedDb` loads deterministic synthetic bank customers, accounts, and transactions. Fixture IDs remain stable across restarts. The admin dashboard reads these records. Fixtures are inserted only if absent, so an ordinary seed call does not duplicate them.
2. **Owner application.** Owner enters business name, type, city, and requested amount. They choose a demo bank account from a safe selector exposing only label, masked account reference, and scenario hint. The owner can choose a PDF-only path instead. The backend creates the shop and application as today, then records a request for the selected account. A new request starts `pending` and has no verified rail or credit-bearing cashflow.
3. **Bank queue.** Bank admin sees pending requests, linked application and shop claim, selected bank account, and a preliminary comparison. Queue ordering is newest first; filters include pending, verified, mismatch, and insufficient evidence.
4. **Review detail.** Admin sees claimed identity alongside bank customer identity; account status and masked number; dated transaction table and totals; source integrity checks; and a clear recommendation. The recommendation is computed server-side. The admin confirms or rejects with a required reason for rejection. The admin cannot override a failed identity match into verified.
5. **Publish result.** Confirmation creates a read-only verification snapshot with `verified_simulated`, linked rail(s), allowed cashflow rows, check outcomes, fixture version/hash, reviewer ID, time, and audit reference. Rejection records `mismatch` or `insufficient_evidence`, with no verified rail. The application evidence revision increments. The operation is idempotent.
6. **Owner and lender update.** Owner timeline changes from "Verification pending" to "Simulated bank verified" or a plain-language reason for failure. Lender queue and detail show the same status and link to the evidence summary. The lender can score only the latest evidence revision; if verification is pending or rejected, scoring may return the existing `UNVERIFIED`/zero-principal outcome rather than an offer.
7. **Assessment.** The lender runs the existing scoring service. The API builds `scorePayload` from the confirmed snapshot only. The decision stores `verification_id`, `evidence_revision`, and source hash. A later change to evidence marks the decision stale and requires reassessment before its terms are displayed as current.

### State transitions

```text
no_request -> pending -> verified_simulated
                     -> mismatch
                     -> insufficient_evidence

pending may be resubmitted after owner correction as a new request/version.
verified_simulated is never silently edited; a new verification supersedes it.
```

"Verified" is a source check, not a credit decision. A verified account can still have suspicious activity and receive `DECLINE` from the existing authenticity policy. Conversely, a failed bank check never becomes an offer merely because the ML authenticity estimate is high.

## 5. Synthetic bank data and verification records

Use separate collections in `store.js` for `bank_customers`, `bank_accounts`, `bank_transactions`, and `verification_requests`. Keep bank source data server owned. Add Mongo indexes for account reference, account transaction lookup, request status/creation time, application/current request, and unique idempotent review actions. The memory store must expose the same collections for tests and local demo mode.

### Bank customer

```json
{
  "_id": "bank-customer-clean",
  "display_name": "Lakshmi Stores",
  "business_name_normalized": "lakshmi stores",
  "city": "Bengaluru",
  "identity": { "vpa": "lakshmistores@upi", "gstin": "29AABCU9603R1ZX" },
  "provenance": "synthetic",
  "fixture_version": "bank-v1"
}
```

Only compare fields that are present on **both** sides. Define normalization for display name (trim, case fold, collapse spaces) and exact comparison for structured IDs after safe canonicalization. A missing structured ID is `not_available`, never a match. Do not expose full identifiers in owner/lender views.

### Bank account and transaction

```json
{
  "_id": "bank-account-clean",
  "customer_id": "bank-customer-clean",
  "public_ref": "DEMO-ACCT-001",
  "masked_number": "•••• 1042",
  "status": "active",
  "rail_types": ["aa", "upi"],
  "provenance": "synthetic",
  "fixture_version": "bank-v1"
}
```

```json
{
  "_id": "bank-tx-clean-001",
  "account_id": "bank-account-clean",
  "posted_at": "2026-01-05",
  "amount_paise": 4200000,
  "direction": "credit",
  "payer_id": "p_0",
  "source_rail": "upi",
  "provenance": "synthetic"
}
```

Amounts remain integer paise. Transaction IDs must be unique. A deterministic fixture version and a SHA-256 hash of the selected source rows make the shown verification reproducible; the hash demonstrates that the snapshot did not change within the demo, not that a bank signed the data. The bank dashboard can show transaction rows, while lender views receive only aggregates and the rows needed for the existing cashflow chart if approved.

### Verification request and immutable result

```json
{
  "_id": "verification-request-id",
  "application_id": "application-id",
  "shop_id": "shop-id",
  "owner_id": "user-owner",
  "account_id": "bank-account-clean",
  "status": "pending",
  "created_at": "ISO timestamp",
  "evidence_revision": 1,
  "result": null
}
```

On review, set a result containing `outcome`, `checks` (each `name`, `status`, `reason`, and compared masked values), `covered_from`, `covered_to`, `transaction_count`, `total_credit_paise`, `total_debit_paise`, `source_hash`, `fixture_version`, `reviewed_by`, `reviewed_at`, `reason`, and `audit_reference`. Preserve old requests/results; a new request supersedes rather than rewrites them. Add `current_verification_id` and `evidence_revision` to the application. Do not place the bank's raw customer identity or transactions in the result returned to owners.

### Deterministic demo cases

| Case | Fixture behavior | Expected verification | Scoring consequence |
| --- | --- | --- | --- |
| Lakshmi Stores | Name/VPA match; active account; adequate dated transactions | `verified_simulated` | Existing authenticity and capacity policy runs; positive terms possible. |
| Identity mismatch | Owner claims an account belonging to a differently named business or supplies a conflicting VPA | `mismatch` | Zero principal; show mismatch reason. |
| Insufficient history | Matching customer with too few dated transactions or inactive account | `insufficient_evidence` | No verified operating rail; `UNVERIFIED`, zero principal. |
| PDF only | No bank account selected | No bank verification; PDF remains `unverified` | `UNVERIFIED`, zero principal. |
| Suspicious activity | Identity matches but transaction pattern has an empty period/spike or one dominant payer | `verified_simulated` source, flagged activity | Existing `p_auth`/policy may decline; show distinction between source verification and transaction authenticity. |

The seed fixtures in `apps/api/src/seed/fixtures.js` already model clean, PDF-only, mule-like, and GST-gap shops. Map these intentionally to bank scenarios without changing their underwriting meanings. Do not treat GST as a bank-origin source: if the dashboard shows GST, label it as a separate simulated external registry fixture and keep it outside bank confirmation until that source has its own verification path.

## 6. Verification rules

The backend computes checks from bank-owned rows. Minimum conditions for `verified_simulated`:

1. Account reference resolves to one active bank fixture.
2. Account is linked to exactly one bank customer.
3. The claimed business name matches the customer name after normalization, and every structured ID supplied on both sides matches. Any explicit conflict is `mismatch`.
4. Transactions used for assessment belong to that account, have unique IDs, valid dates, integer paise amounts, and supported direction/rail types.
5. The source has enough history for the demo policy: at least eight distinct weeks with nonzero activity. This threshold is an explicit demo rule; the scoring policy may further restrict terms.

If the account is absent, inactive, malformed, or history is short, return `insufficient_evidence` with the failing checks. If identity conflicts, return `mismatch`. No bank admin action can convert a failed rule into a verified result. A bank admin may reject an otherwise passing request with a recorded reason, resulting in `insufficient_evidence`/manual rejection, never a verified rail.

For the demo, confirmation is a human review action after the deterministic checks pass. The dashboard shows the suggested result before confirmation, but no application is verified until the admin acts. Repeated clicks with the same idempotency key return the same result. A second review of an already resolved request returns 409; corrections use a new request.

## 7. API contract

All routes below sit under `/api`; examples show the full path. Use the existing `{ "data": ... }` envelope and `sendError` error shape with `request_id`. Mutating routes require `Idempotency-Key`, mirroring application and score routes. Input validation is server side; unexpected trust/provenance/transaction fields in owner requests return 422 `TRUST_NOT_CLIENT`.

### Owner-facing

| Method and route | Purpose | Request | Response / notes |
| --- | --- | --- | --- |
| `GET /api/bank/demo-accounts` | Safe account selector. Owner only. | None | `[{ public_ref, label, masked_number, scenario_hint }]`; no balances, transactions, identities, or internal account ID. |
| `POST /api/applications/:id/verification-requests` | Request bank review for own application. | `{ "public_ref": "DEMO-ACCT-001" }` plus idempotency key | `201` `{ id, status:"pending", application_id, evidence_revision }`; owner cannot set outcome/rail/payload. Reject nonexistent account with 422; return 404 for another owner's application. |
| `GET /api/applications/:id/verification` | Read safe current status. | None | Outcome, human-readable check reasons, masked account, timestamps, version, and `is_current`; no raw bank records. Owner and lender access, owner scoped. |

Keep `POST /api/shops/:id/rails` only for `pdf` as `unverified` and `udyam` as `supporting`, if those choices remain in the form. Reject owner `aa`, `upi`, and `gst` promotion through this route. The preferred owner flow creates the application first, then requests verification. If request creation fails after application creation, leave the application visible with "verification not requested" and a retry action; do not silently imply pending verification.

### Bank admin

| Method and route | Purpose | Request | Response / notes |
| --- | --- | --- | --- |
| `GET /api/bank/dashboard` | Queue counts and overview. | None | Counts by status, recent requests, no scoring terms. |
| `GET /api/bank/verification-requests?status=pending&limit=50` | Review queue. | Optional status/limit | Sorted newest first, bounded limit and cursor if needed. Return applicant/shop summary, masked account, created time, preliminary recommendation. |
| `GET /api/bank/verification-requests/:id` | Detail for review. | None | Owner claim, bank customer, account, computed checks, transaction summary and rows, source hash, prior outcome if resolved. |
| `POST /api/bank/verification-requests/:id/decision` | Confirm or reject. | `{ "action":"confirm" }` or `{ "action":"reject", "reason":"..." }`, idempotency key | `200` immutable result. Confirm requires all mandatory checks to pass; else 422 `CHECKS_FAILED`. Already resolved with another key: 409 `ALREADY_REVIEWED`. |
| `GET /api/bank/accounts/:id/transactions?limit=50` | Paginated bank-only transaction inspection. | Optional limit/cursor | Source rows, never accessible to owner/lender. Can be folded into detail route for a small demo. |

### Lender and shared existing routes

| Existing route | New behavior |
| --- | --- |
| `GET /api/applications` | Include `verification_status`, `evidence_revision`, `decision_is_current`, and count of **confirmed** rails. Owners see only own rows; bank admin uses the bank queue, not this endpoint. |
| `GET /api/applications/:id` | Include safe verification summary for owner/lender; lender gets confirmed scoring cashflows and source references. No unconfirmed bank transactions. |
| `POST /api/applications/:id/score` | Lender only. Require `expected_input_revision`/evidence revision to equal current values. Build payload from current confirmed snapshot. If none, return `UNVERIFIED`/zero principal through existing policy. Persist verification ID/hash on decision. |
| `POST /api/applications/:id/stress` | Use the same confirmed snapshot and current decision; reject stale decision with 409. |
| `GET /api/applications/:id/report` and `/audit` | Add verification result ID, status, checks summary, reviewer/time, fixture version/hash, and relevant audit events; retain synthetic caveat. |
| `POST /api/admin/seed` | Keep lender-only demo seed/reset semantics, but avoid duplicate bank fixture insertion. Do not let this route mutate reviewed results during a live demo. |

Suggested errors: `VERIFICATION_PENDING`, `CHECKS_FAILED`, `ALREADY_REVIEWED`, `STALE_REVISION`, `TRUST_NOT_CLIENT`, `INVALID_ACCOUNT_REFERENCE`, and `IDEMPOTENCY_CONFLICT`. Use 401 for missing session, 403 for wrong role, and 404 for non-owned owner resources. The API must never trust client-submitted `trustClass`, `identity_match`, `provenance`, `source_hash`, `cashflows`, or `verified_rail_count`.

### Example review response

```json
{
  "data": {
    "id": "verification-request-id",
    "status": "verified_simulated",
    "application_id": "application-id",
    "account": { "public_ref": "DEMO-ACCT-001", "masked_number": "•••• 1042" },
    "checks": [
      { "name": "business_identity", "status": "pass", "reason": "Business name and VPA match bank fixture" },
      { "name": "account_status", "status": "pass", "reason": "Active in synthetic bank fixture" },
      { "name": "transaction_history", "status": "pass", "reason": "12 distinct weeks available" }
    ],
    "covered_from": "2026-01-05",
    "covered_to": "2026-03-23",
    "transaction_count": 72,
    "provenance": "synthetic",
    "fixture_version": "bank-v1",
    "source_hash": "sha256-hex",
    "reviewed_by": "user-bank-admin",
    "reviewed_at": "ISO timestamp"
  }
}
```

## 8. Bank admin dashboard

Frontend route: `/bank` for overview and `/bank/verification/:id` for detail, protected by `Protected role="bank_admin"` in `App.jsx`. Add a bank-specific navigation state in `Shell` or a small dedicated shell that follows the existing visual system. Login quick action and post-login redirect must handle the third role. The landing page may link to the bank demo, explicitly marked synthetic.

### Overview

- Header: **Bank simulation**, with visible **Synthetic records** badge and signed-in admin identity.
- Four useful counts: pending review, verified simulated, mismatch, insufficient evidence.
- Queue table: request ID, business claim, masked account, requested amount, submitted time, check recommendation, status, action.
- Filter tabs and an empty state with a link to the owner demo flow. No decorative financial KPIs that the bank fixtures do not support.

### Review detail

- Left column: owner-submitted shop claim and application context.
- Right column: bank customer and masked account record, provenance/fixture version.
- Comparison table: business name, VPA, GSTIN where available, account status, with `pass`, `fail`, or `not available` per row. Never make missing values look matched.
- Transaction section: date range, distinct active weeks, inflow/outflow totals, count, and a paginated bank-only table. Highlight duplicate/malformed rows and short history.
- Review decision panel: server-computed recommendation and reasons, `Confirm simulated verification` and `Reject with reason`. Disable confirm for failed mandatory checks; server enforces the same gate. Show reviewer and timestamp after action.
- Audit strip: request created, checks evaluated, review recorded, snapshot published, evidence revision updated. On failure, show a retryable error without changing the displayed outcome.
- Accessibility: semantic table headers, text labels alongside colors, keyboard-operable controls, visible focus, `role="alert"` for errors, and a confirmation state that remains understandable without a chart.

### Owner and lender changes

Owner form replaces the current "choose simulated rail" selector with a masked demo bank account selector plus PDF-only option. The owner tracking page shows `not requested`, `pending`, `verified simulated`, `mismatch`, or `insufficient evidence`, with a short reason and next action. It never claims real verification. Lender queue shows bank status separately from scoring verdict; lender detail shows the check summary and a source-to-score link. The lender's existing authenticity percentage stays labeled an **activity estimate** and is distinct from the bank's source verification outcome.

## 9. Wiring to scoring and persistence

1. `seedDb` owns synthetic bank fixture generation. Do not copy owner form values into bank customer records.
2. Verification request stores the application/shop/account linkage. Evaluate checks by reading `bank_*` collections, not owner-controlled rail payloads. Use a stable transaction ordering before hashing.
3. On successful confirmation, create a confirmed evidence snapshot. Derive `aa`/`upi` rail records and the cashflows used by scoring from that snapshot, with `verification_id` and source transaction IDs. Avoid creating duplicate rails/cashflows on repeated reviews. The safest small implementation is to keep the snapshot as the source of truth and derive the score payload from it, rather than copying bank rows into mutable shop-wide `rails`/`cashflows`.
4. Make `verifiedCount` and `ml/features.py:verified_rail_count` agree: only bank-confirmed rails for the current application count. Preserve PDF exclusion. Do not count multiple labels on the same account as independent sources unless their fixture feeds really differ; a single bank account may provide one verified source even if the dashboard displays both AA and UPI labels.
5. `scorePayload` includes only the current confirmed snapshot's rails and cashflows, and carries `verification_id`, `source_hash`, and evidence revision for audit. The ML service does not decide whether a bank admin confirmed a request; the API enforces that trust boundary. ML still rejects protected attributes and computes activity authenticity/stress after the verified-source gate.
6. When verification changes, increment application evidence revision. `score` checks the client's expected revision, persists the used revision/hash, and the UI marks any older decision stale. No stale decision is offered as current terms. The existing shop `input_revision` and application `input_revision` must be reconciled so owner edits and bank confirmation both invalidate scoring; use one application-level current evidence revision consistently.
7. Write audit events for request creation, successful/failed review attempt, snapshot publication, and scoring. Include actor, request ID, application ID, verification ID, source hash, policy/fixture version, timestamp, and outcome. Keep sensitive bank values out of generic audit payloads.

## 10. Demo script and acceptance criteria

### Suggested five-minute walkthrough

1. Sign in as `owner@demo`, create a Lakshmi Stores application, select `DEMO-ACCT-001`, and show **Verification pending**.
2. Sign in as `bank@demo`, open the pending request, compare identity and dated transactions, confirm, and show the immutable result and audit strip.
3. Sign in as `lender@demo`, see the confirmed source and run assessment. Point to the same verification ID/hash and show how the weakest four weeks affect terms.
4. Repeat with a conflicting account. Bank dashboard highlights the mismatch and refuses confirmation; lender gets zero principal.
5. Open PDF-only and short-history cases. Show why neither is silently promoted to verified evidence. Optionally show a source-verified but suspicious-activity case that the ML policy declines.

### Functional acceptance criteria

- An owner POSTing `type:"upi"`, `trustClass:"verified_simulated"`, forged `identity_match`, or arbitrary `payload` cannot create a verified rail.
- An owner cannot access bank customer/transaction routes or another owner's verification; lender cannot perform bank review.
- Pending and rejected requests contribute zero verified sources and zero bank-sourced scoring cashflows.
- Bank confirmation succeeds only when the source account is active, identity checks pass, rows are valid, and history meets the demo threshold.
- Bank review is idempotent; refresh and double-click do not duplicate rails, cashflows, decisions, or audit success events.
- A verified source with suspicious cashflow can still be declined by the authenticity policy; a high authenticity estimate cannot override a failed bank check.
- A verification change invalidates a previous decision and a stale score request returns 409.
- Owner, bank, lender, report, and audit views agree on status, source version/hash, and synthetic provenance.
- Memory and Mongo modes produce the same outcomes for clean, mismatch, insufficient, and PDF-only fixtures.

### Tests to add/update

- API role isolation and owner resource scoping; forged trust/payload rejection; valid/invalid review; idempotent review; stale revision; confirmed-only score payload; decision invalidation; Mongo index/seed behavior.
- ML policy tests for no confirmed source, mismatch, suspicious verified source, and PDF-only zero principal. Keep current `test_policy.py` cases that cover underwriting behavior.
- Frontend flow tests for third-role login redirect, owner pending/result states, bank review controls, and lender status display. A single end-to-end browser walkthrough of the three core cases is valuable before the presentation.

## 11. Implementation order

1. Add bank fixtures, collections, indexes, and `bank_admin` role.
2. Close owner rail promotion and introduce owner verification request API.
3. Implement server-side checks, bank review APIs, immutable result, audit, and application evidence revision.
4. Wire confirmed-only evidence into `scorePayload`, lender summary/detail/report, and stale-decision handling.
5. Build bank dashboard and update owner/lender screens and login/landing navigation.
6. Run API/ML/web tests and rehearse the clean, mismatch, and PDF-only paths in both memory and Mongo modes if Mongo is part of the live demo.

The smallest credible presentation uses one server-owned bank account source, three deterministic cases, one admin review screen, and the existing scoring engine. Additional source types can be added after this path is working end to end.
