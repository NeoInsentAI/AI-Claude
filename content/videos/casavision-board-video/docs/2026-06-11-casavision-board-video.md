# CasaVision 2025 Board Video — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a 60-second AI-generated executive board video for CasaVision's 2025 Annual Review using the approved production brief.

**Architecture:** Five scenes are generated independently as video clips, narration is produced as a single audio track, then all assets are assembled with on-screen text overlays and a music bed into a final 1080p MP4.

**Spec:** `docs/superpowers/specs/2026-06-11-casavision-board-video-design.md`

**Tech Stack:** Runway Gen-3 Alpha (video scenes) · ElevenLabs (narration voice) · CapCut or DaVinci Resolve (assembly + text overlays) · Pixabay / Epidemic Sound (royalty-free music)

---

## File Structure

```
output/
  casavision-board-video/
    scenes/
      scene-01-hook.mp4            # 8s drone/logo clip
      scene-02-challenge.mp4       # 14s split-screen clip
      scene-03-action.mp4          # 20s vignette clip
      scene-04-results.mp4         # 13s metric cards clip
      scene-05-close.mp4           # 5s logo close clip
    audio/
      narration-full.mp3           # complete voice track
    music/
      background-track.mp3        # royalty-free music bed
    overlays/
      scene-03-text-cycle.png      # on-screen text cards for Scene 3
      scene-04-metric-cards.png    # metric card graphics for Scene 4
    final/
      casavision-annual-review-2025.mp4
```

---

## Task 1: Generate Narration Audio

**Tool:** ElevenLabs (elevenlabs.io) — use "Rachel" or any neutral Latin American Spanish voice  
**Files:**
- Create: `output/casavision-board-video/audio/narration-full.mp3`

- [ ] **Step 1: Open ElevenLabs and select voice**

Go to elevenlabs.io → Speech Synthesis → select a Spanish voice (search "Spanish" or "Latino" in voice library). Recommended: "Valentina" or any neutral female/male Spanish voice.

- [ ] **Step 2: Paste the full narration script**

Paste this exact text into the text field:

```
En 2025, el panorama de conectividad de Nicaragua cambió — y Casavisión estuvo en el centro de ese cambio.

La demanda de fibra de alta velocidad alcanzó niveles récord. Los clientes exigían más: velocidades más rápidas, instalaciones más ágiles, y una empresa que realmente los conociera. La presión era real.

Nos expandimos a 18 nuevos barrios en Managua y Ciudad Sandino. Crecimos hasta 680 empleados directos — sin subcontrataciones, sin atajos. Consolidamos nuestra cartera corporativa con más de 3,100 cuentas empresariales. Y mantuvimos Canal Casa 36 como el canal de la comunidad — llegando a 210,000 televidentes cada semana.

Los resultados hablan por sí solos. Más de 52,000 suscriptores activos. Ingresos con un crecimiento del 31%. Disponibilidad de red del 99.8%. Y un NPS de 81 — uno de los más altos en nuestra historia.

Casavisión. 100% Nicaragüense.
```

- [ ] **Step 3: Set voice settings**

Stability: 55% | Similarity: 75% | Style: 30% | Speed: 0.92 (slightly slower for executive tone)

- [ ] **Step 4: Generate and review**

Click Generate. Listen to full playback. Check:
- Pace feels measured, not rushed
- Numbers pronounced correctly (52,000 = "cincuenta y dos mil")
- Pauses between paragraphs feel natural

If unsatisfied, adjust Stability up (more consistent) or Style up (more expressive) and regenerate.

- [ ] **Step 5: Download and save**

Download as MP3 → save to `output/casavision-board-video/audio/narration-full.mp3`

Verify file is between 55–68 seconds long (use QuickTime or any player to check duration).

---

## Task 2: Source Background Music

**Files:**
- Create: `output/casavision-board-video/music/background-track.mp3`

- [ ] **Step 1: Find a royalty-free corporate/cinematic track**

Go to [Pixabay Music](https://pixabay.com/music/) and search: `corporate cinematic inspire`

Criteria:
- Duration: 60–120 seconds (will trim to fit)
- Style: starts quietly, builds to a swell, can fade out
- No lyrics
- License: Pixabay free license (safe for board presentations)

Recommended search terms if first result doesn't work: `motivational corporate`, `epic corporate`, `inspiring business`

- [ ] **Step 2: Download and save**

Download the chosen track as MP3 → save to `output/casavision-board-video/music/background-track.mp3`

---

## Task 3: Generate Scene 1 — Hook (0–8s)

**Tool:** Runway Gen-3 Alpha (runwayml.com) or Sora  
**Files:**
- Create: `output/casavision-board-video/scenes/scene-01-hook.mp4`

- [ ] **Step 1: Open Runway Gen-3 and create a new generation**

Go to runwayml.com → Gen-3 Alpha → Text to Video

- [ ] **Step 2: Enter the scene prompt**

```
Cinematic aerial drone shot slowly pulling back over Managua, Nicaragua at dusk. City lights begin to turn on across the urban landscape. Warm golden-hour light fading to deep blue. High altitude, wide establishing shot. Smooth camera movement. Photorealistic, 4K quality. No people in frame. Corporate documentary style.
```

Settings: Duration 8s | Aspect ratio 16:9 | Motion: Slow

- [ ] **Step 3: Generate and review**

Generate 2–3 variations. Select the one that best matches:
- Slow, smooth pull-back motion
- Warm-to-blue dusk lighting
- No jarring cuts or artifacts

- [ ] **Step 4: Download**

Download as MP4 → save to `output/casavision-board-video/scenes/scene-01-hook.mp4`

---

## Task 4: Generate Scene 2 — Challenge (8–22s)

**Files:**
- Create: `output/casavision-board-video/scenes/scene-02-challenge.mp4`

- [ ] **Step 1: Enter Runway Gen-3 prompt**

```
Split-screen video. Left side: blurred, abstract urban telecom imagery, soft focus competitor billboard, indistinct. Right side: two telecom technicians in uniforms laying fiber optic cable in a residential neighborhood street, daytime, natural light, focused and professional. Clean visual divide down the center. Corporate documentary style. 16:9. Smooth motion.
```

Settings: Duration 14s | Aspect ratio 16:9

- [ ] **Step 2: Generate and review**

Generate 2–3 variations. Verify:
- Split-screen composition is clear
- Right side (CasaVision workers) is vivid vs. left side being muted
- No unnatural distortions

- [ ] **Step 3: Download**

Save to `output/casavision-board-video/scenes/scene-02-challenge.mp4`

- [ ] **Step 4: Create Scene 2 text overlay**

In Canva, create a 1920×1080px PNG, transparent background:
```
Text: "Un Mercado en Crecimiento. Expectativas Más Altas."
Font: Montserrat SemiBold, white, ~55px
Position: Lower-center, above the bottom 20% of frame
Style: White text, subtle dark drop shadow
```
Export as `output/casavision-board-video/overlays/scene-02-title.png`

---

## Task 5: Generate Scene 3 — Action (22–42s)

**Files:**
- Create: `output/casavision-board-video/scenes/scene-03-action.mp4`

This scene requires three vignettes cut together (~6–7s each). Generate each separately then assemble.

- [ ] **Step 1: Generate vignette A — fiber installation**

Runway Gen-3 prompt:
```
A telecom technician in uniform installs fiber optic cable inside a bright modern home. A happy Nicaraguan family — mother, father, young child — stands in the background smiling. Warm indoor lighting. Cinematic, shallow depth of field. Corporate documentary style.
```
Duration: 7s | Save as `scene-03a-install.mp4`

- [ ] **Step 2: Generate vignette B — Canal Casa 36 studio**

```
A professional TV news broadcast studio. A confident female presenter sits at a modern anchor desk, speaking to camera. Studio lighting, screens in background showing local news content. Clean, modern set. Latin American broadcast aesthetic. Medium shot.
```
Duration: 7s | Save as `scene-03b-studio.mp4`

- [ ] **Step 3: Generate vignette C — corporate handshake**

```
Two business professionals shaking hands across a desk in a modern office. One holds a folder with documents. Clean, bright corporate environment. Professional attire. Close-up on the handshake, then pull back to mid-shot. Cinematic.
```
Duration: 6s | Save as `scene-03c-corporate.mp4`

- [ ] **Step 4: Concatenate the three clips**

Open CapCut or DaVinci Resolve. Place clips in order: 03a → 03b → 03c. Add a fast 0.3s dissolve transition between each. Export as `scene-03-action.mp4` (total ~20s).

---

## Task 6: Create On-Screen Text Overlays for Scene 3

**Files:**
- Create: `output/casavision-board-video/overlays/scene-03-text-cycle.png` (3 cards)

These are text overlays to appear during Scene 3's three vignettes.

- [ ] **Step 1: Create text cards in Canva or Figma**

Create 3 separate PNG images, 1920×1080px, transparent background:

**Card 1** (appears at 22s):
```
Font: Bold sans-serif (e.g. Montserrat Bold), white text
Text: "18 Nuevos Barrios"
Position: Lower-left third, large (~80px)
Style: White text with subtle dark drop shadow
```

**Card 2** (appears at 29s):
```
Text: "680 Empleados Directos"
Same style and position
```

**Card 3** (appears at 36s):
```
Text: "3,100 Cuentas Corporativas"
Same style and position
```

Export each as PNG with transparent background.

- [ ] **Step 2: Save files**

Save as:
- `overlays/scene-03-text-01.png`
- `overlays/scene-03-text-02.png`
- `overlays/scene-03-text-03.png`

---

## Task 7: Generate Scene 4 — Results (42–55s)

**Files:**
- Create: `output/casavision-board-video/scenes/scene-04-results.mp4`
- Create: `output/casavision-board-video/overlays/scene-04-metric-cards.png`

- [ ] **Step 1: Generate dark background motion video**

Runway Gen-3 prompt:
```
Abstract dark blue and black background with subtle animated light particles and thin glowing lines slowly moving. Elegant, corporate, premium tech aesthetic. No text, no faces, no objects. Pure atmospheric background motion. 16:9.
```
Duration: 13s | Save as `scene-04-bg.mp4`

- [ ] **Step 2: Create the four metric cards in Canva**

Create 4 PNG overlays (1920×1080, transparent background), one per metric:

```
Card 1 — appears at 42s:
Large number: "52,800"  (white, Montserrat ExtraBold, ~120px)
Label below: "Suscriptores Activos"  (white, regular, ~40px)
Position: Center frame

Card 2 — appears at 45s:
Large number: "+31%"
Label: "Crecimiento en Ingresos"

Card 3 — appears at 48s:
Large number: "99.8%"
Label: "Disponibilidad de Red"

Card 4 — appears at 51s:
Large number: "NPS 81"
Label: "Satisfacción del Cliente"
```

Export each as PNG. Save as `overlays/scene-04-card-01.png` through `scene-04-card-04.png`.

- [ ] **Step 3: Assemble in CapCut/DaVinci**

Layer the 4 metric card PNGs over the dark background video, each appearing for ~3s with a 0.5s fade-in. Export as `scene-04-results.mp4`.

---

## Task 8: Generate Scene 5 — Close (55–60s)

**Files:**
- Create: `output/casavision-board-video/scenes/scene-05-close.mp4`

- [ ] **Step 1: Source CasaVision logo**

Go to casavision.com → right-click logo → Save image, OR use browser DevTools to find the logo asset URL. Save as `output/casavision-board-video/overlays/logo.png`.

- [ ] **Step 2: Create closing slide in Canva**

1920×1080px, dark navy/charcoal background (#1a1a2e or similar).
- Center: CasaVision logo (white version or original)
- Below logo: `"Con Casavisión, sentite en casa."` (white, italic, ~45px)
- Export as `overlays/scene-05-close.png`

- [ ] **Step 3: Convert to 5-second video**

In CapCut: Import PNG → set duration to 5s → add 0.5s fade-in for the logo → add 0.5s fade-in for the tagline text (0.5s after logo). Export as `scene-05-close.mp4`.

---

## Task 9: Final Assembly

**Files:**
- Create: `output/casavision-board-video/final/casavision-annual-review-2025.mp4`

- [ ] **Step 1: Import all assets into CapCut or DaVinci Resolve**

Create a new project: 1920×1080, 25fps, 60s timeline.

Import:
- All 5 scene videos
- `narration-full.mp3`
- `background-track.mp3`
- All overlay PNGs

- [ ] **Step 2: Place scenes on timeline in order**

```
00:00 – 00:08  →  scene-01-hook.mp4
00:08 – 00:22  →  scene-02-challenge.mp4
00:22 – 00:42  →  scene-03-action.mp4
00:42 – 00:55  →  scene-04-results.mp4
00:55 – 01:00  →  scene-05-close.mp4
```

Add 0.3s dissolve transitions between scenes (except Scene 4→5, use hard cut for impact).

- [ ] **Step 3: Place narration audio**

Drop `narration-full.mp3` on audio track 1, starting at 00:00. Adjust timing so narration phrase endings align with scene transitions (trim silence between paragraphs if needed with a DAW or CapCut's audio trim).

- [ ] **Step 4: Place music bed**

Drop `background-track.mp3` on audio track 2, starting at 00:00. Set volume to **-18dB** (background level, narration stays dominant).

Music fade-out: Start fade at 00:55 (Scene 5 close), fade to silence by 01:00.

- [ ] **Step 5: Add Scene 2 title overlay**

On overlay track, place `scene-02-title.png` at 00:10, duration 10s, 0.5s fade-in, 0.5s fade-out.

- [ ] **Step 6: Add Scene 3 text overlays**

On overlay track, place:
- `scene-03-text-01.png` at 00:22, duration 7s, 0.3s fade-in
- `scene-03-text-02.png` at 00:29, duration 7s, 0.3s fade-in
- `scene-03-text-03.png` at 00:36, duration 6s, 0.3s fade-in

- [ ] **Step 7: Add Scene 4 metric cards**

On overlay track, place:
- `scene-04-card-01.png` at 00:42, duration 3s, 0.5s fade-in
- `scene-04-card-02.png` at 00:45, duration 3s, 0.5s fade-in
- `scene-04-card-03.png` at 00:48, duration 3s, 0.5s fade-in
- `scene-04-card-04.png` at 00:51, duration 4s, 0.5s fade-in

- [ ] **Step 8: Add opening title overlay**

Place a text overlay `"2025 Annual Review"` over Scene 1:
- White, Montserrat SemiBold, ~50px, centered
- Appears at 00:03, fades in 0.5s, holds until 00:07, fades out 0.5s

- [ ] **Step 9: Final review playback**

Watch full video from start to finish. Check:
- [ ] Narration is clearly audible over music at all points
- [ ] On-screen text appears in sync with narration mentions
- [ ] Scene transitions feel smooth
- [ ] Total duration is 58–62 seconds
- [ ] No visual artifacts or abrupt cuts

- [ ] **Step 10: Export final video**

Export settings:
```
Format: MP4 (H.264)
Resolution: 1920×1080
Frame rate: 25fps
Bitrate: 10–15 Mbps (high quality)
Audio: AAC, 48kHz, stereo
```

Save to `output/casavision-board-video/final/casavision-annual-review-2025.mp4`

---

## Review Checklist (run before delivery)

- [ ] Video total runtime: 58–62 seconds
- [ ] All 5 scenes present and in correct order
- [ ] Narration clearly audible throughout
- [ ] All Spanish text spelled correctly
- [ ] Metric numbers on screen match narration
- [ ] Logo visible and clear in Scene 5
- [ ] No watermarks from generation tools (upgrade to paid tier if needed)
- [ ] File exported at 1080p minimum
