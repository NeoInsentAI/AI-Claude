# LeanWMS Insights — Landing Page Design Spec
**Date:** 2026-06-26
**Output:** Single self-contained `index.html` (no build tools, no framework)
**Goal:** Generate demo requests from operations directors, warehouse managers, 3PL leaders, supply chain leaders, and ecommerce fulfillment operators.

---

## Product Summary

LeanWMS Insights is a warehouse intelligence platform that connects to any WMS and related operational systems, evaluates lean performance by location, and provides AI-powered recommendations for improvement. It includes a Smart AI Agent for natural-language Q&A, root cause analysis, and what-if scenario simulation.

**Core value prop:** Your WMS records what happened. LeanWMS Insights tells you why it happened, what to improve, and what is likely to happen next.

---

## Technical Constraints

- Single `index.html` — all CSS and JS inline, no external build step
- External dependencies allowed via CDN: Google Fonts (Inter), no JS frameworks
- Must work on any static host (GitHub Pages, Netlify, Vercel, S3)
- Responsive: mobile-first breakpoints at 640px, 768px, 1024px, 1280px
- Dark mode toggle (JS class toggle on `<html>`) — dark is default

---

## Visual Language

### Typography
- Font family: `Inter` via Google Fonts (`weights: 400, 500, 600, 700`)
- Hero H1: `72px` desktop / `40px` mobile, weight `700`, line-height `1.05`
- Section headlines: `48px` desktop / `32px` mobile, weight `600`, line-height `1.1`
- Subheadlines: `20px`, weight `400`, line-height `1.6`, muted color
- Body: `18px`, weight `400`, line-height `1.75`
- Eyebrow labels: `12px`, uppercase, `0.12em` letter-spacing, teal color
- CTA buttons: `16px`, weight `600`

### Color Palette
```
--bg-dark:        #09090b   /* near-black, dark section backgrounds */
--surface-dark:   #18181b   /* card/panel backgrounds on dark */
--border-dark:    rgba(255,255,255,0.08)
--bg-light:       #f9fafb   /* light section backgrounds */
--surface-light:  #ffffff
--border-light:   #e5e7eb

--teal:           #14b8a6   /* primary accent */
--teal-hover:     #0d9488
--teal-dim:       rgba(20,184,166,0.12)  /* glow/bg tint */

--text-white:     #ffffff
--text-light:     #f4f4f5   /* slightly warm white for body on dark */
--text-muted-dark: #a1a1aa  /* secondary text on dark */
--text-dark:      #111827   /* primary text on light */
--text-muted-light: #6b7280

--green:          #22c55e   /* good/positive indicators */
--yellow:         #eab308   /* warning indicators */
--red:            #ef4444   /* critical indicators */
```

### Motion
- Scroll reveal: `opacity: 0 → 1`, `translateY: 24px → 0`, `duration: 0.6s`, `ease: cubic-bezier(0.16,1,0.3,1)`
- Stagger delay between sibling cards: `0.08s` increments
- Nav blur: `backdrop-filter: blur(16px)` + `background: rgba(9,9,11,0.85)` after `60px` scroll
- No parallax, no rotation animations, no bouncing
- Hover on cards: `transform: translateY(-2px)`, `box-shadow` lift — `0.2s ease`
- CTA button hover: teal darken + slight scale `1.02`

---

## Section Map

| # | Section | Background | Key Content |
|---|---------|-----------|-------------|
| 0 | Navigation | Dark sticky | Logo, links, "Book a Demo" CTA |
| 1 | Hero | Dark `#09090b` | H1, subheadline, 2 CTAs, composite product mockup |
| 2 | Problem | Dark | 3 pain point cards with icons |
| 3 | How It Works | Light `#f9fafb` | 5-step numbered flow with descriptions |
| 4 | Core Features | Light | 2×4 grid of 8 feature cards |
| 5 | Smart AI Agent | Dark | Chat mockup + 4 example Q&As |
| 6 | Lean Evaluation | Light | Explanation + warehouse scorecard table mockup |
| 7 | Scenario Simulation | Dark | Simulation panel mockup with inputs + projected outputs |
| 8 | Integrations | Light | Icon row + connectivity messaging |
| 9 | Use Cases | Light | 4 use case cards |
| 10 | Results | Dark | 5 outcome statements in large type |
| 11 | Final CTA | Dark | Large headline + "Book a Demo" button |
| 12 | Footer | Dark | 5-column link grid |

---

## Section Specifications

### 0 — Navigation
- **Layout:** `position: sticky; top: 0; z-index: 100`
- **Default state:** fully transparent over dark hero
- **Scrolled state:** `backdrop-filter: blur(16px)`, `background: rgba(9,9,11,0.85)`, `border-bottom: 1px solid rgba(255,255,255,0.08)`
- **Logo:** `LeanWMS` white bold + `Insights` teal, separated by thin space
- **Links (desktop):** Product · Integrations · Use Cases · Company
- **CTA:** "Book a Demo" — teal filled button, `border-radius: 6px`, right side
- **Mobile:** hamburger icon → slide-down menu with same links stacked + CTA

### 1 — Hero
- **Background:** `#09090b` full-bleed
- **Eyebrow:** `WAREHOUSE INTELLIGENCE PLATFORM` in teal, uppercase
- **H1:** "See what is happening in every warehouse — and ask what to do next."
  - Split across 2–3 lines, tight tracking, white
- **Subheadline:** "Connect to any WMS, evaluate lean performance by location, and use a Smart AI Agent to answer questions, explain issues, and simulate operational changes in real time."
  - `#a1a1aa`, `20px`, max-width `640px`
- **CTAs:** "Book a Demo" (teal fill) + "See Sample Dashboard" (ghost, white border) side by side
- **Product Composite Mockup** (HTML/CSS panels on dark bg with subtle glow shadow):
  - **Left panel** (KPI Scorecard card):
    - 4 metrics in 2×2 grid:
      - Units Picked/hr: `142` ↑ `+8%` (teal delta)
      - Rework Rate: `3.4%` ↓ `-1.2%` (green delta)
      - Avg Travel Distance: `187m` ↑ `+12m` (red delta)
      - Slot Utilization: `68%` → `0%` (yellow delta)
    - Sparkline bars under each metric (SVG, 8 bars, teal)
  - **Right panel** (AI Agent Chat):
    - User message: "Why did picking productivity drop today?"
    - Agent response: "Picking productivity at Chicago DC dropped 14% between 6am–10am. Primary cause: 3 of 8 pickers were assigned to receiving overflow, reducing active pick labor by 37%. Secondary factor: 4 high-velocity SKUs in zone B were out of replenishment for 82 minutes."
    - Teal send button, dark input field
  - **Bottom-left badge** (Lean Health Score):
    - Location: "Chicago DC"
    - Score: `74 / 100`
    - Status pill: "Needs Attention" (yellow)
    - Mini bar showing score position

### 2 — Problem
- **Background:** `#09090b`
- **Section headline:** "Your WMS tells you what happened. That is not enough."
- **3 pain point cards** in a row (dark surface `#18181b`, subtle border):
  1. **Icon: bar chart with X** — "Data without intelligence" — "You have reports. You have dashboards. But when something goes wrong, your team still spends hours in spreadsheets trying to understand why."
  2. **Icon: clock** — "Decisions come too late" — "By the time a report surfaces a problem, the shift has already been impacted. Reactive operations cost more and underperform consistently."
  3. **Icon: question mark / maze** — "No clear path to improvement" — "Knowing a KPI dropped is not the same as knowing what to fix, in which location, in what order, with what expected result."

### 3 — How It Works
- **Background:** `#f9fafb`
- **Section headline:** "From raw WMS data to operational clarity in five steps."
- **5 steps**, numbered `01`–`05`, left-to-right on desktop, stacked on mobile:
  1. **Connect** — "Integrate your WMS, ERP, TMS, and operational data sources. Modern API, flat file, or legacy — we handle it."
  2. **Normalize** — "All warehouse data is standardized, cleaned, and mapped to a unified operational model."
  3. **Score** — "Each site is evaluated across lean process dimensions: waste, flow, utilization, bottlenecks, and exception patterns."
  4. **Ask** — "Use the Smart AI Agent to ask questions in plain language. Get answers grounded in your live operational data."
  5. **Simulate** — "Test what-if scenarios before making changes on the floor. See projected impact, then decide."
- Numbers `01–05` in large teal, `64px`, behind the step title

### 4 — Core Features
- **Background:** `#f9fafb`
- **Section headline:** "Everything operations leaders need. Nothing they don't."
- **8 feature cards** in a `2×4` grid (desktop), `2×4` (tablet), `1×8` (mobile):
  1. Universal WMS Integrations — "Connect to any modern or legacy WMS without custom development."
  2. Multi-Location KPI Scorecards — "Track performance across every site with consistent, comparable metrics."
  3. Lean Health Score — "A composite score per location measuring process efficiency across seven lean dimensions."
  4. AI Root Cause Analysis — "When a KPI moves, the platform explains why — automatically, with evidence."
  5. Smart AI Agent — "Ask operational questions in natural language. Get answers from your live data."
  6. What-If Scenario Simulation — "Model staffing, slotting, volume, and process changes before executing them."
  7. Recommended Actions — "Prioritized improvement actions with expected impact, per site."
  8. Executive Reporting — "Site-level and portfolio-level reports for operations directors and C-suite."
- Each card: white bg, `border-radius: 12px`, subtle shadow, teal icon (SVG), title, 1-line description

### 5 — Smart AI Agent
- **Background:** `#09090b`
- **Eyebrow:** `SMART AI AGENT`
- **Section headline:** "An operations copilot that knows your warehouse."
- **Body copy:** "The Smart AI Agent doesn't just search your data — it understands your operations. Ask about today's performance, investigate a problem, or test a scenario. Every answer is grounded in your live KPIs, lean process context, and historical patterns."
- **Full-width chat mockup panel** (dark surface, rounded, subtle border):
  - 2 visible exchanges:
    - Q: "Which warehouse has the highest rework rate this week?"
    - A: "Dallas TX has the highest rework rate at 5.8%, compared to a network average of 2.9%. The primary driver is inbound mislabeling from Supplier 04, which accounts for 61% of rework events at that site over the last 7 days."
    - Q: "If we move fast movers closer to packing, what happens?"
    - A: "Based on current slotting data and pick path analysis, repositioning the top 80 SKUs by velocity to zones A1–A4 would reduce average travel distance by an estimated 23% and increase picks-per-hour by 11–14%. Estimated implementation time: 1 shift."
  - **4 example question chips** below the chat:
    - "Why did picking productivity drop today?"
    - "What is the risk if order volume increases 15% tomorrow?"
    - "Which warehouse has the highest rework rate?"
    - "If we move fast movers closer to packing, what happens?"

### 6 — Lean Evaluation
- **Background:** `#f9fafb`
- **Eyebrow:** `LEAN PROCESS INTELLIGENCE`
- **Section headline:** "Score every warehouse against lean principles — automatically."
- **Body copy:** "LeanWMS Insights evaluates each location across seven lean dimensions: waiting time, rework and defects, travel waste, unstable flow, low slot utilization, bottleneck concentration, and exception clustering. Each site receives a Lean Health Score updated continuously from your operational data."
- **Scorecard table mockup** (white card, `border-radius: 12px`, shadow):
  - Header row: Location · Lean Score · Pick Efficiency · Rework Rate · Wait Time · Bottleneck
  - 5 data rows:
    | Location | Lean Score | Pick Eff | Rework | Wait | Bottleneck |
    |---|---|---|---|---|---|
    | Chicago DC | 74 / 100 | 88% | 3.4% | 4.2 min | Zone C |
    | Dallas TX | 61 / 100 | 79% | 5.8% | 7.1 min | Inbound |
    | Atlanta GA | 89 / 100 | 94% | 1.1% | 2.0 min | None |
    | Phoenix AZ | 70 / 100 | 83% | 4.0% | 5.5 min | Packing |
    | Seattle WA | 66 / 100 | 81% | 3.9% | 6.3 min | Receiving |
  - Score column: color-coded pills (≥85 green, 65–84 yellow, <65 red)

### 7 — Scenario Simulation
- **Background:** `#09090b`
- **Eyebrow:** `SCENARIO SIMULATION`
- **Section headline:** "Test operational changes before you make them."
- **Body copy:** "Model staffing levels, slotting configurations, process policy changes, and volume scenarios. See the projected impact on throughput, labor cost, and lean score before a single change is made on the floor."
- **Simulation panel mockup** (two-column card, dark surface):
  - **Left column — Inputs:**
    - Label: "Scenario: Slotting Optimization"
    - Picker location dropdown: "Zone B → Zone A1"
    - Staffing level slider: `24 pickers` (range 18–32)
    - Incoming volume: `4,200 orders` input field
    - Process policy: "FIFO" dropdown
    - "Run Simulation" teal button
  - **Right column — Projected Output:**
    - Label: "Projected Impact"
    - Throughput change: `+12%` (large, teal)
    - Rework reduction: `-18%` (green)
    - Labor cost delta: `-$1,240/shift` (green)
    - Lean Score change: `+7 pts` (teal)
    - Note: "Estimates based on 90-day operational history at Chicago DC"

### 8 — Integrations
- **Background:** `#f9fafb`
- **Section headline:** "Works with the systems you already run."
- **Body:** "LeanWMS Insights connects to modern WMS APIs, flat file exports, ERP systems, TMS platforms, spreadsheets, and legacy warehouse setups. No rip-and-replace. No long implementation timelines."
- **Integration category pills** (rounded tags in a centered wrapping row):
  WMS APIs · ERP Systems · TMS Platforms · Flat File / CSV · SFTP Feeds · Spreadsheets · Legacy Systems · Custom Connectors
- **Footnote:** "Don't see your system? Talk to us — we've connected to over 40 warehouse platforms."

### 9 — Use Cases
- **Background:** `#f9fafb`
- **Section headline:** "Built for how warehouse operations actually work."
- **4 cards** in a `2×2` grid:
  1. **3PL Operations** — "Give your customers real-time performance visibility while your ops team focuses on lean improvement and cost reduction across every client site."
  2. **Ecommerce Fulfillment** — "Handle volume variability with confidence. Know where your bottlenecks are before peak hits, and simulate what changes will protect your SLAs."
  3. **Manufacturing Warehouses** — "Align inbound, storage, and outbound operations with production schedules. Reduce wait time and rework that slow the line."
  4. **Multi-Site Warehouse Groups** — "Compare performance consistently across every location. Identify which sites lead, which lag, and where to focus improvement resources."

### 10 — Results
- **Background:** `#09090b`
- **Section headline:** "What operations teams achieve with LeanWMS Insights."
- **5 outcome statements** in large type, each with a teal icon and bold lead phrase:
  1. **Faster decisions** — Operational issues surface and are explained automatically. No more manual root cause sessions.
  2. **Less waste and rework** — Lean scoring identifies inefficiencies before they become patterns.
  3. **Better labor productivity** — Know where pick labor is underutilized or misallocated, shift by shift.
  4. **Consistent processes** — Standardize lean practices across sites with continuous scoring and recommended actions.
  5. **Full portfolio visibility** — See every warehouse, every KPI, every day — in one place.

### 11 — Final CTA
- **Background:** `#09090b`
- **Eyebrow:** `GET STARTED`
- **Headline:** "Ready to understand what is really happening in your warehouses?"
- **Subheadline:** "Connect your WMS, score your sites, and have your first conversation with the Smart AI Agent in days — not months."
- **Primary CTA:** "Book a Demo" — large teal button, `padding: 16px 40px`, `font-size: 18px`
- **Secondary line:** "No commitment. We'll walk you through a live scenario with your data."

### 12 — Footer
- **Background:** `#09090b`, top border `rgba(255,255,255,0.08)`
- **Logo** top-left with tagline: "Warehouse intelligence for operations leaders."
- **5 columns:**
  - Product: Features · Integrations · Lean Scoring · AI Agent · Simulation
  - Use Cases: 3PL · Ecommerce · Manufacturing · Multi-Site
  - Company: About · Careers · Blog · Contact
  - Legal: Privacy Policy · Terms of Service
  - CTA column: "Book a Demo" button + email field teaser
- **Bottom bar:** © 2026 LeanWMS Insights · Privacy · Terms

---

## Product Mockup Implementation Notes

All mockups are built with HTML + CSS only — no images, no SVGs from external sources. Use:
- `border-radius`, `box-shadow`, `backdrop-filter` for glass/card effects
- CSS Grid and Flexbox for layout
- Inline SVG for simple icons (teal stroke, 24×24)
- Teal `background: linear-gradient(135deg, #14b8a6, #0d9488)` for accent elements
- Subtle glow behind hero panels: `box-shadow: 0 0 80px rgba(20,184,166,0.12)`

---

## Responsive Breakpoints

| Breakpoint | Behavior |
|---|---|
| `< 640px` | Single column, hero text 40px, nav hamburger |
| `640px–1023px` | 2-col grids, hero text 52px |
| `≥ 1024px` | Full desktop layout |

---

## Accessibility

- All text on dark backgrounds: contrast ratio ≥ 4.5:1
- Focus states: `outline: 2px solid #14b8a6; outline-offset: 2px`
- `aria-label` on icon-only buttons
- `prefers-reduced-motion` media query disables scroll animations
- Semantic HTML: `<nav>`, `<main>`, `<section>`, `<footer>`, heading hierarchy

---

## Dark Mode Toggle

- Default: dark mode
- Toggle button in nav (sun/moon icon)
- JS adds/removes `.light-mode` class on `<html>`
- Light mode overrides: dark sections → `#f9fafb`, dark text → `#111827`, surface cards → `#ffffff`
- State persisted in `localStorage`
