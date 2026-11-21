# Kwik Klin Design System

The product is plain HTML, CSS and JavaScript served by FastAPI. There is no build step, so the design system is three files:

| File | Owns |
|---|---|
| `app/static/tokens.css` | Colours, type scale, spacing, radii, shadows, motion |
| `app/static/kk-ds.css` | Shared component look. Loads last on every surface. Layout and behaviour stay in each surface's own CSS |
| `app/static/kk-ds.js` | Shared UI helpers: usual-item chips, scroll keeping, picker reveal, device drafts |

## Colour rules

- **Navy** (`--navy`, `--navy-deep`) is for chrome: sidebar, app header, summary bars and hero cards.
- **Electric blue** marks what to press and where you are. `--brand-strong` is the only fill white text sits on (5.56:1). `--brand` is the accent (4.50:1 on white).
- **Status colours** (`--success`, `--warning`, `--error`, `--info`, `--busy`) carry meaning. Do not use them for decoration.
- **Service family colours** (`--kb-wash`, `--kb-dry` and others in `kk-bill.css`) identify a service in the bill flow.
- **Gold** (`--gold`) is reserved for Pro and premium marks.

Never hard-code a brand colour. `tests/test_design_system.py` fails if the old orange returns.

## Tokens

| Group | Tokens |
|---|---|
| Space | `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 24 · `--sp-6` 32 · `--sp-7` 48 |
| Type | `--fs-xs` 12 · `--fs-sm` 13 · `--fs-md` 14 · `--fs-lg` 16 · `--fs-xl` 20 · `--fs-2xl` 26 |
| Radius | `--r-sm` 8 · `--r-md` 10 · `--r-lg` 14 · `--r-xl` 20 · `--r-pill` |
| Shadow | `--shadow-sm` `--shadow-md` `--shadow-lg` `--shadow-brand`; focus uses `--ring` |
| Touch | `--tap` 46 · `--control-h` 40 |
| Motion | `--ease` · `--dur` |

Admin and Control use Inter. Staff and Solo use the system font (`--font-system`) on purpose, because they run on slow connections and their CSP allows no external origins.

## Components

| Component | Markup | Notes |
|---|---|---|
| Button | `.btn`, `.btn.ghost`, `.btn.danger`, `.btn.sm`, `.btn.go`; bill flow `.kb-btn` | One primary per view |
| Input | Native elements | Focus ring is shared. On touch, inputs are 16px so iOS does not zoom |
| Numeric input | `inputmode="numeric"` for counts and phones, `"decimal"` for money and weight | Picks the right phone keyboard |
| Removable chip | `.kb-uc` with `.kb-uc-x` (`kk-bill.css`) | Add and remove are separate buttons |
| Status | `.pill`, `.badge` | Colour follows status |
| Filter chip | `.chip`, `.chip.on` | Selected filter is navy |
| Card and KPI | `.card`, `.kpi` | |
| Table | `.tbl` | Becomes cards on phones |
| Alert | `.kk-alert` | Text in a `span`, then actions |
| Modal and sheet | `.modal`, `.sheet` | Bottom sheet on phones |
| Toast | `.toast`, `.toast.err` | |
| Loading | `.kk-skel`, `.skel` | |
| Empty | `.empty`, `.emptystate` | |
| Navigation | Sidebar `.nav`; mobile `.bottom`, `.tabbar` | Active item is electric blue |

`[hidden]` needs care: any class that sets `display` overrides it. Add a matching `[hidden]` rule.

## Helpers

```js
KKDS.keepScroll(fn, ids)           // re-render without moving the horizontal chip rows
KKDS.draft.save/load/clear/label   // one bill draft per user, on this device, for 7 days
```

## Surfaces

| Who | URL | Layout |
|---|---|---|
| Owner, dashboard Manager | `/admin` | Navy sidebar on desktop, drawer and tab bar on phones |
| Staff, staff-table Manager | `/staff` | Mobile app with bottom navigation |
| Solo Starter, Solo Pro | `/solo` | Mobile only. `body.kk-solo` keeps a 480px column on large screens |
| Vendor | `/control` | Navy sidebar, strict CSP |

Entitlements are not design decisions. Solo Starter and Pro differ only through `app/services/plans.py` and the server checks behind it.

## Shipping CSS and JS

Static files are cached for a year when requested with `?v=`. `kk-ds.css` and `kk-ds.js` get an mtime version automatically in `/admin` and `/staff`. Bump the cache version in `sw.js` and `staff-sw.js` when the app shell changes.
