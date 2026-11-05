# CasaVision Annual Review 2025 — Video Assembly Guide

**Project:** CasaVision Executive Board Video  
**Target Duration:** 60 seconds  
**Output File:** `final/casavision-annual-review-2025.mp4`  
**Compatible Editors:** CapCut (Desktop) or DaVinci Resolve 18+

---

## 1. Prerequisites Checklist

Before opening your editing software, confirm every asset is present in the `output/casavision-board-video/` directory. Check off each item:

**Video Scenes**
- [ ] `scenes/scene-01-hook.mp4` — 8 seconds
- [ ] `scenes/scene-02-challenge.mp4` — 14 seconds
- [ ] `scenes/scene-03a-install.mp4` — 7 seconds
- [ ] `scenes/scene-03b-studio.mp4` — 7 seconds
- [ ] `scenes/scene-03c-corporate.mp4` — 6 seconds
- [ ] `scenes/scene-04-bg.mp4` — 13 seconds
- [ ] `scenes/scene-05-close.mp4` — 5 seconds

**Audio**
- [ ] `audio/narration-full.mp3` — full narration track
- [ ] `music/background-track.mp3` — background music bed

**Overlay Images (PNG)**
- [ ] `overlays/scene-02-title.png`
- [ ] `overlays/scene-03-text-01.png`
- [ ] `overlays/scene-03-text-02.png`
- [ ] `overlays/scene-03-text-03.png`
- [ ] `overlays/scene-04-card-01.png`
- [ ] `overlays/scene-04-card-02.png`
- [ ] `overlays/scene-04-card-03.png`
- [ ] `overlays/scene-04-card-04.png`
- [ ] `overlays/scene-05-close.png` *(source asset used to create scene-05-close.mp4)*

**Do not proceed until all assets are present.**

---

## 2. Project Setup

### CapCut (Desktop)
1. Open CapCut Desktop and click **New Project**.
2. Set resolution to **1920 x 1080** and frame rate to **25 fps**.
3. Click **Import** and select all assets from the `scenes/`, `audio/`, `music/`, and `overlays/` folders.
4. Confirm timeline length is set to at least 60 seconds before you begin placing clips.

### DaVinci Resolve
1. Open Resolve and create a **New Project** — name it `CasaVision-AnnualReview-2025`.
2. Go to **File > Project Settings**. Under **Master Settings**, set:
   - Timeline resolution: **1920 x 1080 HD**
   - Timeline frame rate: **25**
3. In the **Media Pool**, create bins: `Scenes`, `Audio`, `Overlays`.
4. Import all assets into their respective bins using **File > Import Media** (or drag-drop).
5. Switch to the **Edit** page to begin assembly.

---

## 3. Scene Assembly — Main Video Track

Place the following clips on **Video Track 1** in order. Use the timecodes below as your placement targets.

```
Timecode       Clip                        Duration
---------------------------------------------------------
00:00 – 00:08  scene-01-hook.mp4           8s
00:08 – 00:22  scene-02-challenge.mp4      14s
00:22 – 00:42  scene-03-action (assembled) 20s  ← see Step 4
00:42 – 00:55  scene-04-bg.mp4             13s
00:55 – 01:00  scene-05-close.mp4          5s
---------------------------------------------------------
Total:                                     60s
```

**Transitions between scenes:**
- Scene 1 → 2: 0.3s dissolve (cross-fade)
- Scene 2 → 3: 0.3s dissolve
- Scene 3 → 4: 0.3s dissolve
- **Scene 4 → 5: hard cut (no transition)**

> In CapCut: right-click the cut point between clips and select **Add Transition > Dissolve**, then set duration to 0.3s.  
> In DaVinci Resolve: on the Edit page, right-click the edit point and choose **Add Transition > Cross Dissolve**. Set duration to 8 frames (= 0.3s at 25fps).

---

## 4. Scene 3 Assembly — Sub-Step (Do This First)

Scene 3 is made from three separate vignettes. Assemble them before placing the full Scene 3 block on the main timeline.

1. On a **separate track** (or in a compound clip workspace), place the three clips in order:
   ```
   scene-03a-install.mp4   (7s)
   scene-03b-studio.mp4    (7s)
   scene-03c-corporate.mp4 (6s)
   ```
2. Add a **0.3s dissolve** at the cut between `03a` and `03b`.
3. Add a **0.3s dissolve** at the cut between `03b` and `03c`.
4. **Group or nest** the three clips into a single compound clip.
   - CapCut: select all three clips, right-click, **Merge/Compound Clip**.
   - DaVinci Resolve: select all three clips, right-click, **New Compound Clip**.
5. Rename the compound clip `scene-03-action` for clarity.
6. Place this 20s compound clip on Video Track 1 starting at **00:22**.

---

## 5. Audio Track 1 — Narration

1. Place `audio/narration-full.mp3` on **Audio Track 1**, starting at **00:00**.
2. Align the beginning of the audio to the first frame of `scene-01-hook.mp4`.
3. If the narration runs slightly long (up to ~62 seconds), trim only trailing silence from the end. **Never cut narration mid-sentence.**
4. Set volume to **0 dB** (full level — this is the dominant audio).

---

## 6. Audio Track 2 — Music Bed

1. Place `music/background-track.mp3` on **Audio Track 2**, starting at **00:00**.
2. Trim the music clip so it ends exactly when the video ends (at 01:00).
3. Set volume to **-18 dB**. The narration must always be clearly audible over the music.
4. **Fade-out:** Add a volume keyframe at **00:55** (full level) and another at **01:00** (silence/zero). This creates a 5-second fade that ends exactly with the video.

> In CapCut: select the music clip, go to Audio > Volume, and use the keyframe button to set fade points.  
> In DaVinci Resolve (Fairlight page or Edit page): right-click the clip end and choose **Add Fade to End**, then adjust the curve handles so the fade begins at 00:55.

---

## 7. Overlay Track — Opening Title (Scene 1)

This title appears over Scene 1 and is created as a **text element**, not an image file.

1. Add a **text/title layer** on Overlay Track 1.
2. Text content: `2025 Annual Review`
3. Style: white, **Montserrat SemiBold**, approximately 50px (adjust to roughly 1/12 of frame height).
4. Position: centered horizontally and vertically (or lower-center if it conflicts with scene content).
5. Placement on timeline:
   - Appears at **00:03** with a **0.5s fade-in**
   - Holds until **00:07**
   - **0.5s fade-out** ending at 00:07.5 (or trim to end at 00:08 before scene cut)

---

## 8. Overlay Track — Scene 2 Title

1. Place `overlays/scene-02-title.png` on the overlay track.
2. Start time: **00:10**
3. Duration: **10 seconds** (ends at 00:20)
4. Apply: **0.5s fade-in** at start, **0.5s fade-out** at end.
5. Scale/position: confirm the PNG fits the 1920x1080 frame without letterboxing. If it does not fill the frame, set scaling to **Fit** (do not crop or stretch unless the PNG was designed full-bleed).

---

## 9. Overlay Track — Scene 3 Text Cards

Place each PNG on the overlay track in sequence. Each should appear over the corresponding vignette in Scene 3.

| File | Start | Duration | Fade-in |
|---|---|---|---|
| `overlays/scene-03-text-01.png` | 00:22 | 7s | 0.3s |
| `overlays/scene-03-text-02.png` | 00:29 | 7s | 0.3s |
| `overlays/scene-03-text-03.png` | 00:36 | 6s | 0.3s |

- No fade-out is required on Scene 3 cards — they can cut off cleanly as the scene transitions.
- Align card timings with the vignette they describe (01 = installation footage, 02 = studio, 03 = corporate).

---

## 10. Overlay Track — Scene 4 Metric Cards

Place each metric card PNG in sequence during Scene 4 (00:42–00:55). Cards appear one by one, building the data display.

| File | Start | Duration | Fade-in |
|---|---|---|---|
| `overlays/scene-04-card-01.png` | 00:42 | 3s | 0.5s |
| `overlays/scene-04-card-02.png` | 00:45 | 3s | 0.5s |
| `overlays/scene-04-card-03.png` | 00:48 | 3s | 0.5s |
| `overlays/scene-04-card-04.png` | 00:51 | 4s | 0.5s |

- Cards accumulate on screen — do **not** remove earlier cards when a new one appears, unless the PNGs are designed as full-frame replacements. If they are layered/stacked, place each on a separate overlay sub-track.
- `scene-04-card-04.png` holds for 4 seconds, carrying the visual through to the hard cut at 00:55.

---

## 11. Final Review Checklist

Before exporting, play the complete video from beginning to end and verify every item below:

**Timing**
- [ ] Total duration is between **58 and 62 seconds**
- [ ] All 5 scenes appear in correct order (hook → challenge → action → metrics → close)

**Audio**
- [ ] Narration is clearly audible at all points — never drowned by music
- [ ] Music fades out smoothly in the final 5 seconds
- [ ] No audio pops, gaps, or clipping

**Visuals**
- [ ] All dissolve transitions are smooth and match 0.3s timing
- [ ] Scene 4 → Scene 5 is a clean hard cut (no transition)
- [ ] Metric cards in Scene 4 appear sequentially, not all at once

**Content Accuracy**
- [ ] All Spanish text is spelled correctly — review each overlay carefully
- [ ] Metric numbers shown on screen **exactly match** what the narrator says at that moment
- [ ] CasaVision logo is visible and sharp in Scene 5
- [ ] Opening title reads `2025 Annual Review` and is correctly styled

**Technical**
- [ ] No watermarks from AI generation tools visible in any frame
- [ ] No visual artifacts, compression blocks, or abrupt brightness changes
- [ ] No black frames between clips

---

## 12. Export Settings

Once the review checklist is fully passed, export using these settings:

```
Format:      MP4
Codec:       H.264
Resolution:  1920 x 1080
Frame rate:  25 fps
Bitrate:     10–15 Mbps (use 15 Mbps for maximum quality)
Audio:       AAC, 48 kHz, stereo
```

**In CapCut:** Go to **Export** (top right) → set resolution to 1080p, frame rate 25, quality High → Export.  
**In DaVinci Resolve:** Go to **Deliver** page → select **Custom Export** → apply the settings above → click **Add to Render Queue** → **Render All**.

Save the output file as:
```
output/casavision-board-video/final/casavision-annual-review-2025.mp4
```

---

*Assembly guide prepared for CasaVision Executive Board Video — June 2025*
