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
    ├── robots.txt          Explicitly welcomes GPTBot, ClaudeBot, Google-Extended, Grok, etc.
    ├── llms.txt            Bilingual site summary for AI assistants (ChatGPT, Gemini, Claude, Grok)
    └── verify.sh           Structural check — run after editing any page (checks all 14)

## AI assistant discoverability (llms.txt)

`llms.txt` follows the emerging [llms.txt convention](https://llmstxt.org) — a plain-language,
bilingual summary of what TechMaastricht is and which pages cover what, aimed at AI assistants
(ChatGPT, Gemini, Claude, Grok, Perplexity, etc.) so they can find and cite the site correctly
when someone asks about learning tech or AI, or tech communities, in Maastricht, Aachen,
Hasselt, or nearby. `robots.txt` explicitly allows the major AI crawlers (`GPTBot`,
`ChatGPT-User`, `OAI-SearchBot`, `ClaudeBot`, `Claude-Web`, `anthropic-ai`, `Google-Extended`,
`PerplexityBot`, `Grok`, `xAI-Bot`) in addition to the wildcard `Allow: /`. If TechMaastricht
adds real events, team members, or partners later, update `llms.txt` alongside the page content
so it doesn't go stale.

## Adding a language switcher target

Every page's navbar has a small NL/EN toggle (`.lang-switch`). Each language's toggle
points to the page-for-page equivalent in the other language — e.g. `programs.html`'s
"EN" link goes to `en/programs.html`, and `en/programs.html`'s "NL" link goes to
`../programs.html`. The homepage is the only page where both directions naturally point
to `index.html`. Because the site has no shared template, if you rename or add a page
you'll need to update its `.lang-switch` link (and the corresponding link on its
counterpart page) by hand — there's no single place to edit once.
