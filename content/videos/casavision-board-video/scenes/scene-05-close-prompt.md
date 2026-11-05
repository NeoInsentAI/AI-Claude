# Scene 05 — Close (55–60s)
## Logo Card and Closing Tagline

---

## Important: This Scene Is Built in Canva, Not Runway

Scene 5 is a **static logo card**, not a video generation. You will create it as a still image in Canva, then convert it to a 5-second video clip in CapCut. No Runway generation is needed for this scene.

---

## Step 1 — Build the Logo Card in Canva

### Canvas Setup

1. Go to [canva.com](https://canva.com) and sign in.
2. Click **Create a design** → **Custom size**.
3. Set dimensions to **1920 × 1080 px**.
4. Click **Create new design**.

---

### Background

- Set the background color to dark navy/charcoal.
- Recommended hex: **`#1a1a2e`** (deep navy) or **`#1c1c1c`** (near-black charcoal).
- To apply: click the background area → click the color swatch → enter the hex code.

---

### CasaVision Logo

1. Retrieve the CasaVision logo from their website:
   - Visit [casavision.com](https://casavision.com) in your browser.
   - Right-click on the logo → **Save image as** to download it.
   - If the right-click method does not work, open your browser's **DevTools** (F12 or Cmd+Option+I), go to the **Network** tab, reload the page, and filter by **Images** to locate and download the logo asset directly.
   - **Use the white or light version of the logo** if available — it will read clearly on the dark background.
2. In Canva, click **Uploads** in the left panel → **Upload files** → select the logo file.
3. Place the logo at the **horizontal and vertical center** of the canvas.
4. Resize as needed so the logo is prominent but not oversized (a width of roughly 400–600px is a good starting point).

---

### Tagline Text

1. Click **Text** in the left panel → **Add a text box**.
2. Type: `"Con Casavisión, sentite en casa."`
3. Apply the following formatting:
   - **Font:** Montserrat (or a similar clean sans-serif such as Lato, Nunito, or Open Sans if Montserrat is unavailable)
   - **Style:** Italic
   - **Size:** ~45px
   - **Color:** White (`#ffffff`)
4. Position the tagline **below the logo**, centered horizontally. Leave comfortable spacing between the logo and the tagline (roughly 30–50px gap).

---

### Export

1. Click **Share** (top-right) → **Download**.
2. File type: **PNG**.
3. Ensure **Transparent background** is NOT checked (you want the dark background preserved).
4. Save the file as:

```
overlays/scene-05-close.png
```

Save it inside the `overlays/` folder within the `scenes/` directory.

---

## Step 2 — Convert to Video in CapCut

1. Open **CapCut** and create a new project (1920×1080, 30fps).
2. Click **Import** → select `overlays/scene-05-close.png`.
3. Drag the image onto the timeline.
4. Set the clip duration to **5 seconds**.
5. Apply the following animations:

   **Logo fade-in:**
   - Select the logo element (or the full clip if treating as a composite).
   - Add a **0.5s Fade In** animation at the start of the clip.

   **Tagline text delay:**
   - If CapCut allows element-level animation (e.g., in the sticker/text layer workflow):
     - Add the tagline text as a separate text layer in CapCut.
     - Set the text layer to appear at **0.5s** into the clip (so it follows the logo fade).
     - Apply a **0.5s Fade In** to the text layer.
   - If you prefer to keep the PNG as a flat image without layered text in CapCut, build both the logo and tagline into the Canva export at full opacity, and apply a single Fade In to the entire 5-second clip.

6. Export the final clip as:

```
scene-05-close.mp4
```

---

## Assembly Note

This clip is the final shot of the video. In your master timeline (CapCut or DaVinci Resolve), place `scene-05-close.mp4` at the very end, after Scene 4. Apply a **0.5s dissolve or dip-to-black transition** from Scene 4 into this closing card for a polished finish.
