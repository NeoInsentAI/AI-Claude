# TechMaastricht.org — Website Design Spec

**Date:** 2026-07-08
**Project:** New community/hub website for TechMaastricht — positioning Maastricht as a tech hub for the south of the Netherlands that supports and connects tech talent across the Meuse-Rhine Euroregion (Germany, Belgium, Luxembourg).
**Reference for structure only:** aifourall.org's general information architecture (nav pattern, homepage section flow) was reviewed for inspiration. No text, imagery, or design assets from that site are reused — all copy, graphics, and layout details in this spec are original.

---

## 1. Purpose & Positioning

TechMaastricht is a community hub whose mission is to grow the tech talent base in Maastricht/South Limburg and position the city as a connective hub for tech collaboration across the nearby German, Belgian, and Luxembourg border regions (the Meuse-Rhine Euroregion). The site is the organization's front door: it explains the mission, showcases programs, and converts visitors into community members, mentors, partners, or event attendees.

This is a launch-stage site. Content is original placeholder copy that clearly communicates the mission and structure, written so specific facts (team names, real event dates, partner logos, member counts) can be swapped in later without restructuring the site.

---

## 2. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Markup/Styling | Plain HTML5 + CSS3 (no framework) | No build step, zero dependencies, deployable anywhere, trivial for a small org to maintain or hand off |
| Interactivity | Vanilla JS (`js/main.js`) | Mobile nav toggle, sticky-header scroll effect — nothing else needs JS |
| Fonts | Google Fonts: Manrope (headings), Inter (body) | Free, fast-loading, techy-but-readable pairing |
| Contact form | Formspree (free tier) | No backend needed for a static site; swap in real form ID at deploy time |
| Hosting | Netlify, Vercel, or GitHub Pages (free tier) | Static files deploy in minutes; domain DNS points at chosen host |
| Icons/graphics | Hand-built inline SVG | No licensing concerns, crisp at any size, on-brand color control |

No build tooling (no Node/bundler dependency) — every HTML file is deploy-ready as-is.

---

## 3. Visual System

### Colors
```
Maastricht Red   #C8102E   → primary CTAs, links, active nav state, accents
Deep Red         #7A0C1E   → hover states, footer background, dark section backgrounds
Charcoal         #1A1A1A   → headings, body text
Warm Grey        #6B6560   → secondary/muted text
Off-white        #FAF7F5   → alternating section backgrounds
White            #FFFFFF   → primary background
```
Palette is drawn from the Maastricht city flag (red/white horizontal bands).

### Typography
```
Display   Manrope Bold      40–64px   → Hero headlines
Heading   Manrope SemiBold  24–32px   → Section titles
Body      Inter Regular     16–18px   → Paragraph text
Label     Inter Medium      14px      → Nav, buttons, tags
```

### Logo
Text wordmark: **"Tech"** in Charcoal + **"Maastricht"** in Maastricht Red, Manrope Bold. No icon mark — keeps launch scope small; an icon can be added later without restructuring the navbar.

### Components

**Navbar**
- Sticky top; transparent with white text over the hero, transitions to white background + Charcoal text on scroll (200ms)
- Wordmark left, nav links center/right, "Join the Community" button (Maastricht Red, pill-shaped) right
- Mobile: hamburger menu, full-screen overlay nav

**Buttons**
- Primary: `background: #C8102E; color: #fff; border-radius: 999px; padding: 12px 28px`
- Secondary: `border: 2px solid #1A1A1A; color: #1A1A1A; border-radius: 999px`
- Hover: darken 10%, 200ms transition

**Cards** (programs, events, pillars)
- White background, `border-radius: 16px`, soft shadow, 1px `#eee` border
- Icon or number, title, 2–3 line description, optional link

**Hero hub graphic**
- Inline SVG: red nodes connected by thin lines radiating from a central "Maastricht" node toward four labeled directions (NL/DE/BE/LU), on white or Off-white background
- Reused (smaller, simplified) on the Regional Hub page as an explanatory map

### Responsive
- Mobile-first CSS, breakpoints at 640px / 768px / 1024px / 1280px
- Max content width: 1200px, centered
- Section padding: 96px desktop / 56px mobile

### Accessibility
- Color contrast checked: Maastricht Red on white and white on Deep Red both meet WCAG AA for normal text
- All interactive elements keyboard-focusable with visible focus ring
- Semantic HTML (`nav`, `header`, `main`, `footer`, heading hierarchy)
- SVG graphics include `<title>`/`aria-hidden` as appropriate (decorative vs. informative)

---

## 4. Site Architecture

7 static pages, shared navbar and footer markup duplicated per page (no templating layer, per the no-build-tooling decision):

```
index.html          Home
about.html           About
programs.html         Programs
regional-hub.html      Regional Hub
events.html            Events
community.html          Community
contact.html            Contact
```

Nav order: Home · About · Programs · Regional Hub · Events · Community · Contact (+ "Join the Community" CTA button)

---

## 5. Page-by-Page Content

### `index.html` — Home
1. Navbar
2. **Hero** — headline framing Maastricht as the connective tech hub for the NL-DE-BE-LU region, subheadline, two CTAs ("Join the Community" / "Explore Programs"), hub-graphic background
3. **Value pillars** (4 cards) — Cross-Border Talent, Community-Driven, Future-Ready Skills, Open & Inclusive
4. **Programs preview** — 3–4 featured program cards linking to `/programs.html`
5. **Regional Hub teaser** — condensed hub-graphic + short explainer, links to `/regional-hub.html`
6. **Upcoming events preview** — 2–3 event cards linking to `/events.html`
7. **CTA band** — "Get Involved" → `/community.html` or `/contact.html`
8. Footer

### `about.html` — About
- Origin story (why the hub exists — placeholder narrative, editable)
- Mission statement
- Vision statement
- Team section — placeholder role cards (Founder / Community Lead / Partnerships Lead)
- Values, expanded from the 4 homepage pillars

### `programs.html` — Programs
Intro paragraph, then 6 pillar sections, each with description + CTA:
1. **Meetups** — recurring local tech meetups and socials
2. **Mentorship** — pairing experienced tech professionals with newcomers/career-switchers
3. **Workforce Training** — upskilling programs (bootcamp-style, part-time)
4. **Student & Youth Outreach** — pipeline programs with Maastricht University, Zuyd Hogeschool, and local schools
5. **Startup Support** — resources and connections for early-stage tech founders
6. **Cross-Border Exchange** — joint programs/events with tech communities in Aachen (DE), Liège (BE), and Luxembourg City

### `regional-hub.html` — Regional Hub
- Explains the Meuse-Rhine Euroregion positioning: Maastricht sits at the literal NL-DE-BE tri-border point, with Luxembourg a short distance further south — a factual geographic framing, not adapted from any external source
- Simplified SVG map graphic showing the four countries and Maastricht at the center
- "Why cross-border matters" — talent mobility, shared employer access, joint events
- CTA aimed at partner organizations in DE/BE/LU to connect

### `events.html` — Events
- Upcoming events list (placeholder: monthly meetup, quarterly hackathon, annual cross-border summit)
- Past-events recap teaser (placeholder gallery grid)
- "Host an Event With Us" CTA

### `community.html` — Community
- Who's in the community (developers, students, founders, companies)
- Ways to join (Discord/Slack placeholder link, newsletter signup, meetup calendar link)
- Member spotlight placeholder
- Partner-organization logo strip (placeholder)

### `contact.html` — Contact
- Contact form (Formspree — placeholder form ID marked clearly for later swap)
- Placeholder hub address (Maastricht)
- Social links (LinkedIn, Instagram, X — placeholder URLs)
- Newsletter signup placeholder

**Global element:** none floating (no WhatsApp-style widget needed for this org type) — footer repeats primary nav + contact info + newsletter field on every page.

---

## 6. SEO Basics

| Item | Implementation |
|---|---|
| Meta tags | Title/description per page, hand-written in each `<head>` |
| Open Graph | `og:title`, `og:description`, `og:image` (hub graphic) per page |
| Favicon | Simple "T" mark in Maastricht Red |
| Sitemap | Hand-written `sitemap.xml` (7 URLs) |
| robots.txt | Standard, allow all |
| Semantic HTML | Proper heading hierarchy per page for crawlability |

Target keywords: "tech community Maastricht," "tech hub South Limburg," "tech meetups Maastricht," "cross-border tech NL DE BE LU."

---

## 7. File Structure

```
TechMaastricht/
├── index.html
├── about.html
├── programs.html
├── regional-hub.html
├── events.html
├── community.html
├── contact.html
├── css/
│   └── style.css
├── js/
│   └── main.js
├── assets/
│   ├── images/          (SVG hub graphic, favicon, OG image)
│   └── icons/           (inline SVG source files, if kept separate)
├── sitemap.xml
├── robots.txt
└── README.md             (deployment instructions)
```

---

## 8. Deployment

| Item | Provider | Cost |
|---|---|---|
| Domain | techmaastricht.org (already implied by request — registration is the user's action) | ~$15–20/yr |
| Hosting | Netlify, Vercel, or GitHub Pages (static export) | $0 |
| SSL | Automatic on any of the above | $0 |
| Fonts | Google Fonts | $0 |
| Contact form | Formspree free tier (50 submissions/mo) | $0 |

README will document: how to deploy to Netlify/Vercel via drag-and-drop or git push, and how to point the domain's DNS at the chosen host.

---

## 9. Key Decisions & Rationale

| Decision | Reason |
|---|---|
| Static HTML/CSS/JS over Next.js | No dynamic features needed at launch (no tracking, no auth, no CMS); matches user's explicit preference for zero build-step simplicity |
| Multi-page over single-page scroll | User wants a fuller, more mature org site with dedicated space for the Regional Hub story rather than folding it into About |
| Duplicated nav/footer per page | No templating layer was chosen (consistent with "no build step"); acceptable maintenance tradeoff at 7 pages |
| Abstract SVG hub graphic over stock photography | No real org photography exists yet; avoids generic stock-photo look and licensing questions entirely |
| Text wordmark only, no icon | Keeps launch scope small; icon can be layered in later without reworking the navbar |
| Formspree for contact form | Static site has no backend; Formspree needs zero server code and has a usable free tier |
| Maastricht flag red/white as base palette | User's explicit choice among the color options discussed |
| Placeholder content throughout | This is a new concept, not an existing org with real details (confirmed with user) — content is written to be realistic and easily swappable |
