# TechMaastricht Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 7-page static website for TechMaastricht.org — a community hub positioning Maastricht as a tech hub for the south of the Netherlands connecting talent across Germany, Belgium, and Luxembourg.

**Architecture:** Plain HTML5 + CSS3 + vanilla JS, zero build step, zero dependencies. One shared stylesheet (`css/style.css`) and one shared script (`js/main.js`). Navbar and footer markup are identical across all 7 pages — the canonical block is defined once in Task 5 below and copied verbatim into every page. Verification is a repeatable bash script (`verify.sh`) that greps each page for required structural elements, run after every page is created.

**Tech Stack:** HTML5, CSS3 (no framework), vanilla JS, inline SVG graphics, Google Fonts (Manrope + Inter), Formspree (contact form backend).

**Design doc:** `docs/superpowers/specs/2026-07-08-techmaastricht-website-design.md` — read this first for full color/typography/page-content rationale.

**Project root:** `TechMaastricht/` (existing empty subdirectory of this repo).

---

## Phase 0: Foundation — scaffold, styles, script, assets, shared markup

### Task 1: Project scaffold + verification script

**Files:**
- Create: `TechMaastricht/verify.sh`
- Create: `TechMaastricht/.gitignore`

- [ ] **Step 1: Create the verification script**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PAGES=(index.html about.html programs.html regional-hub.html events.html community.html contact.html)
fail=0
for page in "${PAGES[@]}"; do
  if [ ! -f "$page" ]; then
    echo "FAIL: $page missing"
    fail=1
    continue
  fi
  grep -q "<!DOCTYPE html>" "$page" || { echo "FAIL: $page missing doctype"; fail=1; }
  grep -q "<title>" "$page" || { echo "FAIL: $page missing <title>"; fail=1; }
  grep -q 'name="description"' "$page" || { echo "FAIL: $page missing meta description"; fail=1; }
  grep -q 'css/style.css' "$page" || { echo "FAIL: $page missing stylesheet link"; fail=1; }
  grep -q 'js/main.js' "$page" || { echo "FAIL: $page missing script tag"; fail=1; }
  grep -q '<footer' "$page" || { echo "FAIL: $page missing footer"; fail=1; }
  grep -q 'id="site-header"' "$page" || { echo "FAIL: $page missing site header"; fail=1; }
  grep -q 'id="nav-toggle"' "$page" || { echo "FAIL: $page missing nav-toggle button"; fail=1; }
  grep -q 'id="nav-links"' "$page" || { echo "FAIL: $page missing nav-links container"; fail=1; }
  for target in "${PAGES[@]}"; do
    grep -q "href=\"$target\"" "$page" || { echo "FAIL: $page missing nav link to $target"; fail=1; }
  done
done
if [ "$fail" -eq 0 ]; then
  echo "PASS: all ${#PAGES[@]} pages verified"
else
  exit 1
fi
```

- [ ] **Step 2: Make it executable and run it**

```bash
chmod +x TechMaastricht/verify.sh
cd TechMaastricht && ./verify.sh
```

Expected: `FAIL: index.html missing` (and similar for all 7 pages) — this is expected since no pages exist yet. This script is the repeatable check every later page task must pass.

- [ ] **Step 3: Create `.gitignore`**

```
.DS_Store
```

- [ ] **Step 4: Commit**

```bash
cd /Users/sera/AI-Claude
git add TechMaastricht/verify.sh TechMaastricht/.gitignore
git commit -m "chore: scaffold TechMaastricht site with page verification script"
```

### Task 2: Shared stylesheet foundation

**Files:**
- Create: `TechMaastricht/css/style.css`

- [ ] **Step 1: Write the base stylesheet**

```css
:root {
  --color-red: #C8102E;
  --color-red-deep: #7A0C1E;
  --color-charcoal: #1A1A1A;
  --color-grey: #6B6560;
  --color-offwhite: #FAF7F5;
  --color-white: #FFFFFF;
  --font-display: 'Manrope', sans-serif;
  --font-body: 'Inter', sans-serif;
  --max-width: 1200px;
  --radius: 16px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-body);
  color: var(--color-charcoal);
  background: var(--color-white);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1, h2, h3, h4 { font-family: var(--font-display); font-weight: 700; line-height: 1.2; }
h1 { font-size: clamp(2.5rem, 5vw, 4rem); }
h2 { font-size: clamp(1.75rem, 3vw, 2.25rem); font-weight: 600; }
h3 { font-size: 1.25rem; font-weight: 600; }
p { color: var(--color-grey); }
a { color: inherit; text-decoration: none; }
img, svg { max-width: 100%; display: block; }

.container { max-width: var(--max-width); margin: 0 auto; padding: 0 24px; }
.section { padding: 56px 0; }
@media (min-width: 768px) { .section { padding: 96px 0; } }
.section-alt { background: var(--color-offwhite); }
.section-header { text-align: center; max-width: 640px; margin: 0 auto 48px; }
.section-header p { margin-top: 12px; }

/* Buttons */
.btn { display: inline-block; padding: 12px 28px; border-radius: 999px; font-family: var(--font-body); font-weight: 600; font-size: 0.95rem; transition: background 0.2s, color 0.2s, border-color 0.2s; cursor: pointer; border: 2px solid transparent; }
.btn-primary { background: var(--color-red); color: var(--color-white); }
.btn-primary:hover { background: var(--color-red-deep); }
.btn-secondary { border-color: var(--color-charcoal); color: var(--color-charcoal); }
.btn-secondary:hover { background: var(--color-charcoal); color: var(--color-white); }
.btn-secondary-inverse { border-color: var(--color-white); color: var(--color-white); }
.btn-secondary-inverse:hover { background: var(--color-white); color: var(--color-red-deep); }
:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }

/* Navbar */
.site-header { position: fixed; top: 0; left: 0; right: 0; z-index: 100; transition: background 0.2s, box-shadow 0.2s; }
.site-header.is-scrolled { background: var(--color-white); box-shadow: 0 1px 0 rgba(0,0,0,0.06); }
.navbar { max-width: var(--max-width); margin: 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; }
.logo { font-family: var(--font-display); font-weight: 700; font-size: 1.25rem; color: var(--color-charcoal); }
.site-header--on-dark:not(.is-scrolled) .navbar > .logo { color: var(--color-white); }
.logo-accent { color: var(--color-red); }
.nav-links { display: none; align-items: center; gap: 28px; }
.nav-links a { font-weight: 500; font-size: 0.95rem; color: var(--color-charcoal); }
.site-header--on-dark:not(.is-scrolled) .nav-links a:not(.nav-cta) { color: var(--color-white); }
.nav-cta { padding: 10px 22px; }
.nav-toggle { display: flex; flex-direction: column; gap: 5px; background: none; border: none; cursor: pointer; z-index: 101; }
.nav-toggle span { width: 24px; height: 2px; background: var(--color-charcoal); }
.site-header--on-dark:not(.is-scrolled) .nav-toggle span { background: var(--color-white); }
.site-header:has(.nav-links.is-open) .nav-toggle span { background: var(--color-charcoal); }
@media (min-width: 1024px) {
  .nav-links { display: flex; }
  .nav-toggle { display: none; }
}
.nav-links.is-open { display: flex; flex-direction: column; position: fixed; inset: 0; background: var(--color-white); padding: 100px 24px 24px; gap: 24px; }
.nav-links.is-open a { color: var(--color-charcoal) !important; font-size: 1.25rem; }

/* Note: only the home page's <header> carries the extra `site-header--on-dark`
   class (it sits over the dark .hero background). Every other page's header
   uses the plain `class="site-header"` since .page-hero is light. */

/* Hero */
.hero { min-height: 100vh; display: flex; align-items: center; position: relative; background: var(--color-charcoal); overflow: hidden; }
.hero-graphic { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.9; }
.hero-content { position: relative; z-index: 1; max-width: var(--max-width); margin: 0 auto; padding: 120px 24px 24px; color: var(--color-white); }
.hero h1 { color: var(--color-white); margin-bottom: 20px; }
.hero p { color: rgba(255,255,255,0.85); font-size: 1.125rem; max-width: 560px; margin-bottom: 32px; }
.hero-ctas { display: flex; flex-wrap: wrap; gap: 16px; }

.page-hero { padding: 160px 24px 64px; background: var(--color-offwhite); text-align: center; }
.page-hero p { max-width: 640px; margin: 16px auto 0; }

.grid { display: grid; gap: 24px; }
.grid-2 { grid-template-columns: 1fr; }
.grid-3 { grid-template-columns: 1fr; }
.grid-4 { grid-template-columns: 1fr; }
@media (min-width: 640px) { .grid-2 { grid-template-columns: 1fr 1fr; } .grid-3 { grid-template-columns: 1fr 1fr; } .grid-4 { grid-template-columns: 1fr 1fr; } }
@media (min-width: 1024px) { .grid-3 { grid-template-columns: repeat(3, 1fr); } .grid-4 { grid-template-columns: repeat(4, 1fr); } }

/* Cards */
.card { background: var(--color-white); border: 1px solid #eee; border-radius: var(--radius); padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
.card h3 { margin-bottom: 12px; }
.card p { font-size: 0.95rem; }
.card .card-number { color: var(--color-red); font-family: var(--font-display); font-weight: 700; font-size: 0.9rem; margin-bottom: 12px; display: block; }
.card a.card-link { color: var(--color-red); font-weight: 600; font-size: 0.9rem; margin-top: 12px; display: inline-block; }

/* CTA band */
.cta-band { background: var(--color-red); color: var(--color-white); text-align: center; padding: 80px 24px; }
.cta-band h2 { color: var(--color-white); margin-bottom: 16px; }
.cta-band p { color: rgba(255,255,255,0.9); margin-bottom: 28px; max-width: 560px; margin-left: auto; margin-right: auto; }

/* Footer */
.site-footer { background: var(--color-red-deep); color: var(--color-white); padding: 64px 24px 24px; }
.footer-inner { max-width: var(--max-width); margin: 0 auto; display: grid; gap: 40px; grid-template-columns: 1fr; }
@media (min-width: 768px) { .footer-inner { grid-template-columns: 2fr 1fr 1fr 1.4fr; } }
.footer-inner h4 { color: var(--color-white); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
.footer-inner a { display: block; color: rgba(255,255,255,0.8); margin-bottom: 10px; }
.footer-brand p { color: rgba(255,255,255,0.75); margin-top: 12px; font-size: 0.9rem; }
.logo-footer { color: var(--color-white); }
.logo-footer .logo-accent { color: var(--color-white); opacity: 0.7; }
.social-links { display: flex; gap: 16px; }
.social-links a { margin-bottom: 0; }
.newsletter-form { display: flex; gap: 8px; flex-wrap: wrap; }
.newsletter-form input { flex: 1; min-width: 140px; padding: 10px 14px; border-radius: 999px; border: none; font-family: var(--font-body); }
.footer-bottom { max-width: var(--max-width); margin: 40px auto 0; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.15); font-size: 0.85rem; color: rgba(255,255,255,0.6); }
```

- [ ] **Step 2: Commit**

```bash
git add TechMaastricht/css/style.css
git commit -m "feat: add shared stylesheet foundation for TechMaastricht site"
```

### Task 3: Shared JS — mobile nav toggle + scroll header effect

**Files:**
- Create: `TechMaastricht/js/main.js`

- [ ] **Step 1: Write the script**

```js
document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('site-header');
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');

  const onScroll = () => {
    if (window.scrollY > 40) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  };
  window.addEventListener('scroll', onScroll);
  onScroll();

  toggle.addEventListener('click', () => {
    const isOpen = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  links.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      links.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add TechMaastricht/js/main.js
git commit -m "feat: add mobile nav toggle and scroll header script"
```

### Task 4: SVG graphic assets

**Files:**
- Create: `TechMaastricht/assets/images/hub-graphic.svg`
- Create: `TechMaastricht/assets/images/regional-map.svg`
- Create: `TechMaastricht/assets/images/favicon.svg`

- [ ] **Step 1: Create the hero hub graphic**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of Maastricht as a connected hub linking the Netherlands, Germany, Belgium, and Luxembourg">
  <title>Maastricht as a regional tech hub</title>
  <rect width="800" height="600" fill="#1A1A1A"/>
  <g stroke="#C8102E" stroke-width="1.5" opacity="0.6">
    <line x1="400" y1="300" x2="620" y2="140"/>
    <line x1="400" y1="300" x2="660" y2="380"/>
    <line x1="400" y1="300" x2="220" y2="440"/>
    <line x1="400" y1="300" x2="160" y2="180"/>
  </g>
  <circle cx="400" cy="300" r="14" fill="#C8102E"/>
  <circle cx="620" cy="140" r="7" fill="#FAF7F5"/>
  <circle cx="660" cy="380" r="7" fill="#FAF7F5"/>
  <circle cx="220" cy="440" r="7" fill="#FAF7F5"/>
  <circle cx="160" cy="180" r="7" fill="#FAF7F5"/>
  <text x="400" y="332" text-anchor="middle" fill="#FAF7F5" font-family="Manrope, sans-serif" font-size="14" font-weight="700">MAASTRICHT</text>
  <text x="620" y="128" text-anchor="middle" fill="#FAF7F5" font-family="Inter, sans-serif" font-size="13">NL</text>
  <text x="660" y="400" text-anchor="middle" fill="#FAF7F5" font-family="Inter, sans-serif" font-size="13">DE</text>
  <text x="220" y="462" text-anchor="middle" fill="#FAF7F5" font-family="Inter, sans-serif" font-size="13">BE</text>
  <text x="160" y="166" text-anchor="middle" fill="#FAF7F5" font-family="Inter, sans-serif" font-size="13">LU</text>
</svg>
```

- [ ] **Step 2: Create the regional map graphic (larger, used on Regional Hub page)**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 700" role="img" aria-label="Diagram showing Maastricht at the connection point of the Netherlands, Germany, Belgium, and Luxembourg">
  <title>Maastricht in the Meuse-Rhine Euroregion</title>
  <rect width="900" height="700" fill="#FAF7F5"/>
  <g stroke="#C8102E" stroke-width="2" opacity="0.5">
    <line x1="450" y1="350" x2="680" y2="180"/>
    <line x1="450" y1="350" x2="720" y2="460"/>
    <line x1="450" y1="350" x2="260" y2="520"/>
    <line x1="450" y1="350" x2="190" y2="220"/>
  </g>
  <circle cx="450" cy="350" r="20" fill="#C8102E"/>
  <text x="450" y="395" text-anchor="middle" fill="#1A1A1A" font-family="Manrope, sans-serif" font-size="20" font-weight="700">Maastricht</text>
  <circle cx="680" cy="180" r="10" fill="#1A1A1A"/>
  <text x="680" y="160" text-anchor="middle" fill="#1A1A1A" font-family="Inter, sans-serif" font-size="16">Netherlands</text>
  <circle cx="720" cy="460" r="10" fill="#1A1A1A"/>
  <text x="720" y="490" text-anchor="middle" fill="#1A1A1A" font-family="Inter, sans-serif" font-size="16">Germany</text>
  <circle cx="260" cy="520" r="10" fill="#1A1A1A"/>
  <text x="260" y="550" text-anchor="middle" fill="#1A1A1A" font-family="Inter, sans-serif" font-size="16">Belgium</text>
  <circle cx="190" cy="220" r="10" fill="#1A1A1A"/>
  <text x="190" y="200" text-anchor="middle" fill="#1A1A1A" font-family="Inter, sans-serif" font-size="16">Luxembourg</text>
</svg>
```

- [ ] **Step 3: Create the favicon**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#C8102E"/>
  <text x="32" y="44" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="700" font-size="36" fill="#FFFFFF">T</text>
</svg>
```

- [ ] **Step 4: Commit**

```bash
git add TechMaastricht/assets/
git commit -m "feat: add SVG hub graphic, regional map, and favicon"
```

### Task 5: Shared navbar/footer markup (canonical reference)

This block is not a separate file — it defines the exact HTML that Task 6 onward will copy verbatim into the `<body>` of every page (immediately after `<body>` for the nav, immediately before `</body>` for the footer). Copy it unchanged; do not paraphrase or vary it between pages, and keep `<a href="index.html" class="logo">` etc. as literal relative paths since there is no templating layer.

**Canonical navbar block:**

```html
<header class="site-header" id="site-header">
  <nav class="navbar">
    <a href="index.html" class="logo">Tech<span class="logo-accent">Maastricht</span></a>
    <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-links" id="nav-links">
      <a href="index.html">Home</a>
      <a href="about.html">About</a>
      <a href="programs.html">Programs</a>
      <a href="regional-hub.html">Regional Hub</a>
      <a href="events.html">Events</a>
      <a href="community.html">Community</a>
      <a href="contact.html">Contact</a>
      <a href="contact.html" class="btn btn-primary nav-cta">Join the Community</a>
    </div>
  </nav>
</header>
```

**Canonical footer block:**

```html
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <a href="index.html" class="logo logo-footer">Tech<span class="logo-accent">Maastricht</span></a>
      <p>Growing tech talent in Maastricht and connecting it across the Netherlands, Germany, Belgium, and Luxembourg.</p>
    </div>
    <div class="footer-links">
      <h4>Explore</h4>
      <a href="about.html">About</a>
      <a href="programs.html">Programs</a>
      <a href="regional-hub.html">Regional Hub</a>
      <a href="events.html">Events</a>
      <a href="community.html">Community</a>
      <a href="contact.html">Contact</a>
    </div>
    <div class="footer-contact">
      <h4>Connect</h4>
      <a href="mailto:hello@techmaastricht.org">hello@techmaastricht.org</a>
      <div class="social-links">
        <a href="https://linkedin.com/company/techmaastricht" target="_blank" rel="noopener">LinkedIn</a>
        <a href="https://instagram.com/techmaastricht" target="_blank" rel="noopener">Instagram</a>
        <a href="https://x.com/techmaastricht" target="_blank" rel="noopener">X</a>
      </div>
    </div>
    <div class="footer-newsletter">
      <h4>Stay in the loop</h4>
      <form class="newsletter-form" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
        <input type="email" name="email" placeholder="your@email.com" required aria-label="Email address">
        <button type="submit" class="btn btn-secondary-inverse">Subscribe</button>
      </form>
    </div>
  </div>
  <div class="footer-bottom">
    <p>&copy; 2026 TechMaastricht. All rights reserved.</p>
  </div>
</footer>
```

**Canonical `<head>` block** (page-specific `<title>` and meta description fill the two marked spots):

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><!-- PAGE TITLE --></title>
  <meta name="description" content="<!-- PAGE DESCRIPTION -->">
  <meta property="og:title" content="<!-- PAGE TITLE -->">
  <meta property="og:description" content="<!-- PAGE DESCRIPTION -->">
  <meta property="og:image" content="assets/images/hub-graphic.svg">
  <meta property="og:type" content="website">
  <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css">
</head>
```

No commit for this task — it's a reference used by every page task from here on.

## Phase 1: Pages

### Task 6: Home page (`index.html`)

**Files:**
- Create: `TechMaastricht/index.html`

- [ ] **Step 1: Write the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TechMaastricht — The Tech Hub Connecting NL, DE, BE & LU</title>
  <meta name="description" content="TechMaastricht grows tech talent in Maastricht and connects it across the Netherlands, Germany, Belgium, and Luxembourg through community, mentorship, and cross-border programs.">
  <meta property="og:title" content="TechMaastricht — The Tech Hub Connecting NL, DE, BE & LU">
  <meta property="og:description" content="Growing tech talent in Maastricht and connecting it across the region.">
  <meta property="og:image" content="assets/images/hub-graphic.svg">
  <meta property="og:type" content="website">
  <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="site-header site-header--on-dark" id="site-header">
    <nav class="navbar">
      <a href="index.html" class="logo">Tech<span class="logo-accent">Maastricht</span></a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <div class="nav-links" id="nav-links">
        <a href="index.html">Home</a>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
        <a href="contact.html" class="btn btn-primary nav-cta">Join the Community</a>
      </div>
    </nav>
  </header>

  <main>
    <section class="hero">
      <img class="hero-graphic" src="assets/images/hub-graphic.svg" alt="Illustration of Maastricht as a connected hub linking the Netherlands, Germany, Belgium, and Luxembourg">
      <div class="hero-content">
        <h1>Maastricht is becoming Europe's next tech crossroads.</h1>
        <p>We're building the talent, community, and cross-border network that make Maastricht the hub connecting tech in the Netherlands, Germany, Belgium, and Luxembourg.</p>
        <div class="hero-ctas">
          <a href="contact.html" class="btn btn-primary">Join the Community</a>
          <a href="programs.html" class="btn btn-secondary-inverse">Explore Programs</a>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <h2>Why Maastricht</h2>
          <p>A small city with an outsized geographic advantage — and a community determined to use it.</p>
        </div>
        <div class="grid grid-4">
          <div class="card">
            <span class="card-number">01</span>
            <h3>Cross-Border Talent</h3>
            <p>Maastricht sits within an hour of Germany, Belgium, and a short drive from Luxembourg — a single tech community can draw from four countries at once.</p>
          </div>
          <div class="card">
            <span class="card-number">02</span>
            <h3>Community-Driven</h3>
            <p>Every program is built with the people who show up to it — developers, students, founders, and companies shaping what the hub becomes.</p>
          </div>
          <div class="card">
            <span class="card-number">03</span>
            <h3>Future-Ready Skills</h3>
            <p>From first line of code to senior engineering roles, our programs meet people where they are and help them grow toward where the region needs them.</p>
          </div>
          <div class="card">
            <span class="card-number">04</span>
            <h3>Open & Inclusive</h3>
            <p>No matter your background, language, or starting point — if you want to build a tech career or company here, there's a place for you.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-header">
          <h2>Programs</h2>
          <p>Practical ways to learn, connect, and grow — whether you're just starting out or scaling a company.</p>
        </div>
        <div class="grid grid-4">
          <div class="card">
            <h3>Meetups</h3>
            <p>Recurring local meetups and socials for developers and tech enthusiasts across South Limburg.</p>
            <a href="programs.html" class="card-link">Learn more →</a>
          </div>
          <div class="card">
            <h3>Mentorship</h3>
            <p>Pairing experienced tech professionals with newcomers and career-switchers building their path.</p>
            <a href="programs.html" class="card-link">Learn more →</a>
          </div>
          <div class="card">
            <h3>Workforce Training</h3>
            <p>Part-time, bootcamp-style upskilling programs designed around real regional hiring needs.</p>
            <a href="programs.html" class="card-link">Learn more →</a>
          </div>
          <div class="card">
            <h3>Cross-Border Exchange</h3>
            <p>Joint programs and events with tech communities in Aachen, Liège, and Luxembourg City.</p>
            <a href="programs.html" class="card-link">Learn more →</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container grid grid-2" style="align-items: center;">
        <div>
          <h2>One city, four countries within reach</h2>
          <p style="margin-top: 16px;">Maastricht sits at the literal tri-border point of the Netherlands, Germany, and Belgium — with Luxembourg a short trip further south. That's not a footnote, it's the whole premise: a tech hub built to be genuinely regional from day one.</p>
          <a href="regional-hub.html" class="btn btn-secondary" style="margin-top: 24px;">Explore the Regional Hub →</a>
        </div>
        <img src="assets/images/regional-map.svg" alt="Diagram showing Maastricht at the connection point of the Netherlands, Germany, Belgium, and Luxembourg" style="border-radius: 16px;">
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-header">
          <h2>Upcoming Events</h2>
          <p>Come meet the community in person.</p>
        </div>
        <div class="grid grid-3">
          <div class="card">
            <span class="card-number">MONTHLY</span>
            <h3>TechMaastricht Meetup</h3>
            <p>Lightning talks, networking, and drinks — first Thursday of every month.</p>
          </div>
          <div class="card">
            <span class="card-number">QUARTERLY</span>
            <h3>Cross-Border Hackathon</h3>
            <p>A weekend build event with teams from Maastricht, Aachen, and Liège.</p>
          </div>
          <div class="card">
            <span class="card-number">ANNUAL</span>
            <h3>Regional Tech Summit</h3>
            <p>The hub's flagship event bringing together talent and employers from all four countries.</p>
          </div>
        </div>
        <div style="text-align:center; margin-top: 40px;">
          <a href="events.html" class="btn btn-secondary">See All Events</a>
        </div>
      </div>
    </section>

    <section class="cta-band">
      <h2>Ready to build Maastricht's tech future with us?</h2>
      <p>Whether you're a developer, a student, a founder, or a company hiring across the region — there's a way to plug in.</p>
      <a href="contact.html" class="btn btn-secondary-inverse">Get Involved</a>
    </section>
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a href="index.html" class="logo logo-footer">Tech<span class="logo-accent">Maastricht</span></a>
        <p>Growing tech talent in Maastricht and connecting it across the Netherlands, Germany, Belgium, and Luxembourg.</p>
      </div>
      <div class="footer-links">
        <h4>Explore</h4>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
      </div>
      <div class="footer-contact">
        <h4>Connect</h4>
        <a href="mailto:hello@techmaastricht.org">hello@techmaastricht.org</a>
        <div class="social-links">
          <a href="https://linkedin.com/company/techmaastricht" target="_blank" rel="noopener">LinkedIn</a>
          <a href="https://instagram.com/techmaastricht" target="_blank" rel="noopener">Instagram</a>
          <a href="https://x.com/techmaastricht" target="_blank" rel="noopener">X</a>
        </div>
      </div>
      <div class="footer-newsletter">
        <h4>Stay in the loop</h4>
        <form class="newsletter-form" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
          <input type="email" name="email" placeholder="your@email.com" required aria-label="Email address">
          <button type="submit" class="btn btn-secondary-inverse">Subscribe</button>
        </form>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 TechMaastricht. All rights reserved.</p>
    </div>
  </footer>

  <script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify**

```bash
cd TechMaastricht && ./verify.sh
```

Expected: `FAIL` for the remaining 6 pages only — no failures listed for `index.html`.

- [ ] **Step 3: Commit**

```bash
git add TechMaastricht/index.html
git commit -m "feat: add TechMaastricht home page"
```

### Task 7: About page (`about.html`)

**Files:**
- Create: `TechMaastricht/about.html`

- [ ] **Step 1: Write the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About — TechMaastricht</title>
  <meta name="description" content="Why TechMaastricht exists: growing local tech talent and connecting Maastricht's tech community across the Netherlands, Germany, Belgium, and Luxembourg.">
  <meta property="og:title" content="About — TechMaastricht">
  <meta property="og:description" content="Why TechMaastricht exists and what we stand for.">
  <meta property="og:image" content="assets/images/hub-graphic.svg">
  <meta property="og:type" content="website">
  <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="site-header" id="site-header">
    <nav class="navbar">
      <a href="index.html" class="logo">Tech<span class="logo-accent">Maastricht</span></a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <div class="nav-links" id="nav-links">
        <a href="index.html">Home</a>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
        <a href="contact.html" class="btn btn-primary nav-cta">Join the Community</a>
      </div>
    </nav>
  </header>

  <main>
    <section class="page-hero">
      <h1>Built by the community it serves</h1>
      <p>TechMaastricht started with a simple observation: this city sits at the meeting point of four countries, but its tech talent had no shared home. We're building one.</p>
    </section>

    <section class="section">
      <div class="container grid grid-2" style="align-items: center;">
        <div>
          <h2>Our story</h2>
          <p style="margin-top: 16px;">Maastricht has always punched above its weight — a historic university city, a magnet for international students, and a short drive from three other countries. What it lacked was a single place where developers, students, founders, and companies from across that region could actually find each other.</p>
          <p style="margin-top: 16px;">TechMaastricht exists to close that gap: one community, built locally, with a mission that was cross-border from day one.</p>
        </div>
        <div>
          <h2>Our mission</h2>
          <p style="margin-top: 16px;">To grow a thriving tech talent base in Maastricht and South Limburg, and to make the city a genuine connection point for tech collaboration with Germany, Belgium, and Luxembourg.</p>
          <h2 style="margin-top: 32px;">Our vision</h2>
          <p style="margin-top: 16px;">A region where a developer in Maastricht, a founder in Aachen, and a hiring manager in Liège are all part of the same community — not separated by a border that's a twenty-minute drive wide.</p>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-header">
          <h2>What we stand for</h2>
        </div>
        <div class="grid grid-4">
          <div class="card">
            <h3>Cross-Border Talent</h3>
            <p>We treat the region, not just the city, as our community.</p>
          </div>
          <div class="card">
            <h3>Community-Driven</h3>
            <p>Programs are shaped by the people who show up to them.</p>
          </div>
          <div class="card">
            <h3>Future-Ready Skills</h3>
            <p>We build for where the region's tech needs are heading, not just where they are.</p>
          </div>
          <div class="card">
            <h3>Open & Inclusive</h3>
            <p>Every background and starting point has a place here.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <h2>The team</h2>
          <p>TechMaastricht is run by a small founding team, growing alongside the community.</p>
        </div>
        <div class="grid grid-3">
          <div class="card">
            <h3>Founder & Director</h3>
            <p>Sets the vision and leads partnerships across the region.</p>
          </div>
          <div class="card">
            <h3>Community Lead</h3>
            <p>Runs meetups, mentorship matching, and day-to-day community support.</p>
          </div>
          <div class="card">
            <h3>Partnerships Lead</h3>
            <p>Builds relationships with universities, companies, and sister communities in DE, BE, and LU.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="cta-band">
      <h2>Want to help shape what comes next?</h2>
      <p>We're early — which means there's real room to help build this from the ground up.</p>
      <a href="contact.html" class="btn btn-secondary-inverse">Get In Touch</a>
    </section>
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a href="index.html" class="logo logo-footer">Tech<span class="logo-accent">Maastricht</span></a>
        <p>Growing tech talent in Maastricht and connecting it across the Netherlands, Germany, Belgium, and Luxembourg.</p>
      </div>
      <div class="footer-links">
        <h4>Explore</h4>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
      </div>
      <div class="footer-contact">
        <h4>Connect</h4>
        <a href="mailto:hello@techmaastricht.org">hello@techmaastricht.org</a>
        <div class="social-links">
          <a href="https://linkedin.com/company/techmaastricht" target="_blank" rel="noopener">LinkedIn</a>
          <a href="https://instagram.com/techmaastricht" target="_blank" rel="noopener">Instagram</a>
          <a href="https://x.com/techmaastricht" target="_blank" rel="noopener">X</a>
        </div>
      </div>
      <div class="footer-newsletter">
        <h4>Stay in the loop</h4>
        <form class="newsletter-form" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
          <input type="email" name="email" placeholder="your@email.com" required aria-label="Email address">
          <button type="submit" class="btn btn-secondary-inverse">Subscribe</button>
        </form>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 TechMaastricht. All rights reserved.</p>
    </div>
  </footer>

  <script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify**

```bash
cd TechMaastricht && ./verify.sh
```

Expected: no failures listed for `about.html`.

- [ ] **Step 3: Commit**

```bash
git add TechMaastricht/about.html
git commit -m "feat: add TechMaastricht about page"
```

### Task 8: Programs page (`programs.html`)

**Files:**
- Create: `TechMaastricht/programs.html`

- [ ] **Step 1: Add page-specific CSS for the program section icons**

Append to `TechMaastricht/css/style.css`:

```css
.pillar-index { color: var(--color-red); font-family: var(--font-display); font-weight: 700; font-size: 0.85rem; letter-spacing: 0.05em; }
.pillar-block { padding: 40px 0; border-bottom: 1px solid #eee; }
.pillar-block:last-child { border-bottom: none; }
.pillar-block h3 { margin-top: 8px; margin-bottom: 12px; font-size: 1.5rem; }
.pillar-block p { max-width: 640px; }
```

- [ ] **Step 2: Write the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Programs — TechMaastricht</title>
  <meta name="description" content="Meetups, mentorship, workforce training, student outreach, startup support, and cross-border exchange — the six programs TechMaastricht runs to grow the region's tech talent.">
  <meta property="og:title" content="Programs — TechMaastricht">
  <meta property="og:description" content="Six programs building tech talent across Maastricht and the border region.">
  <meta property="og:image" content="assets/images/hub-graphic.svg">
  <meta property="og:type" content="website">
  <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="site-header" id="site-header">
    <nav class="navbar">
      <a href="index.html" class="logo">Tech<span class="logo-accent">Maastricht</span></a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <div class="nav-links" id="nav-links">
        <a href="index.html">Home</a>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
        <a href="contact.html" class="btn btn-primary nav-cta">Join the Community</a>
      </div>
    </nav>
  </header>

  <main>
    <section class="page-hero">
      <h1>Six ways to grow with the community</h1>
      <p>Every program exists to do one of two things: help you build tech skills, or help you find the people who can use them — across Maastricht and the wider border region.</p>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header" style="text-align:left; margin-bottom: 24px;">
          <h2>The Six Pillars</h2>
        </div>
        <div class="pillar-block">
          <span class="pillar-index">01 — COMMUNITY</span>
          <h3>Meetups</h3>
          <p>Recurring local meetups and socials for developers and tech enthusiasts across South Limburg — lightning talks, demo nights, and simply a reason to get out from behind the screen and meet the people building alongside you.</p>
        </div>
        <div class="pillar-block">
          <span class="pillar-index">02 — CAREER</span>
          <h3>Mentorship</h3>
          <p>We pair experienced tech professionals with newcomers and career-switchers, matched on goals rather than just job titles. Mentors commit to a few hours a month; mentees get a real sounding board for the decisions that matter most early in a career.</p>
        </div>
        <div class="pillar-block">
          <span class="pillar-index">03 — SKILLS</span>
          <h3>Workforce Training</h3>
          <p>Part-time, bootcamp-style upskilling programs built around the roles regional employers are actually hiring for — not a generic curriculum, but one shaped by conversations with the companies doing the hiring.</p>
        </div>
        <div class="pillar-block">
          <span class="pillar-index">04 — PIPELINE</span>
          <h3>Student & Youth Outreach</h3>
          <p>Partnership programs with Maastricht University, Zuyd Hogeschool, and local secondary schools — introducing students to tech careers early and giving them a direct line into the community before they graduate.</p>
        </div>
        <div class="pillar-block">
          <span class="pillar-index">05 — ENTREPRENEURSHIP</span>
          <h3>Startup Support</h3>
          <p>Office hours, warm introductions, and a peer network for early-stage tech founders based in or building for the region — because a great idea shouldn't stall for lack of the right connection.</p>
        </div>
        <div class="pillar-block">
          <span class="pillar-index">06 — REGIONAL</span>
          <h3>Cross-Border Exchange</h3>
          <p>Joint programs and events run together with tech communities in Aachen (Germany), Liège (Belgium), and Luxembourg City — shared hackathons, speaker exchanges, and a growing sense that this is one talent market, not four separate ones.</p>
        </div>
      </div>
    </section>

    <section class="cta-band">
      <h2>Find your program</h2>
      <p>Not sure where you fit? Reach out and we'll point you to the right one.</p>
      <a href="contact.html" class="btn btn-secondary-inverse">Get In Touch</a>
    </section>
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a href="index.html" class="logo logo-footer">Tech<span class="logo-accent">Maastricht</span></a>
        <p>Growing tech talent in Maastricht and connecting it across the Netherlands, Germany, Belgium, and Luxembourg.</p>
      </div>
      <div class="footer-links">
        <h4>Explore</h4>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
      </div>
      <div class="footer-contact">
        <h4>Connect</h4>
        <a href="mailto:hello@techmaastricht.org">hello@techmaastricht.org</a>
        <div class="social-links">
          <a href="https://linkedin.com/company/techmaastricht" target="_blank" rel="noopener">LinkedIn</a>
          <a href="https://instagram.com/techmaastricht" target="_blank" rel="noopener">Instagram</a>
          <a href="https://x.com/techmaastricht" target="_blank" rel="noopener">X</a>
        </div>
      </div>
      <div class="footer-newsletter">
        <h4>Stay in the loop</h4>
        <form class="newsletter-form" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
          <input type="email" name="email" placeholder="your@email.com" required aria-label="Email address">
          <button type="submit" class="btn btn-secondary-inverse">Subscribe</button>
        </form>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 TechMaastricht. All rights reserved.</p>
    </div>
  </footer>

  <script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify**

```bash
cd TechMaastricht && ./verify.sh
```

Expected: no failures listed for `programs.html`.

- [ ] **Step 4: Commit**

```bash
git add TechMaastricht/programs.html TechMaastricht/css/style.css
git commit -m "feat: add TechMaastricht programs page"
```

### Task 9: Regional Hub page (`regional-hub.html`)

**Files:**
- Create: `TechMaastricht/regional-hub.html`

- [ ] **Step 1: Write the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Regional Hub — TechMaastricht</title>
  <meta name="description" content="Why Maastricht is positioned to be a genuine cross-border tech hub connecting the Netherlands, Germany, Belgium, and Luxembourg.">
  <meta property="og:title" content="Regional Hub — TechMaastricht">
  <meta property="og:description" content="Maastricht's cross-border position and why it matters for tech.">
  <meta property="og:image" content="assets/images/regional-map.svg">
  <meta property="og:type" content="website">
  <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="site-header" id="site-header">
    <nav class="navbar">
      <a href="index.html" class="logo">Tech<span class="logo-accent">Maastricht</span></a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <div class="nav-links" id="nav-links">
        <a href="index.html">Home</a>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
        <a href="contact.html" class="btn btn-primary nav-cta">Join the Community</a>
      </div>
    </nav>
  </header>

  <main>
    <section class="page-hero">
      <h1>One region, one talent market</h1>
      <p>Maastricht sits at the literal tri-border point of the Netherlands, Germany, and Belgium, with Luxembourg less than a two-hour drive south. We think that geography should shape how the tech community here works — not just where it happens to be located.</p>
    </section>

    <section class="section">
      <div class="container grid grid-2" style="align-items: center;">
        <img src="assets/images/regional-map.svg" alt="Diagram showing Maastricht at the connection point of the Netherlands, Germany, Belgium, and Luxembourg">
        <div>
          <h2>The Meuse-Rhine Euroregion</h2>
          <p style="margin-top: 16px;">Maastricht anchors the Dutch corner of the Meuse-Rhine Euroregion, a cross-border area that also includes Aachen (Germany), Liège (Belgium), and reaches toward Luxembourg. Millions of people and a dense cluster of universities, research institutes, and companies sit within an hour's drive of each other — but the region's tech talent has historically organized along national lines instead of around that shared geography.</p>
          <p style="margin-top: 16px;">TechMaastricht is built on the bet that a single, connected community serves the region better than four disconnected ones.</p>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-header">
          <h2>Why cross-border matters</h2>
        </div>
        <div class="grid grid-3">
          <div class="card">
            <h3>Talent mobility</h3>
            <p>Developers in Maastricht, Aachen, and Liège are commuting distance from each other — a shared community makes it far easier to find the right role or the right hire, regardless of which side of a border it's on.</p>
          </div>
          <div class="card">
            <h3>Employer access</h3>
            <p>Companies hiring in one country can tap talent and partnerships across all four, instead of competing for the same small local pool.</p>
          </div>
          <div class="card">
            <h3>Shared events</h3>
            <p>Hackathons, meetups, and summits rotate across the region, so no single city carries the community alone — and everyone gets a reason to cross a border they'd otherwise never think about.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="cta-band">
      <h2>Are you a community or organization in DE, BE, or LU?</h2>
      <p>We're actively building partnerships with sister tech communities across the region — let's talk about what we can build together.</p>
      <a href="contact.html" class="btn btn-secondary-inverse">Partner With Us</a>
    </section>
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a href="index.html" class="logo logo-footer">Tech<span class="logo-accent">Maastricht</span></a>
        <p>Growing tech talent in Maastricht and connecting it across the Netherlands, Germany, Belgium, and Luxembourg.</p>
      </div>
      <div class="footer-links">
        <h4>Explore</h4>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
      </div>
      <div class="footer-contact">
        <h4>Connect</h4>
        <a href="mailto:hello@techmaastricht.org">hello@techmaastricht.org</a>
        <div class="social-links">
          <a href="https://linkedin.com/company/techmaastricht" target="_blank" rel="noopener">LinkedIn</a>
          <a href="https://instagram.com/techmaastricht" target="_blank" rel="noopener">Instagram</a>
          <a href="https://x.com/techmaastricht" target="_blank" rel="noopener">X</a>
        </div>
      </div>
      <div class="footer-newsletter">
        <h4>Stay in the loop</h4>
        <form class="newsletter-form" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
          <input type="email" name="email" placeholder="your@email.com" required aria-label="Email address">
          <button type="submit" class="btn btn-secondary-inverse">Subscribe</button>
        </form>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 TechMaastricht. All rights reserved.</p>
    </div>
  </footer>

  <script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify**

```bash
cd TechMaastricht && ./verify.sh
```

Expected: no failures listed for `regional-hub.html`.

- [ ] **Step 3: Commit**

```bash
git add TechMaastricht/regional-hub.html
git commit -m "feat: add TechMaastricht regional hub page"
```

### Task 10: Events page (`events.html`)

**Files:**
- Create: `TechMaastricht/events.html`

- [ ] **Step 1: Add page-specific CSS for the event list and gallery placeholder**

Append to `TechMaastricht/css/style.css`:

```css
.event-row { display: flex; flex-wrap: wrap; gap: 20px; align-items: center; justify-content: space-between; padding: 24px 0; border-bottom: 1px solid #eee; }
.event-date { font-family: var(--font-display); font-weight: 700; color: var(--color-red); min-width: 120px; }
.event-info h3 { margin-bottom: 4px; }
.gallery-placeholder { aspect-ratio: 4 / 3; background: var(--color-offwhite); border-radius: var(--radius); display: flex; align-items: center; justify-content: center; color: var(--color-grey); font-size: 0.85rem; }
```

- [ ] **Step 2: Write the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Events — TechMaastricht</title>
  <meta name="description" content="Upcoming TechMaastricht meetups, hackathons, and the annual Regional Tech Summit — plus how to host an event with the community.">
  <meta property="og:title" content="Events — TechMaastricht">
  <meta property="og:description" content="Upcoming meetups, hackathons, and summits.">
  <meta property="og:image" content="assets/images/hub-graphic.svg">
  <meta property="og:type" content="website">
  <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="site-header" id="site-header">
    <nav class="navbar">
      <a href="index.html" class="logo">Tech<span class="logo-accent">Maastricht</span></a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <div class="nav-links" id="nav-links">
        <a href="index.html">Home</a>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
        <a href="contact.html" class="btn btn-primary nav-cta">Join the Community</a>
      </div>
    </nav>
  </header>

  <main>
    <section class="page-hero">
      <h1>Come meet the community</h1>
      <p>The fastest way to understand what TechMaastricht is about is to show up to one of these.</p>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header" style="text-align:left; margin-bottom: 24px;">
          <h2>Upcoming</h2>
        </div>
        <div class="event-row">
          <div class="event-date">First Thursday<br>Monthly</div>
          <div class="event-info">
            <h3>TechMaastricht Meetup</h3>
            <p>Lightning talks, networking, and drinks at a local venue in the city center.</p>
          </div>
          <a href="contact.html" class="btn btn-secondary">RSVP</a>
        </div>
        <div class="event-row">
          <div class="event-date">Quarterly</div>
          <div class="event-info">
            <h3>Cross-Border Hackathon</h3>
            <p>A weekend build event with teams from Maastricht, Aachen, and Liège — open to all skill levels.</p>
          </div>
          <a href="contact.html" class="btn btn-secondary">RSVP</a>
        </div>
        <div class="event-row">
          <div class="event-date">Annual</div>
          <div class="event-info">
            <h3>Regional Tech Summit</h3>
            <p>Our flagship event bringing together talent and employers from the Netherlands, Germany, Belgium, and Luxembourg.</p>
          </div>
          <a href="contact.html" class="btn btn-secondary">RSVP</a>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-header">
          <h2>Past Events</h2>
          <p>A look back at what the community has built together so far.</p>
        </div>
        <div class="grid grid-4">
          <div class="gallery-placeholder">Event photo</div>
          <div class="gallery-placeholder">Event photo</div>
          <div class="gallery-placeholder">Event photo</div>
          <div class="gallery-placeholder">Event photo</div>
        </div>
      </div>
    </section>

    <section class="cta-band">
      <h2>Want to host an event with us?</h2>
      <p>If you're a company, university, or community group with a space or an idea, let's talk.</p>
      <a href="contact.html" class="btn btn-secondary-inverse">Host With Us</a>
    </section>
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a href="index.html" class="logo logo-footer">Tech<span class="logo-accent">Maastricht</span></a>
        <p>Growing tech talent in Maastricht and connecting it across the Netherlands, Germany, Belgium, and Luxembourg.</p>
      </div>
      <div class="footer-links">
        <h4>Explore</h4>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
      </div>
      <div class="footer-contact">
        <h4>Connect</h4>
        <a href="mailto:hello@techmaastricht.org">hello@techmaastricht.org</a>
        <div class="social-links">
          <a href="https://linkedin.com/company/techmaastricht" target="_blank" rel="noopener">LinkedIn</a>
          <a href="https://instagram.com/techmaastricht" target="_blank" rel="noopener">Instagram</a>
          <a href="https://x.com/techmaastricht" target="_blank" rel="noopener">X</a>
        </div>
      </div>
      <div class="footer-newsletter">
        <h4>Stay in the loop</h4>
        <form class="newsletter-form" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
          <input type="email" name="email" placeholder="your@email.com" required aria-label="Email address">
          <button type="submit" class="btn btn-secondary-inverse">Subscribe</button>
        </form>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 TechMaastricht. All rights reserved.</p>
    </div>
  </footer>

  <script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify**

```bash
cd TechMaastricht && ./verify.sh
```

Expected: no failures listed for `events.html`.

- [ ] **Step 4: Commit**

```bash
git add TechMaastricht/events.html TechMaastricht/css/style.css
git commit -m "feat: add TechMaastricht events page"
```

### Task 11: Community page (`community.html`)

**Files:**
- Create: `TechMaastricht/community.html`

- [ ] **Step 1: Add page-specific CSS for the partner logo strip**

Append to `TechMaastricht/css/style.css`:

```css
.logo-strip { display: flex; flex-wrap: wrap; gap: 32px; align-items: center; justify-content: center; }
.logo-strip .logo-placeholder { width: 140px; height: 60px; background: var(--color-offwhite); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--color-grey); font-size: 0.8rem; }
```

- [ ] **Step 2: Write the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Community — TechMaastricht</title>
  <meta name="description" content="Who's part of TechMaastricht and how to join — developers, students, founders, and companies across Maastricht and the border region.">
  <meta property="og:title" content="Community — TechMaastricht">
  <meta property="og:description" content="Who's part of the community and how to join.">
  <meta property="og:image" content="assets/images/hub-graphic.svg">
  <meta property="og:type" content="website">
  <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="site-header" id="site-header">
    <nav class="navbar">
      <a href="index.html" class="logo">Tech<span class="logo-accent">Maastricht</span></a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <div class="nav-links" id="nav-links">
        <a href="index.html">Home</a>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
        <a href="contact.html" class="btn btn-primary nav-cta">Join the Community</a>
      </div>
    </nav>
  </header>

  <main>
    <section class="page-hero">
      <h1>Who's in the room</h1>
      <p>TechMaastricht is developers, students, founders, and companies — all treating the region as one shared talent market instead of four separate ones.</p>
    </section>

    <section class="section">
      <div class="container">
        <div class="grid grid-4">
          <div class="card">
            <h3>Developers</h3>
            <p>From junior to senior, looking for peers, mentors, and the next opportunity.</p>
          </div>
          <div class="card">
            <h3>Students</h3>
            <p>Exploring tech careers with a direct line into the local and regional job market.</p>
          </div>
          <div class="card">
            <h3>Founders</h3>
            <p>Building companies and looking for co-founders, early hires, and advice.</p>
          </div>
          <div class="card">
            <h3>Companies</h3>
            <p>Hiring across the region and looking to support the talent pipeline that feeds them.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-header">
          <h2>Ways to join</h2>
        </div>
        <div class="grid grid-3">
          <div class="card">
            <h3>Community chat</h3>
            <p>Join the day-to-day conversation, ask questions, and find out what's happening next.</p>
            <a href="contact.html" class="card-link">Get the invite →</a>
          </div>
          <div class="card">
            <h3>Newsletter</h3>
            <p>A monthly roundup of events, opportunities, and community news — no spam.</p>
            <a href="contact.html" class="card-link">Subscribe →</a>
          </div>
          <div class="card">
            <h3>Meetup calendar</h3>
            <p>See what's coming up and add it straight to your calendar.</p>
            <a href="events.html" class="card-link">View events →</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <h2>Community spotlight</h2>
          <p>One story from the community, featured regularly.</p>
        </div>
        <div class="card" style="max-width: 720px; margin: 0 auto;">
          <h3>"Finding my first mentor here changed the direction of my career."</h3>
          <p style="margin-top: 12px;">A member's reflection on switching into tech through the mentorship program — full stories are shared as the community grows.</p>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-header">
          <h2>Partner organizations</h2>
        </div>
        <div class="logo-strip">
          <div class="logo-placeholder">Partner logo</div>
          <div class="logo-placeholder">Partner logo</div>
          <div class="logo-placeholder">Partner logo</div>
          <div class="logo-placeholder">Partner logo</div>
        </div>
      </div>
    </section>

    <section class="cta-band" id="join">
      <h2>Ready to join?</h2>
      <p>It takes thirty seconds to become part of the community.</p>
      <a href="contact.html" class="btn btn-secondary-inverse">Join the Community</a>
    </section>
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a href="index.html" class="logo logo-footer">Tech<span class="logo-accent">Maastricht</span></a>
        <p>Growing tech talent in Maastricht and connecting it across the Netherlands, Germany, Belgium, and Luxembourg.</p>
      </div>
      <div class="footer-links">
        <h4>Explore</h4>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
      </div>
      <div class="footer-contact">
        <h4>Connect</h4>
        <a href="mailto:hello@techmaastricht.org">hello@techmaastricht.org</a>
        <div class="social-links">
          <a href="https://linkedin.com/company/techmaastricht" target="_blank" rel="noopener">LinkedIn</a>
          <a href="https://instagram.com/techmaastricht" target="_blank" rel="noopener">Instagram</a>
          <a href="https://x.com/techmaastricht" target="_blank" rel="noopener">X</a>
        </div>
      </div>
      <div class="footer-newsletter">
        <h4>Stay in the loop</h4>
        <form class="newsletter-form" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
          <input type="email" name="email" placeholder="your@email.com" required aria-label="Email address">
          <button type="submit" class="btn btn-secondary-inverse">Subscribe</button>
        </form>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 TechMaastricht. All rights reserved.</p>
    </div>
  </footer>

  <script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify**

```bash
cd TechMaastricht && ./verify.sh
```

Expected: no failures listed for `community.html`.

- [ ] **Step 4: Commit**

```bash
git add TechMaastricht/community.html TechMaastricht/css/style.css
git commit -m "feat: add TechMaastricht community page"
```

### Task 12: Contact page (`contact.html`)

**Files:**
- Create: `TechMaastricht/contact.html`

- [ ] **Step 1: Add page-specific CSS for the contact form and info list**

Append to `TechMaastricht/css/style.css`:

```css
.contact-form { display: flex; flex-direction: column; gap: 16px; }
.contact-form label { font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; display: block; }
.contact-form input, .contact-form textarea { width: 100%; padding: 12px 16px; border: 1px solid #ddd; border-radius: 8px; font-family: var(--font-body); font-size: 1rem; }
.contact-form textarea { min-height: 140px; resize: vertical; }
.contact-info-list { list-style: none; }
.contact-info-list li { margin-bottom: 20px; }
.contact-info-list .label { display: block; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-grey); margin-bottom: 4px; }
```

- [ ] **Step 2: Write the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contact — TechMaastricht</title>
  <meta name="description" content="Get in touch with TechMaastricht — join the community, ask about programs, or explore a partnership across the Netherlands, Germany, Belgium, and Luxembourg.">
  <meta property="og:title" content="Contact — TechMaastricht">
  <meta property="og:description" content="Get in touch or join the community.">
  <meta property="og:image" content="assets/images/hub-graphic.svg">
  <meta property="og:type" content="website">
  <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="site-header" id="site-header">
    <nav class="navbar">
      <a href="index.html" class="logo">Tech<span class="logo-accent">Maastricht</span></a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <div class="nav-links" id="nav-links">
        <a href="index.html">Home</a>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
        <a href="contact.html" class="btn btn-primary nav-cta">Join the Community</a>
      </div>
    </nav>
  </header>

  <main>
    <section class="page-hero">
      <h1>Let's talk</h1>
      <p>Whether you want to join, mentor, partner, or just ask a question — this is the fastest way to reach us.</p>
    </section>

    <section class="section">
      <div class="container grid grid-2">
        <div>
          <h2>Send a message</h2>
          <form class="contact-form" style="margin-top: 24px;" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
            <div>
              <label for="name">Name</label>
              <input type="text" id="name" name="name" required>
            </div>
            <div>
              <label for="email">Email</label>
              <input type="email" id="email" name="email" required>
            </div>
            <div>
              <label for="reason">I'm reaching out about</label>
              <input type="text" id="reason" name="reason" placeholder="Joining, mentoring, partnership, event, other">
            </div>
            <div>
              <label for="message">Message</label>
              <textarea id="message" name="message" required></textarea>
            </div>
            <button type="submit" class="btn btn-primary" style="align-self: flex-start;">Send Message</button>
          </form>
        </div>
        <div>
          <h2>Other ways to reach us</h2>
          <ul class="contact-info-list" style="margin-top: 24px;">
            <li>
              <span class="label">Email</span>
              <a href="mailto:hello@techmaastricht.org">hello@techmaastricht.org</a>
            </li>
            <li>
              <span class="label">Hub location</span>
              Maastricht, Limburg, The Netherlands
            </li>
            <li>
              <span class="label">Social</span>
              <div class="social-links" style="color: var(--color-charcoal);">
                <a href="https://linkedin.com/company/techmaastricht" target="_blank" rel="noopener" style="color: var(--color-charcoal);">LinkedIn</a>
                <a href="https://instagram.com/techmaastricht" target="_blank" rel="noopener" style="color: var(--color-charcoal);">Instagram</a>
                <a href="https://x.com/techmaastricht" target="_blank" rel="noopener" style="color: var(--color-charcoal);">X</a>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a href="index.html" class="logo logo-footer">Tech<span class="logo-accent">Maastricht</span></a>
        <p>Growing tech talent in Maastricht and connecting it across the Netherlands, Germany, Belgium, and Luxembourg.</p>
      </div>
      <div class="footer-links">
        <h4>Explore</h4>
        <a href="about.html">About</a>
        <a href="programs.html">Programs</a>
        <a href="regional-hub.html">Regional Hub</a>
        <a href="events.html">Events</a>
        <a href="community.html">Community</a>
        <a href="contact.html">Contact</a>
      </div>
      <div class="footer-contact">
        <h4>Connect</h4>
        <a href="mailto:hello@techmaastricht.org">hello@techmaastricht.org</a>
        <div class="social-links">
          <a href="https://linkedin.com/company/techmaastricht" target="_blank" rel="noopener">LinkedIn</a>
          <a href="https://instagram.com/techmaastricht" target="_blank" rel="noopener">Instagram</a>
          <a href="https://x.com/techmaastricht" target="_blank" rel="noopener">X</a>
        </div>
      </div>
      <div class="footer-newsletter">
        <h4>Stay in the loop</h4>
        <form class="newsletter-form" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
          <input type="email" name="email" placeholder="your@email.com" required aria-label="Email address">
          <button type="submit" class="btn btn-secondary-inverse">Subscribe</button>
        </form>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 TechMaastricht. All rights reserved.</p>
    </div>
  </footer>

  <script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify**

```bash
cd TechMaastricht && ./verify.sh
```

Expected: `PASS: all 7 pages verified` — all pages now exist.

- [ ] **Step 4: Commit**

```bash
git add TechMaastricht/contact.html TechMaastricht/css/style.css
git commit -m "feat: add TechMaastricht contact page"
```

## Phase 2: SEO, deployment docs, final verification

### Task 13: `sitemap.xml` and `robots.txt`

**Files:**
- Create: `TechMaastricht/sitemap.xml`
- Create: `TechMaastricht/robots.txt`

- [ ] **Step 1: Write the sitemap**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://techmaastricht.org/</loc></url>
  <url><loc>https://techmaastricht.org/about.html</loc></url>
  <url><loc>https://techmaastricht.org/programs.html</loc></url>
  <url><loc>https://techmaastricht.org/regional-hub.html</loc></url>
  <url><loc>https://techmaastricht.org/events.html</loc></url>
  <url><loc>https://techmaastricht.org/community.html</loc></url>
  <url><loc>https://techmaastricht.org/contact.html</loc></url>
</urlset>
```

- [ ] **Step 2: Write robots.txt**

```
User-agent: *
Allow: /

Sitemap: https://techmaastricht.org/sitemap.xml
```

- [ ] **Step 3: Commit**

```bash
git add TechMaastricht/sitemap.xml TechMaastricht/robots.txt
git commit -m "chore: add sitemap and robots.txt"
```

### Task 14: README with deployment instructions

**Files:**
- Create: `TechMaastricht/README.md`

- [ ] **Step 1: Write the README**

```markdown
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
   (present on all 7 pages) with your real Formspree form ID.
2. **Social links**: replace the placeholder LinkedIn/Instagram/X URLs (in every page's
   footer and on `contact.html`) with the real profile URLs once they exist.
3. **Contact email**: replace `hello@techmaastricht.org` with the real inbox once set up.
4. **Content**: swap placeholder team bios, event dates, and partner logos for real ones
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
```

- [ ] **Step 2: Commit**

```bash
git add TechMaastricht/README.md
git commit -m "docs: add TechMaastricht README with deployment instructions"
```

### Task 15: Final full-site verification

**Files:** none (verification only)

- [ ] **Step 1: Run the structural verification script**

```bash
cd TechMaastricht && ./verify.sh
```

Expected: `PASS: all 7 pages verified`

- [ ] **Step 2: Serve the site locally and manually check every page**

```bash
cd TechMaastricht && python3 -m http.server 8000
```

Open `http://localhost:8000` and check, for each of the 7 pages:
- Navbar is transparent over the hero (home page only) / solid on page-hero pages, and turns solid white on scroll on every page
- All 7 nav links and the "Join the Community" CTA work
- Mobile view (resize browser under 1024px): hamburger menu opens/closes and closes on link click
- Footer newsletter form and all footer links render correctly
- No broken images (hub graphic, regional map, favicon all load)
- No console errors (open browser dev tools)

- [ ] **Step 3: Fix any issues found, re-run `verify.sh`, and commit fixes**

If the manual check finds an issue, fix it, re-run `./verify.sh` to confirm nothing regressed, then commit:

```bash
git add -A
git commit -m "fix: address issues found in final site verification"
```

(Skip this step's commit if no issues were found.)

