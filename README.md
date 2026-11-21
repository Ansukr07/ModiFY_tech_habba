# ZeroCIBIL

ZeroCIBIL is a two-sided underwriting demo for credit-invisible MSMEs. Owners submit a shop application and simulated evidence; lenders review the evidence, model signals, cashflow capacity, and proposed terms. The product is built around synthetic demo data and does not disburse loans. See [design.md](design.md) for the visual system, [features-spec.md](features-spec.md) for remaining work, and [backend.md](backend.md) and [frontend.md](frontend.md) for implementation contracts.

## Run locally

You need Node.js, Python, and a MongoDB server. The API defaults to `mongodb://127.0.0.1:27017/zerocibil`; override it with `MONGODB_URI` in the root `.env` file. The API reads that root `.env` and defaults to port 4000. Vite proxies `/api` to it.

Start the scoring service in one terminal:

```powershell
cd ml
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn service:app --host 127.0.0.1 --port 8000
```

Start the API in another terminal:

```powershell
cd apps/api
npm ci
npm run dev
```

Start the web app in a third terminal:

```powershell
cd apps/web
npm ci
npm run dev
```

Open `http://localhost:5173`. The API seeds demo records when it starts. Use `owner@demo`, `lender@demo`, or `bank@demo` on the login screen. From an empty lender queue, use **Seed and score demo applications** to populate and assess the cases. Owner submissions are stored through the API; simulated bank review and evidence fixtures are available in the owner/bank flows.

### Setu Account Aggregator sandbox

Create an AA FIU sandbox product in [Setu Bridge](https://bridge.setu.co/) and put its **test** credentials in the root `.env` as `SETU_CLIENT_ID`, `SETU_CLIENT_SECRET`, and `SETU_PRODUCT_INSTANCE_ID`. The owner form then offers **Setu Account Aggregator sandbox**. Configure Setu's hosted consent return URL to `https://<your-web-origin>/owner/aa/return`; the application page checks consent and data status after return and has a retry button if the FIP is still preparing data. Setu's [published mock FIP window](https://docs.setu.co/data/account-aggregator/fi-data-types) is January–June 2021, so this sandbox request uses that historical range and the business name must match the test account holder for eligibility. If Setu supports a Bearer token on AA notifications, configure `SETU_AA_WEBHOOK_TOKEN` and point the notification callback at `/api/aa/setu/webhook`. The callback confirms consent state through Setu APIs; owner refresh also fetches the FI data session. The offline bank admin path remains a separate synthetic demo. See [sdk-spec.md](sdk-spec.md) for the integration contract. This code does not connect real bank accounts. Sandbox FI transactions are encrypted with a key derived from `SESSION_SECRET`/`JWT_SECRET`; keep that secret stable while evidence is retained, and use a dedicated KMS key before any live deployment.

For production, set `APP_ENV=production`, a MongoDB replica-set or sharded-cluster URI with TLS enabled for remote databases, a session secret of at least 32 characters, and the same `SCORER_API_KEY` of at least 32 characters in the API and scoring-service environments. Set `CORS_ORIGIN` to the HTTPS browser origin. A remote `SCORE_URL` must use HTTPS; HTTP is accepted only for a loopback scorer on the same host. Put the API behind exactly one trusted reverse proxy: it trusts one forwarded hop in production and does not trust forwarded client IPs locally. The API writes structured access logs without query strings and applies per-process limits of 60 login attempts, 300 reads, and 120 other writes per client IP per minute (health checks are exempt). Use a shared rate limiter and centralized log retention for multi-instance production. Production application, evidence, bank-review, assessment, and lender-action writes use Mongo transactions. The scoring service requires the key on every endpoint, including health. Local development binds the scorer to loopback and can omit the key.

The API flags dated verified activity older than 90 days for lender review only. Set `EVIDENCE_REVIEW_AGE_DAYS` and `EVIDENCE_FRESHNESS_VERSION` to configure and version this cue; it never changes assessment eligibility, scores, or terms. Undated AA and PDF evidence remains unknown.

For an in-memory API store, set `MONGODB_URI=memory` in the root `.env`. This is temporary demo storage and is cleared when the API process stops. `npm run seed` in `apps/api` loads seed data into the configured MongoDB.

## Checks

Run each package's checks from its directory:

```powershell
# apps/web
npm test
npm run build

# apps/api
npm test
```

Python service tests live under `ml/` and can be run with `python -m pytest` after installing the dependencies.

## Product limits

- Shop, transaction, rail, statement, and bank-review examples are synthetic or simulated. Keep those labels visible in the UI and reports.
- Trained authenticity and stress scores are uncalibrated for Indian MSME lending. Policy verdicts and terms use the versioned heuristic policy; a model probability is not a real default or fraud probability.
- PDF uploads are supporting context, not verified operational rails.
- A lender action records a demo workflow decision. Setu AA uses sandbox test data only; there is no live AA/GST provider connection, credit agreement, or loan disbursal.
