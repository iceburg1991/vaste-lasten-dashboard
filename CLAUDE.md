# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, single-page web app for tracking Dutch fixed monthly expenses ("vaste lasten"). No build system, no npm, no Node. Deployed on GitHub Pages at `https://iceburg1991.github.io/vaste-lasten-dashboard/`.

## CSS rebuild

The only build step is compiling Tailwind. After editing `css/input.css`:

```
./tools/tailwindcss-macos-arm64 -i css/input.css -o css/styles.css --minify
```

(The binary is checked in; no global Tailwind install needed.)

## Local development

sql.js requires the WASM file to be served over HTTP. Open via a local server, not `file://`:

```
python3 -m http.server 8080
```

## Architecture

### JavaScript modules

All JS is vanilla, no ES modules. Each file is an IIFE that exposes a global object. **Script load order in `index.html` is a hard dependency** (line 599–611):

```
config → ui → db → google-drive → normalisation → csv-import →
charts → dashboard → posts → transactions → labels → settings
```

| Module | Responsibility |
|---|---|
| `CONFIG` | App-wide constants: Google OAuth ID, default categories, deviation threshold |
| `DB` | SQLite via sql.js (WASM). Schema + migrations in `db.js`. Exposes `query()` / `run()` |
| `GoogleDrive` | OAuth token via Google Identity Services, Drive file CRUD (`drive.file` scope only) |
| `Normalisation` | Converts amounts to monthly equivalents: `(amount × frequency) / 12` |
| `CSVImport` | Parses Rabobank CSV (ISO-8859-1, 26 columns). Two-pass recurring detection |
| `Charts` | Chart.js rendering: trend bar chart (last 12 months) + category doughnut with center total |
| `Dashboard` | KPI cards and deviations table. Calls `Charts.renderTrend()` / `Charts.renderCategory()` |
| `Posts` | CRUD for `recurring_posts` table |
| `Transactions` | CRUD for `transactions` table, linking to posts/labels |
| `Labels` | CRUD for `labels` table; `Labels.findMatch()` used during CSV import |
| `Settings` | Category management, own-account IBAN registry |
| `UI` | Tab switching, modal open/close, toast notifications |

### CSS layering

`index.html` loads CSS in this order — **order matters**:
1. `css/custom.css` — hand-written component styles, uses `@layer components`
2. `css/styles.css` — Tailwind-generated output

`custom.css` must come first so its `@layer components` declarations win over Tailwind utilities. `css/card-inset.css` is imported inside `css/input.css` via `@import` and ends up compiled into `styles.css`.

### Database schema

Five tables: `categories`, `recurring_posts`, `own_accounts`, `labels`, `transactions`. Migrations run on every DB open (`_migrate()` in `db.js`). New columns are added with `ALTER TABLE` guards; new tables via `CREATE TABLE IF NOT EXISTS`.

### Key data flows

**CSV import**: parse → deduplicate by `sequence_nr` → auto-detect recurring candidates (keyword/amount/history heuristics) → user review → write `transactions`, auto-match `post_id` and `label_id` on insert.

**Dashboard render**: selected month → `Normalisation.*ForMonth()` → KPI values → Chart.js (last 12 months trend) → deviation check at `CONFIG.DEVIATION_THRESHOLD` (10%).

**Save**: `DB.save()` tries `GoogleDrive.upload()` first; falls back to local `.sqlite` download.

### Persistence

- In-browser SQLite (sql.js WASM) is the single source of truth.
- Google Drive stores the `.sqlite` file under the `drive.file` scope (app-created files only).
- `localStorage` key `vl_storage` remembers whether the user previously used Google Drive.
