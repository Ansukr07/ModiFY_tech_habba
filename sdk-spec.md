# Setu Account Aggregator integration spec

Status: sandbox adapter implemented with mock-provider coverage, 21 November 2026. Setu credentials are present locally, but the Bridge product setup is incomplete and no consent/FI flow has been verified live. There is no deployed HTTPS return URL yet. Target: Indian MSME deposit accounts. The existing demo path remains available for a hackathon walkthrough.

## Decision and cost boundary

Use **Setu AA Gateway sandbox** with its hosted consent webview and mock FIP. This is an HTTP API integration, not a required npm/browser SDK. Node's built-in `fetch` is sufficient. Setu documents self-serve test credentials, test product instance ID, hosted consent UI, and mock FI data. Test credentials are separate from live credentials, and Setu says only live transactions are invoiced. Confirm current account eligibility, sandbox access, and any pricing with Setu before relying on a free production tier. Real bank data requires FIU onboarding, KYC, Sahamati certification, and commercial approval; sandbox success alone does not grant live access. Do not describe sandbox data as real bank verified data.

Setu AA differs from Plaid: the browser receives a **consent URL**, not a temporary token to exchange. The backend creates the consent and owns Setu credentials. The browser redirects to Setu's hosted UI and later reads status from ZeroCIBIL. A redirect back to our app is UX only; backend confirmation comes from Setu's consent status/data APIs.

## Existing seams and affected modules

| Area | Current implementation | Integration change |

| --- | --- | --- |

| `apps/web/src/pages/OwnerApply.jsx` | Offers Setu sandbox or offline demo; creates the application | Setu path calls `POST /applications/:id/aa/consents`, stores the application ID for return, and redirects to Setu. Demo remains explicitly synthetic. |

| `apps/web/src/pages/OwnerDashboard.jsx`, lender pages | Owner dashboard shows Setu sandbox status, masked accounts, coverage and refresh action; lender status comes from application verification | Keep sandbox provenance explicit and surface incomplete data and stale decisions accurately. Detailed account/coverage display is currently owner-only. |

| `apps/web/src/pages/BankDashboard.jsx` | Human confirms synthetic fixtures | Keep only for simulation. AA evidence is provider sourced and must not pass through the bank admin confirm action. |

| `apps/api/src/createApp.js` | Owns AA consent, status, refresh, revoke, webhook, evidence, scoring/report and audit routes | Keep AA evidence isolated from synthetic bank collections and bind scoring to the current application evidence revision. |

| `apps/api/src/bank.js`, `seed/fixtures.js` | Synthetic account checks and transactions | Leave as demo provider. AA adapter supplies its own account and transaction mapping. |

| `apps/api/src/memoryDb.js`, `apps/api/src/mongoDb.js` | Memory/Mongo collections and indexes | AA collections and storage support are implemented. Preserve unique provider IDs and application ownership in both modes. |

| `apps/api/src/config.js`, `apps/api/src/setuClient.js` | Server-side Setu credentials and OAuth/API client | Keep credentials out of Vite/client config. The current integration is sandbox-only. |

| `apps/api/src/buildStatementPdf.js`, `apps/api/src/publicStatement.js`, `apps/api/src/publicResult.js` | Build and expose report artifacts | Preserve `aa_sandbox` provenance and current evidence revision in any report; do not imply sandbox records are live verified statements. |

| `apps/api/src/scoreClient.js`, `ml/`, `Agentic/`, `zerocibil/` | Score canonical rails/cashflows | Keep scoring interface. Map only validated, current AA snapshot to existing paise cashflows and one verified source per distinct bank account; check accepted trust/provenance enums in both Python agent copies and feature code. Never equate a bank feed with independent UPI verification. |

## Provider setup and calls

### Bridge sandbox setup for this project

Complete **Step 1 — Add configuration details** on the AA Gateway test product before testing consent creation. The last observed Bridge state had required fields empty and said Step 1 must be completed before test API keys are available. Select loan underwriting as the FIU purpose, `DEPOSIT` as the FI type, and `TRANSACTIONS`, `PROFILE`, and `SUMMARY` as consent types. Use one-time fetch, **View data** consent mode for one-time processing, and a one-month maximum data life. The application stores encrypted FI for processing and purges it at the data life deadline. No deployed HTTPS return URL exists yet: use Setu's documented `https://setu.co/` default for the sandbox rehearsal, then manually return to the local app and use owner refresh to reconcile status. Do not configure `http://localhost:5173/owner/aa/return`; Bridge rejected it as an invalid default redirect. The API overrides `redirectUrl` per consent only when `CORS_ORIGIN` is HTTPS. Leave the test callback URL unset until Setu confirms a compatible authentication method for `/api/aa/setu/webhook`; owner refresh can reconcile missed notifications. Then create a sandbox OAuth key with access to this product and use its credentials with this product's ID. The OAuth key's successful token response alone does not prove the AA product is configured.

1. Create an FIU Account Aggregator Data product in Setu Bridge. Configure a publicly reachable callback for sandbox events, obtain test `x-client_id`, `x-client-secret`, and `x-product-instance-id`; use Setu's mock FIP for repeatable cases. Setu sandbox base URL is `https://fiu-sandbox.setu.co`. Keep a separate configuration for production. The app requests the published mock deposit range, JanuaryJune 2021, with a one-time loan-assessment consent. Select Setu FIP or Setu FIP-2 in the hosted flow; this is synthetic data, not a real SBI account. Align the product's purpose settings in Bridge with purpose code 105. Setu FIP uses a dynamic OTP; Setu FIP-2 uses `123456`.

2. Backend obtains a Setu bearer token using Setu's [current authentication flow](https://docs.setu.co/data/account-aggregator/api-integration), caches it until expiry, then calls Setu with `Authorization: Bearer ...` and `x-product-instance-id`. Keep credentials server side.

3. Current code calls `POST /v2/consents` with `{vua, consentDuration:{unit:"MONTH",value:"1"}, dataRange:{from:now minus six months,to:now}, redirectUrl? , context:[]}`. Setu's consent docs say creation returns `id`, `status:"PENDING"`, and hosted `url`. The requested FI types, purpose, and consent mode must match the configured Bridge product because the current request body does not include those fields; confirm Bridge defaults and the product ID before running it. The backend persists the requested date range, owner/application linkage, consent ID and returned URL. Validate/adjust the request against Setu's [consent object](https://docs.setu.co/data/account-aggregator/consent-object) and [consent API](https://docs.setu.co/data/account-aggregator/api-integration/consent-flow) whenever product scope changes.

4. Redirect owner to Setu's returned `url`. Setu handles account discovery, OTP, account selection, and consent. On return, poll our status endpoint. Use Setu `GET /v2/consents/:id` or consent notification to confirm `ACTIVE`; do not trust a query parameter or browser success flag.

5. For `ACTIVE` consent, request a data session using Setu's [data flow](https://docs.setu.co/data/account-aggregator/api-integration/data-apis), with a range within approved consent. Wait for `PARTIAL`/`COMPLETED`, then fetch that session's FI data. Do not enable Auto-Fetch by default: Setu documents charges for successful Auto-Fetch deliveries.

6. Treat Setu notifications as triggers to reconcile status with Setu APIs. Setu AA notification docs describe consent and FI events but do not specify a universal signed webhook contract. Verify the AA product's actual callback authentication arrangement with Setu before accepting live events; the `x-setu-signature` documentation for Setu **UPI payments** must not be assumed to apply to AA. In sandbox, a protected callback can enqueue reconciliation, but never promote evidence solely from an unverified POST. Polling current consent/session state is the fallback because Setu's AA docs warn that webhook retries may be absent.

## ZeroCIBIL backend contract (`/api` prefix)

All owner routes require an owner session and resource ownership. Mutations use existing `Idempotency-Key`; responses use existing `{data}` / `{error}` envelopes. IDs in these routes are ZeroCIBIL IDs, not arbitrary Setu IDs supplied by the browser.

| Method and route | Request | Result |

| --- | --- | --- |

| `POST /applications/:id/aa/consents` | `{ "mobile":"10-digit test mobile" }` | `201 {data:{connection_id, consent_url, status:"pending_consent"}}`; backend fixes the mock data range and one-month duration, and correlates the consent to this application. FI type/purpose/scope are configured in Bridge for this product. A repeated request returns the existing connection for the same mobile; a different mobile returns `409 CONSENT_CONFLICT`. |

| `GET /applications/:id/aa/connection` | None | Owner-safe `{data:{connection_id,status,consent_url?,consent_expires_at,accounts:[{masked_number,bank_name}],covered_from,covered_to,transaction_count,reason}}`. It also enforces the consent/data retention deadline and purges expired evidence. Never return raw FI, full account number, token, or provider secret. |

| `POST /applications/:id/aa/refresh` | `{}` | `202 {data:{status}}`; backend reconciles consent, creates a session, and polls it on later refreshes. Fetch FI only after Setu reports `PARTIAL` or `COMPLETED`; return `fetching` while pending. A `FAILED`/`EXPIRED` session is purged and the next refresh starts a new session. Useful if callback is missed. The duplicate-session guard is process-local; use a database lease before running multiple API instances. |

| `POST /applications/:id/aa/revoke` | `{}` | Revoke through Setu and mark connection unusable. Increment evidence revision and invalidate any decision using it. |

| `POST /aa/setu/webhook` | Provider payload | Callback is disabled with `503` until `SETU_AA_WEBHOOK_TOKEN` is configured. When enabled, this implementation expects `Authorization: Bearer <token>`, validates known provider IDs, and reconciles consent through Setu before state changes. Confirm Setu Bridge can send this exact authentication header before enabling the callback; public AA docs do not establish that contract. FI session fetching is fully supported through owner refresh. |

The existing `POST /applications`, `GET /applications/:id`, score, stress, report and audit routes remain the application workflow. They already consume an application-scoped AA evidence view and expose a safe `verification` summary with source, status, evidence revision, account count and date coverage. `POST /applications/:id/verification-requests` remains **demo only** and rejects an AA connection ID. `/bank/*` remains a simulation admin API. The lender cannot invoke AA consent or review on behalf of an owner.

Application statuses: `pending_consent -> consent_active -> fetching -> ready | partial | insufficient_evidence | rejected | revoked | expired | failed`. `partial` is not automatically scoreable; evaluate account and date coverage first. Return `409 STALE_REVISION` for scores based on old evidence and `422 CONSENT_NOT_READY` when a caller tries to score unready AA data. Provider outages remain retryable and do not silently fall back to synthetic verification.

## Normalization and scoring boundary

Persist the raw response only if required, encrypted with a managed key and a short retention period. Prefer storing normalized records plus a stable source hash. For each Setu `DEPOSIT` account, derive a provider-scoped stable account key from consent/FIP/link reference; store masked number only for display. For each transaction map `txnId`/`reference`, account key, transaction and value timestamps, `CREDIT`/`DEBIT`, decimal INR amount to **integer paise** without binary-float rounding, narration, mode, and source provenance. A credit maps to `inflow_paise`; debit to `outflow_paise`. Do not assume `mode=UPI` means independent UPI source verification. Reject or quarantine malformed amounts/dates and unsupported currencies. Deduplicate by provider account plus stable transaction ID, with a documented fallback for missing IDs; handle pending-to-posted changes as updates. Upsert, then sort canonically before hashing.

Publish one immutable evidence snapshot for the application after consent is `ACTIVE`, FI fetch succeeds, and required records pass validation. Require enough **distinct calendar weeks**, not merely distinct dates; `inspectBank` currently counts dates and is only for synthetic fixtures. A name in AA profile is supporting identity evidence, not guaranteed proof that the shop legally owns the account; handle mismatch or unavailable profile as insufficient evidence. `source=aa_sandbox` stays labeled simulated and must never receive `aa_live` trust. Live `aa` trust is granted only by backend state after provider reconciliation. Pending/rejected/expired/revoked connections contribute zero verified sources and zero bank cashflows. On a new snapshot or revocation increment application `evidence_revision`/`input_revision`, invalidate stored terms, and bind scoring/report/audit to consent ID, session ID, source hash, covered range and version without logging raw descriptions or credentials.

Use an application-scoped snapshot in `createApp.js`'s existing evidence/`scorePayload` path. Do not copy bank transactions into owner-editable `rails` or shop-wide cashflows. Keep the existing `verifiedCount` and Python `verified_rail_count` aligned: count one distinct AA account once, and only if its current snapshot is eligible. Apply the same current-snapshot rule to stress and override approval.

## Security, failure handling, and tests

- Restrict Setu base URL to configured sandbox/production values; do not accept browser URLs. Keep secrets out of client bundles, logs, audit events and error responses. Encrypt retained sensitive FI, track the consent `dataLife` deadline (30-day fallback from first confirmed active consent), and purge rows and masked account details on that deadline, consent expiry, rejection or revocation. Expired data must not remain scoreable.

- Verify callback origin/authentication under the AA product's actual mechanism, bound provider IDs, and replay/idempotency before changing state. A network error leaves state `fetching`/retryable; explicit rejection or expiry closes the connection. Check provider status again on refresh if a notification is missing.

- Test sandbox happy path, rejection, expiry/revocation, partial data, short history, malformed money/date, duplicate notification, duplicate transaction, missed callback plus refresh, owner isolation, forged callback, and stale score. Run the existing API and ML test suites after adding the adapter. Use mock FIP responses in automated tests; do not require live credentials in CI.

## Delivery status and next actions

Implemented in this repository: server-side sandbox auth/API client; consent persistence; owner consent, connection, refresh and revoke endpoints; hosted consent redirect and return route; normalized/encrypted FI storage; application-scoped evidence, score/report/audit provenance and revision invalidation; separate offline demo path; mock-provider API coverage.

1. **Setu account setup:** finish Bridge Step 1, verify the FI purpose/types and consent mode against the request and product configuration, create/use the correct sandbox OAuth credentials/product ID, and rehearse consent plus mock-FIP FI fetch. No live sandbox flow has been verified yet.
2. **Return URL:** deploy the web app with HTTPS, configure the Bridge default redirect to that origin plus `/owner/aa/return`, and set the API `CORS_ORIGIN` to that HTTPS origin so consent requests return to the app. Until then use the Setu default redirect and manually reopen the local app to refresh.
3. **Notifications:** confirm which auth header Setu Bridge can send. Keep the callback unset and rely on owner refresh until this is confirmed; the current Bearer-token endpoint is not yet provider-verified.
4. **Production:** obtain FIU onboarding/certification/commercial approval and a live product before connecting real bank data. Keep sandbox and production credentials, base URLs, callback arrangements and labels separate. Do not silently swap a production failure for synthetic evidence.

Keep the existing synthetic route as an explicitly named fallback for the hackathon demo. Automated API tests use a mock Setu provider and do not prove the external sandbox product is configured.

## Primary references

- [Setu AA quickstart and sandbox credentials](https://docs.setu.co/data/account-aggregator/quickstart)

- [Setu consent flow](https://docs.setu.co/data/account-aggregator/api-integration/consent-flow)

- [Setu data sessions and FI fetch](https://docs.setu.co/data/account-aggregator/api-integration/data-apis)

- [Setu AA notifications](https://docs.setu.co/data/account-aggregator/api-integration/notifications)

- [Setu test versus live credentials](https://docs.setu.co/dev-tools/bridge/settings)

- [Setu FIU go-live requirements](https://docs.setu.co/data/account-aggregator/licenses-and-go-live/go-live)

