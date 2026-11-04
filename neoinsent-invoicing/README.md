# NeoInsent Invoicing

A local, Mac-only invoicing app for NeoInsent (Dutch VAT rules, Dutch/English invoices).
It runs a small web server on this computer (`http://127.0.0.1:5174`, reachable from this Mac
only) and keeps everything in a local database. There is no login and nothing is stored online.
Requires Node.js 24 or newer (install it from [nodejs.org](https://nodejs.org)).

## Starting the app

Double-click **`Start NeoInsent.command`** in this folder. A Terminal window opens, the app
starts (the very first time it also installs its components, which takes a minute) and your
browser opens the app. If the app is already running, double-clicking just opens the browser
again.

- **To stop it:** close that Terminal window, or click in it and press Ctrl+C.
- **Handy:** drag `Start NeoInsent.command` to the right-hand side of the Dock (next to the Trash)
  to start the app from there.
- If macOS says the file can't be opened, right-click it, choose **Open**, then **Open** again.
  macOS remembers this.
- If the window says Node.js is missing or too old, install Node.js 24 from
  [nodejs.org](https://nodejs.org) and double-click again.

The app uses port 5174. If another program already uses it, the window says so; add a line such
as `PORT=5175` to the `.env` file (see below) and start again.

For developers: `npm start` builds and starts the app from Terminal; `npm run dev` (Vite)
together with `npm run server` (API only) is the development setup.

## Setting up email (Gmail)

Finalized invoices are emailed (PDF attached) from the company mailbox `finance@neoinsentai.com`
through Gmail. Until this is set up the app works normally; only sending is unavailable, and
**Email to client** on a finalized invoice shows "Email isn't set up yet — add your Gmail app
password to the .env file (see README)."

1. Sign in to Google as `finance@neoinsentai.com`. 2-Step Verification must be on for that
   Google Workspace account (myaccount.google.com/security).
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create an
   app password (name it e.g. "NeoInsent Invoicing") and copy the 16-character password.
3. In this folder, copy `.env.example` to `.env` and paste the password after
   `GMAIL_APP_PASSWORD=` (open `.env` with TextEdit). Finder hides names starting with a dot:
   press Cmd+Shift+. to show them. The `.env` file stays on this Mac; it is never committed or
   uploaded anywhere.
4. Restart the app (close the Terminal window, then double-click `Start NeoInsent.command`).

Once set up, **Email to client** shows the recipient, subject and message to check before you
press **Send**. Each invoice goes to the client email address it was issued with, replies go to
`finance@neoinsentai.com`, and sent emails appear in that mailbox's Sent folder. If Gmail rejects
the login, create a new app password and replace the one in `.env`.

If a `.env` from an older setup contains lines starting with `SUPABASE_`, they are no longer used
and can be deleted.

## Where data lives

Everything is in one folder, `~/NeoInsent Invoicing` (your home folder → "NeoInsent Invoicing";
developers can override it with `NEOINSENT_DATA_DIR`). Do not put it in iCloud Drive or another
synced folder; the app refuses to.

- `neoinsent.db` — the database (final invoices are a legal record: keep them 7 years)
- `invoices/<year>/` — the PDF of every finalized invoice. A missing PDF is re-created with the
  company details as they are in the app *at that moment* (`api/_lib/company.ts`), so after
  changing them an older invoice would be re-created with the new details: keep these PDFs safe
  (Time Machine).
- `backups/` — automatic copies of the database (see below)

## Backups

The app backs up the database by itself, into `~/NeoInsent Invoicing/backups/`:

- **Daily:** `neoinsent-YYYY-MM-DD.db`, taken when the app starts and once a day while it stays
  open. The newest 30 are kept.
- **Before each invoice is finalized:** `pre-finalize-<timestamp>.db`. The newest 20 are kept.
- **Before an app update changes the database layout:** `pre-migration-v<from>-to-v<to>-<timestamp>.db`
  (never deleted).

These copies sit on the same disk as the app, so they don't protect against a lost, stolen or
broken Mac. **Turn on Time Machine** (System Settings → General → Time Machine) with an external
disk, or use another backup service, and make sure it includes `~/NeoInsent Invoicing/`.

### Restoring

Quit the app first. Restore `neoinsent.db` together with the `invoices/` folder from the same
moment — never the database alone: an older database would not know the invoices issued since,
and would hand out their numbers again. The app refuses to finalize an invoice whose number
already has a PDF in `invoices/`, and says so — that check relies on the PDFs being present in
the `invoices/` folder, so never delete or move them out of it.

A file from `backups/` is restored by copying it over `neoinsent.db` (with the app stopped). These
copies contain **only the database, not the PDFs**, so be careful which one you pick:

- **Only restore a copy taken after the last invoice you finalized.** To check, select the file in
  Finder, choose **File → Get Info** and compare its **Modified** time with when you finalized
  your last invoice. Don't go by the file name alone: a daily copy `neoinsent-YYYY-MM-DD.db`
  carries only a date and is written once, usually when the app starts that day, so a daily copy
  from the same day as your last finalized invoice may well *not* contain it. A
  `pre-finalize-<timestamp>.db` copy is taken just *before* an invoice is finalized, so it does
  **not** contain that invoice either.
- **When in doubt, don't restore from `backups/`.** Restore from Time Machine instead (the
  database and the `invoices/` folder together, from the same moment), or ask for help.
- **If you finalized invoices after the copy was taken, do not restore it.** Those issued invoices
  would disappear from the records (their PDFs stay in `invoices/`), and the app would refuse to
  finalize any new invoice that year, because the next numbers already have PDFs. Restore from
  Time Machine instead (database and `invoices/` folder from the same moment), or ask for help.

## Scripts

`npm run test`, `npm run build`, `npm run lint`.

Ad-hoc scripts that import server code which pulls in `.tsx` files (such as the invoice PDF
renderer) must use the app tsconfig for JSX: `npx tsx --tsconfig tsconfig.app.json <script>`.
The `server` and `start` scripts already do this.
