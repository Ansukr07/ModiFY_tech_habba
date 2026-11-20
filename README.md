# ZeroCIBIL

Credit for credit-invisible MSMEs, shown through a synthetic two-role frontend demo. The visual direction comes from `ui inspo.jpg` and is documented in [design.md](design.md). [spec.md](spec.md) defines the product; [frontend.md](frontend.md) and [backend.md](backend.md) describe the implementation contracts.

## Run the frontend

```powershell
cd apps/web
npm ci
npm run dev
```

Open the Vite URL printed by the command (normally `http://localhost:5173`). The entry page leads to the owner examples and lender queue. The queue links to clean kirana, PDF-only, mismatch, declined, short-history, and fairness-twin samples. The evidence page compares the synthetic seed outcomes.

```powershell
npm test
npm run build
```

The current frontend uses fixed synthetic fixtures. It does not save applications, call trained models, recalculate terms from the stress slider, persist audits, or disburse loans. These flows depend on the services and policy described in [backend.md](backend.md). The UI labels sample figures and unverified evidence explicitly.
