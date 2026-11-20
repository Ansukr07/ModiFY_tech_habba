# ZeroCIBIL design system

**Authority:** `ui inspo.jpg` (Goit-style paper finance marketing). Use these tokens in **web, later mobile, pitch slides, and API-adjacent admin**. Do not drift into dark fintech, neobrutalism, or electric-blue banking chrome.

**Mode:** Product surfaces are **Operate** (owner apply, lender desk). Marketing/pitch can use the same type and pills as the inspo **Persuade** hero.

**Product name in UI:** ZeroCIBIL  
**Mark:** Four black squares in a 2×2 cluster with a 1px gap (from the inspo logo). Not a generic bank building.

---

## 1. Scene

White paper on a desk at noon. Black ink for decisions. Lilac is the only “data” colour — bars, tags, one chart series. Green is money-in; it is never the brand.

---

## 2. Colour

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#FFFFFF` | Page ground |
| `--paper-2` | `#F6F6F4` | Alternate band, table header |
| `--ink` | `#111111` | Text, primary buttons, logo |
| `--ink-2` | `#5C5C5C` | Secondary text (still ≥4.5:1 on paper) |
| `--line` | `#E8E8E4` | Hairlines, card edges |
| `--lilac` | `#C4B5FD` | Data bars, allocation, selected chip |
| `--lilac-2` | `#EDE9FE` | Soft tag fill, chart track |
| `--lilac-deep` | `#7C5CBF` | Lilac text on white if needed for contrast |
| `--blue-tag` | `#3B6BFF` | Rare annotation chip (inspo “Smart Asset Allocation”) |
| `--yellow-tag` | `#F5E27A` | Callout stickers |
| `--gain` | `#147A3A` | Inflow / +% (not lime) |
| `--loss` | `#B42318` | Outflow / decline |
| `--warn` | `#9A6700` | Unverified rail |
| `--black-btn` | `#111111` | Pill CTA |
| `--white` | `#FFFFFF` | Ghost CTA fill |

**Do not** use `#1747FF` from the old Qredible clone. ZeroCIBIL is paper + black + lilac.

**Selection / caret / scrollbar:** ink and lilac-2. Focus ring: `2px solid #111` offset 2px.

---

## 3. Type

| Role | Face | Notes |
|---|---|---|
| Display | **Source Serif 4** | Hero, page titles, offer amount. Weight 600. Tracking −0.03em. Max ~4.5rem on product, ~5.5rem on marketing. |
| UI | **Sora** | Nav, labels, buttons, tables. Weights 400 / 500 / 600. |
| Numerals | Sora, `font-variant-numeric: tabular-nums` | Money, EMI, percents |

Load from Google Fonts once in the app shell. Do not mix Inter/Instrument Serif from the Qredible experiment.

**Scale (product):**

- Display: 40–48px  
- Title: 28px  
- Body: 16px / 1.5  
- Small: 13px  
- Micro: 11px, letter-spacing 0.08em, uppercase only for rail badges

**Ban:** kicker/eyebrow labels above headings. The heading is the heading.

---

## 4. Shape and depth

- **Pills:** 999px radius for primary/secondary buttons and status chips.  
- **Cards:** 20–24px radius, 1px `--line`, shadow `0 12px 40px rgba(17,17,17,0.06)` (soft, offset down — not a glow).  
- **Phone / nested widgets:** 16px inner radius.  
- **Inputs:** 14px radius, 1px line, 12px 14px padding.

---

## 5. Components (shared)

### Buttons

- **Primary:** black pill, white text, arrow → on the right for forward actions (`Get Started`, `Score application`).  
- **Secondary:** white pill, 1px ink border, black text (`Download`, `Save draft`).  
- **Ghost:** text only, ink-2.  
- Height ~44px product, ~40px dense lender table.

### Nav

- Left: mark + wordmark.  
- Centre (marketing only): Feature / Services-style links. Product nav is role links: Apply, Queue, Evidence.  
- Right: black pill CTA.

### Tags / stickers

Floating annotation language from the inspo: small filled rectangles with a pointer (blue or yellow). Use for **Verified rail**, **Unverified PDF**, **Synthetic**. Not for decoration on every card.

### Metric cluster

Uptime-style **lilac vertical bars** (weekday or weekly inflow). 99.99%-style large numeral + caption. Use on lender desk for lean-month ratio, not as empty hero metrics.

### Cards (operate)

One elevation. No nested cards. No coloured left border.

### Status (never colour-only)

- `STANDARD` — black pill “Offer”  
- `THIN_FILE` — lilac-2 pill “Thin file”  
- `UNVERIFIED` — yellow-tag “Collect data”  
- `DECLINE` — outline “Decline” + text  
- `STEP_UP` — black outline “Step-up”

### Provenance

Every cashflow block includes a **Synthetic** sticker. Required by Track 01.

---

## 6. Layout

- Max content 1120px, padding 24–40px.  
- Marketing hero: centred serif, two pills, then a **composition of widgets** (phone + satellite cards), not a full-bleed photo.  
- Lender desk: **header band**, then **three columns** (trust | cashflow | terms) on ≥1200px; stack on small screens.  
- Owner apply: single column, max 640px, serif title, pill continue.

---

## 7. Motion

One authored moment per screen: offer numbers count up once on score. Elsewhere: 180ms opacity on route. Honor `prefers-reduced-motion`.

---

## 8. Iconography

Single-weight stroke icons (inline SVG). No emoji as UI. Logo is the 2×2 squares, not a rupee.

---

## 9. Imagery

No stock “happy banker.” If a device is shown, it is a **white-bezel phone** with ZeroCIBIL UI inside, like the inspo. Satellite cards: allocation, activity list, bar chart.

---

## 10. Copy voice

Calm, specific, Indian English. “No bureau file.” “Unverified upload — does not set limit.” “Lean month.” Never “AI-powered insights” or fake CIBIL.

---

## 11. Accessibility

- Body contrast ≥4.5:1 (`--ink-2` on paper is #5C5C5C on #FFF ≈ 7:1).  
- Do not put lilac text on white for small type; use `--lilac-deep` or ink.  
- Skip link, labelled inputs, focus rings.  
- Status has text, not only fill.

---

## 12. Anti-references

- Qredible electric blue hero (`index.html` is not ZeroCIBIL).  
- Dark dashboards, neon charts, Inter-only SaaS.  
- Hard offset brutalist shadows.  
- Gradient text.

---

## 13. File use

Import `apps/web/src/styles/tokens.css` (mirrors this file). Pitch decks copy hex and type only. Backend emails: paper, ink, Sora.

**Source image:** `ui inspo.jpg`
