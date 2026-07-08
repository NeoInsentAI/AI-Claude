# TechMaastricht.org

Static site for TechMaastricht — a community hub growing tech talent in Maastricht and
connecting it across the Netherlands, Germany, Belgium, and Luxembourg.

No build step. Plain HTML/CSS/JS — open `index.html` directly or serve the folder with
any static file server.

## Local preview

    cd TechMaastricht
    python3 -m http.server 8000

Then open http://localhost:8000 in a browser.

## Before going live

1. **Contact form**: create a free account at https://formspree.io, create a form, and
   replace every `YOUR_FORM_ID` in `contact.html` and in the footer newsletter form
   (present on all 7 pages) with your real Formspree form ID. That's 8 occurrences total
   (1 in the contact form, 7 in the footer newsletter form — one per page).
2. **Social links**: replace the placeholder LinkedIn/Instagram/X URLs (in every page's
   footer and on `contact.html`) with the real profile URLs once they exist.
3. **Contact email**: replace `hello@techmaastricht.org` with the real inbox once set up.
4. **Social share image**: `og:image` currently points to an SVG (`hub-graphic.svg` /
   `regional-map.svg`). Most social platforms (Twitter/X, LinkedIn, Facebook, Slack)
   don't render SVG previews — export a 1200×630 PNG version of the hub graphic and
   update the `og:image` tag on all 7 pages before relying on social link previews.
5. **Content**: swap placeholder team bios, event dates, and partner logos for real ones
   as they're finalized — search for "placeholder" across the codebase to find them all.

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
    ├── index.html          Home
    ├── about.html          About
    ├── programs.html       Programs
    ├── regional-hub.html   Regional Hub
    ├── events.html         Events
    ├── community.html      Community
    ├── contact.html        Contact
    ├── css/style.css       Shared styles
    ├── js/main.js          Mobile nav + scroll header behavior
    ├── assets/images/      SVG graphics (hero, regional map, favicon)
    ├── sitemap.xml
    ├── robots.txt
    └── verify.sh           Structural check — run after editing any page
