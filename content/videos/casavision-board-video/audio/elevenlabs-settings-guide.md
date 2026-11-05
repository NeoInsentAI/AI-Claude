# ElevenLabs Narration Generation Guide
## CasaVision Board Video — Spanish Narration

---

## Step 1: Navigate to ElevenLabs

1. Go to [https://elevenlabs.io](https://elevenlabs.io)
2. Log in to your account
3. In the left sidebar, click **Text to Speech**

---

## Step 2: Select a Voice

1. Click **Voice** dropdown at the top of the editor
2. To find a new voice, go to the **Voice Library** in the left sidebar. Browse or search for the voice you want, click **Add to My Voices**, then return to Text to Speech and select it from the **Voice** dropdown.
3. In the Voice Library search bar, type **"Valentina"** — if available, add and select it
4. If Valentina is not available, search **"Spanish"** and filter by:
   - Language: Spanish
   - Gender: Female (preferred) or Male (neutral)
   - Style: Professional, Conversational, or Narrative
5. Aim for a **neutral Latin American accent** — avoid Spain (Castilian) accents, which use a different "c/z" pronunciation that will sound out of place for a Nicaraguan audience
6. Preview the voice before proceeding to confirm it sounds professional and measured

---

## Step 3: Configure Voice Settings

Click the **Settings** or gear icon next to the voice selector and apply these exact values:

| Setting | Value |
|---|---|
| Stability | 55% |
| Similarity | 75% |
| Style | 30% |
| Speed | 0.92 |

> **Note:** the Style slider only appears for certain voices (v2 and v2.5 models). If you do not see it, the voice does not support this setting — proceed with Stability, Similarity, and Speed only.

- **Stability at 55%** keeps the voice consistent without sounding robotic
- **Similarity at 75%** preserves the selected voice's natural character
- **Style at 30%** adds light expressiveness without overdoing it
- **Speed at 0.92** slightly slows delivery — essential for a formal executive presentation tone

---

## Step 4: Paste the Script

1. Open the file `narration-script.txt` (located in this same folder)
2. Select all text and copy it (Cmd+A, Cmd+C on Mac / Ctrl+A, Ctrl+C on Windows)
3. Paste it into the ElevenLabs text editor (the large text box)
4. Do NOT add or remove any punctuation — the dashes (—) and paragraph breaks are intentional and help the AI model pause naturally

---

## Step 5: Quality Check Before Downloading

Click **Generate** and listen to the full preview. Check for the following:

**Pace**
- The delivery should feel measured and authoritative — like a documentary narrator, not a commercial
- No paragraph should sound rushed; each should land with weight

**Number Pronunciation (Critical)**
- 18 = "dieciocho" (not "un ocho")
- 680 = "seiscientos ochenta"
- 3,100 = "tres mil cien"
- 52,000 = "cincuenta y dos mil" (NOT "cincuenta y dos coma cero cero")
- 210,000 = "doscientos diez mil"
- 31% = "treinta y uno por ciento"
- 99.8% = "noventa y nueve punto ocho por ciento"
- 81 = "ochenta y uno"

If any number is mispronounced, rewrite it phonetically in the script (e.g., replace "52,000" with "cincuenta y dos mil") and regenerate.

**Pauses**
- There should be a natural pause between each paragraph
- The closing line — "Casavisión. 100% Nicaragüense." — should have a noticeable beat before and after, as if it is a title card moment

**Tone**
- Professional and proud, not somber or stiff
- Slight warmth is acceptable; avoid anything that sounds sales-y or overly energetic

---

## Step 6: Download the Audio

1. Once the preview passes quality check, click **Download** — the file saves as MP3 automatically. (To change audio quality, go to your Profile > Settings before generating.)
2. Save the file as:

```
narration-full.mp3
```

3. Save it to this same folder:

```
/output/casavision-board-video/audio/narration-full.mp3
```

---

## Expected Duration

The narration should run between **55 and 65 seconds** at Speed 0.92.

- If it runs shorter than 55 seconds, reduce Speed to 0.88 and regenerate
- If it runs longer than 65 seconds, increase Speed to 0.95 and regenerate
- Target the sweet spot around 60 seconds for a clean 60-second video cut

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Numbers sound wrong | Write them out phonetically in Spanish in the script |
| Accent sounds like Spain | Choose a different voice; search "Mexico" or "Colombia" for Latin American options |
| Pace too fast | Lower Speed to 0.88 |
| Sounds robotic | Increase Style to 40%, lower Stability to 45% |
| Voice sounds unstable/variable | Increase Stability to 65% |
