# Business owner workflow — demo guide and implementation

## Goal

The owner experience now has a clear path: **sign in → dashboard → apply → track → view assessment**. The dashboard is the starting point and a persistent home for every application. This is a synthetic demonstration of an MSME applying without a CIBIL file; it does not connect a live financial account, promise a loan, or disburse funds.

## What changed

| Surface | Route | Purpose |
| --- | --- | --- |
| Owner dashboard | `/owner` | Summarises total, awaiting, and assessed applications; lists each application with business name, requested amount, date, status, and a link to tracking. Shows a useful first-use state when no applications exist. |
| Guided application | `/apply` | Groups the form into business details, simulated shop evidence, and funding request. Explains the PDF limitation and the meaning of submission. |
| Application tracking | `/owner/application/:id` | Shows current status, a three-stage timeline, request details, evidence source, and the assessment result when one exists. A refresh button fetches the latest server state. |
| Owner navigation | Shared shell | Adds Dashboard next to Apply. The owner login now opens `/owner`. |

All owner routes require an owner session. The owner list API filters by the signed-in owner, and the individual application and shop APIs enforce owner access. Lender routes remain lender-only.

## Presenter walkthrough

1. Open the app and choose **Explore as owner**. Sign in as `owner@demo`.
2. Start at **Your business, in view**. Point out the three counts and the application tracker. A fresh owner account shows the empty state and **Start an application**.
3. Choose **New application**. Enter a business name, type, city, and requested rupee amount. Select **Merchant UPI (simulated)** for the primary example.
4. Explain the evidence choice: UPI and Account Aggregator are simulated verified rails; a PDF is unverified and cannot establish a credit limit. No real account connection takes place.
5. Submit. The app creates a shop, attaches the selected simulated rail, creates the application, then opens its tracking page. The initial status is **Submitted**.
6. Show the request summary and timeline. Use the dashboard link to see the new application in the list. The dashboard counts update when the page is loaded again.
7. Sign out and enter as `lender@demo`. Open the lender queue, select the newly submitted application, and run its assessment. This is the separate lender action that advances the owner status.
8. Return to the owner account, open the application, and use **Refresh status**. The tracker now shows **Assessment ready** and the result. A positive result displays the proposed principal; a decline says there is no offer; an unverified result asks for stronger evidence.

For a contrast case, repeat the application with **PDF evidence (unverified)**. The lender assessment will keep it unverified and set no credit limit. This makes the trust boundary visible in a short demo.

## Owner screen details

### Dashboard

The header provides one primary action, **New application**. Three counts summarise applications already stored for this owner: all, awaiting assessment (`submitted` or `assessing`), and assessed (`assessed`). The list sorts newest first and uses the application ID's first eight characters as a short reference. Business names are fetched through the owner's permitted shop endpoint. Each row opens its tracking page. Loading, API error, and empty states are explicit.

The counts and list are based on `GET /api/applications`, whose current limit is 50 records by default. This is enough for the demo; it is not a complete lifetime history for an owner with more than 50 applications.

### Application form

The visual sequence is three numbered sections, but all fields remain on one page so the presenter can move through it quickly. Browser required-field checks cover name, business type, city, and amount. Amount accepts positive whole rupees and is converted to integer paise for the API. The submit button disables during the request, and API failures are shown next to the form.

The submit sequence uses existing endpoints: `POST /api/shops`, `POST /api/shops/:id/rails`, and `POST /api/applications` with an idempotency key. The successful response determines the tracking URL. Submission is described as an application for lender review, never as an offer.

### Tracking page

The page loads `GET /api/applications/:id`, which returns the owner-safe application, shop, rails, and latest decision. It does not expose lender cashflow rows to the owner. The timeline uses the API's real states:

| API status | Owner label | Meaning |
| --- | --- | --- |
| `submitted` | Submitted | Application exists and awaits lender assessment. |
| `assessing` | Under review | The lender has started scoring. |
| `assessed` | Assessment ready | A decision is available below the timeline. |
| `failed` | Review interrupted | Scoring failed; the lender can retry. |

The status page is refreshed on entry or on **Refresh status**. It does not claim live updates. The result section is shown only when the API provides a decision. `UNVERIFIED` explains the need for verified evidence; `DECLINE` states that no offer resulted; other verdicts show the proposed principal. The page distinguishes assessment terms from disbursal.

## Design decisions

The owner area keeps the project's paper, ink, and lilac design language. It uses a serif heading, restrained divider lines, one strong action, and a single tracking timeline. Status is always written in text, so it is not conveyed by colour alone. All three views identify the data as synthetic. The dashboard changes to a compact layout on narrow screens; the tracker stacks into one column, and form fields remain full width. Existing focus styling and the skip link remain available to keyboard users.

## Files changed

- `apps/web/src/pages/OwnerApply.jsx`: dashboard, guided form, and tracking page.
- `apps/web/src/owner.css`: owner-specific responsive layout and states.
- `apps/web/src/App.jsx`: protected owner routes.
- `apps/web/src/components/Shell.jsx`: owner dashboard navigation.
- `apps/web/src/pages/Login.jsx`: owner login destination.
- `owner1.md`: this guide.

## Verification and current limits

`npm run build` and `npm test` in `apps/web` completed successfully; the three existing web tests passed. These checks cover compilation and seed data, not a browser walkthrough of the owner journey. The existing API already owns the application statuses and owner access checks, so the UI does not maintain a second status source. The dashboard is manually refreshed by navigation, and the detail page by its refresh button. There is no real bank connection, push notification, owner-side evidence amendment, acceptance flow, or disbursal in this demo. If one of the three submit requests fails after a shop was created, retrying can leave an unused demo shop; a transactional or resumable submission flow would be needed for production.
