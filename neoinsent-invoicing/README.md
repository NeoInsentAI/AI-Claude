# NeoInsent Invoicing

A local, Mac-only invoicing app for NeoInsent (Dutch VAT rules, Dutch/English invoices).
It runs a small web server on this computer (`http://localhost:5174`, listening on 127.0.0.1
only) and stores everything in a local SQLite database. Requires Node.js 24 or newer
(it uses the built-in `node:sqlite`).

## Run it

```sh
npm install
npm start        # builds the frontend, then starts the server
```

Set `PORT` to use another port (e.g. `PORT=5175 npm start`). For development, run
`npm run dev` (Vite) together with `npm run server` (API only).

## Where data lives

Everything is in one folder, `~/NeoInsent Invoicing` by default (override with
`NEOINSENT_DATA_DIR`). Do not put it in iCloud Drive or another synced folder; the app refuses to.

- `neoinsent.db` — the database (final invoices are a legal record: keep them 7 years)
- `invoices/` — PDFs of finalized invoices
- `backups/` — a daily copy (`neoinsent-YYYY-MM-DD.db`, the newest 30 are kept) and a copy taken
  before each schema upgrade (`pre-migration-v<from>-to-v<to>-<timestamp>.db`, never deleted)

## Scripts

`npm run test`, `npm run build`, `npm run lint`.

Ad-hoc scripts that import server code which pulls in `.tsx` files (such as the invoice PDF
renderer) must use the app tsconfig for JSX: `npx tsx --tsconfig tsconfig.app.json <script>`.
The `server` and `start` scripts already do this.
