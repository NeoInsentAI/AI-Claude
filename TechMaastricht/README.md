# TechMaastricht.org

Static site for TechMaastricht — a community hub growing tech talent in Maastricht and
connecting it across the Netherlands, Germany, Belgium, and Luxembourg.

Bilingual: Dutch is the main site (root URLs), English lives under `/en/`. No build step.
Plain HTML/CSS/JS — open `index.html` directly or serve the folder with any static file
server.

## Local preview

    cd TechMaastricht
    python3 -m http.server 8000

Then open http://localhost:8000 in a browser (Dutch homepage) or
http://localhost:8000/en/ (English homepage).

## Before going live

1. **Contact form**: create a free account at https://formspree.io, create a form, and
   replace every `YOUR_FORM_ID` in every `contact.html` (both `contact.html` and
   `en/contact.html`) and in every footer newsletter form (present on all 14 pages) with
   your real Formspree form ID. That's 16 occurrences total (1 per contact form × 2
   languages, 7 in the footer newsletter form × 2 languages).
2. **Social links**: replace the placeholder LinkedIn/Instagram/X URLs (in every page's
   footer and on both `contact.html` files) with the real profile URLs once they exist.
3. **Contact email**: replace `hello@techmaastricht.org` with the real inbox once set up.
4. **Social share image**: `og:image` currently points to an SVG (`hub-graphic.svg` /
   `regional-map.svg`). Most social platforms (Twitter/X, LinkedIn, Facebook, Slack)
   don't render SVG previews — export a 1200×630 PNG version of the hub graphic and
   update the `og:image` tag on all 14 pages before relying on social link previews.
5. **Content**: swap placeholder team bios, event dates, and partner logos for real ones
   as they're finalized — search for "placeholder" across the codebase to find them all.
   Keep the Dutch and English versions in sync when you do.

## Deploy (Netlify)

1. Push this repo to GitHub (or drag-and-drop the `TechMaastricht/` folder at
   https://app.netlify.com/drop).
2. In Netlify: "Add new site" → connect the repo → set the base directory to
   `TechMaastricht` → no build command → publish directory `TechMaastricht`.
3. Once deployed, go to Domain settings → add `techmaastricht.org` → follow Netlify's
   DNS instructions (point your domain registrar's A/CNAME records at Netlify).
4. SSL certificate is issued automatically once DNS propagates.

## Deploy (Vercel) — alternative

1. `npx vercel` from inside `TechMaastricht/` and follow the prompts (no framework,
   static site).
2. Add `techmaastricht.org` under Project → Settings → Domains, and update DNS at your
   registrar as instructed.

## File structure

    TechMaastricht/
    ├── index.html          Home (Dutch, main site)
    ├── about.html          Over ons
    ├── programs.html       Programma's
    ├── regional-hub.html   Regionale Hub
    ├── events.html         Evenementen
    ├── community.html      Community
    ├── contact.html        Contact
    ├── en/                 English mirror of the 7 pages above
    │   ├── index.html
    │   ├── about.html
    │   ├── programs.html
    │   ├── regional-hub.html
    │   ├── events.html
    │   ├── community.html
    │   └── contact.html
    ├── css/style.css       Shared styles (both languages)
    ├── js/main.js          Mobile nav + scroll header behavior (both languages)
    ├── assets/images/      SVG graphics (hero, regional map, favicon)
    ├── sitemap.xml         All 14 URLs with hreflang alternates
    ├── robots.txt
    └── verify.sh           Structural check — run after editing any page (checks all 14)

## Adding a language switcher target

Every page's navbar has a small NL/EN toggle (`.lang-switch`). To keep the no-templating
architecture simple, each language's toggle always points to the OTHER language's
**homepage** (not the exact equivalent page) — e.g. every Dutch page's "EN" link goes to
`en/index.html`, and every English page's "NL" link goes to `../index.html`. If you want
page-for-page switching instead, you'll need to update all 14 files' `.lang-switch` links
individually (no shared template to edit once).
