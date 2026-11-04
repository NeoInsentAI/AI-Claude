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
- `backups/` — a daily copy (`neoinsent-YYYY-MM-DD.db`, the newest 30 are kept), a copy taken
  before each schema upgrade (`pre-migration-v<from>-to-v<to>-<timestamp>.db`, never deleted) and
  a copy taken before each invoice is finalized (`pre-finalize-<timestamp>.db`, the newest 20 are
  kept)

### Restoring

Quit the app first. Restore `neoinsent.db` together with the `invoices/` folder from the same
moment — never the database alone: an older database would not know the invoices issued since,
and would hand out their numbers again. The app refuses to finalize an invoice whose number
already has a PDF in `invoices/`, and says so — that check relies on the PDFs being present in
the `invoices/` folder, so never delete or move them out of it.

## Sending email

Finalized invoices are emailed (PDF attached) from the company mailbox `finance@neoinsentai.com`
through Gmail. Until this is set up the app works normally, but sending says "Email isn't set up
yet".

1. Sign in to Google as `finance@neoinsentai.com`. 2-Step Verification must be on for that
   account (myaccount.google.com/security).
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create an
   app password (name it e.g. "NeoInsent Invoicing") and copy the 16-character password.
3. In this folder, copy `.env.example` to `.env` (`cp .env.example .env`) and paste the password
   after `GMAIL_APP_PASSWORD=`. `.env` stays on this Mac; it is never committed.
4. Restart the app (Ctrl+C, then `npm start`).

Each invoice goes to the client email address it was issued with, and replies go to
`finance@neoinsentai.com`. Sent emails appear in that mailbox's Sent folder. If Gmail rejects the
login, create a new app password and replace the one in `.env`.

## Scripts

`npm run test`, `npm run build`, `npm run lint`.

Ad-hoc scripts that import server code which pulls in `.tsx` files (such as the invoice PDF
renderer) must use the app tsconfig for JSX: `npx tsx --tsconfig tsconfig.app.json <script>`.
The `server` and `start` scripts already do this.
