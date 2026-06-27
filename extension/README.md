# ISC2 CPE Helper (Chrome extension)

A Chrome extension that turns listening to the **Security Now** and **Risky
Business** podcasts into ISC2 CISSP CPE submissions with as little friction as
possible — right next to the ISC2 CPE form where you actually do the submitting.

It:

1. Fetches recent episodes from each podcast's RSS feed.
2. Lets you pick an episode and set your playback speed.
3. Computes CPE credits — `floor(duration / speed / 60)` (same formula as the
   repo's Rust `sn-summarize` crate).
4. Drafts an ISC2-ready title, 2–3 sentence description, and CISSP domain(s)
   **on-device** using Chrome's built-in AI (Gemini Nano) — **no API key, no
   account, nothing leaves your machine**.
5. **Autofills** the ISC2 CPE form, with one-click **copy** buttons as a
   fallback.

If the on-device model isn't available, it falls back to drafting the entry from
the episode's own description plus keyword-based domain matching, so it always
produces something usable.

## Requirements

- **Chrome 138+** (the built-in Prompt API / `LanguageModel` for extensions).
- A machine capable of running Gemini Nano (roughly: ~22 GB free disk and a
  supported GPU). The model downloads once, on first use.

## Install (unpacked, for development)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder.

## Configure

Click the toolbar icon → the gear (⚙︎), or open the extension's options:

- **On-device AI** — shows availability; if the model is downloadable, a
  **Download model** button fetches Gemini Nano (one-time) with progress.
- **Default playback speed** — defaults to `1.25`.

There is no API key to enter.

## Use

1. Open the popup, choose a podcast and episode, confirm the playback speed.
2. Click **Generate CPE entry** (first run may download the model).
3. Either click **Autofill this ISC2 tab** (when the active tab is the ISC2 CPE
   form) or use the per-field **Copy** buttons.
4. Optionally **Mark submitted** so the episode shows a ✓ and you don't
   double-submit.

## Layout

```
extension/
  manifest.json          MV3 manifest (Chrome)
  popup.html/.js/.css     main UI: pick episode, generate, copy, autofill
  options.html/.js        settings: on-device AI status + default speed
  content/autofill.js     content script: heuristic form filler on isc2.org
  lib/cpe.js              credit math
  lib/feeds.js            RSS fetch + parse → episode objects
  lib/promptapi.js        Chrome Prompt API (Gemini Nano) client, JSON output
  lib/domains.js          CISSP domains + keyword matcher (enum + fallback)
  lib/storage.js          settings + submitted-episode log
  icons/                  toolbar/store icons (PNG, plus icon.svg source)
  test/mock-isc2-form.html  offline form for testing autofill
```

## Notes & limitations

- The exact ISC2 CPE portal markup is behind a login, so autofill matches fields
  by **meaning** (label / name / id / placeholder / aria-label, and `<select>`
  option text for the domain) rather than fixed selectors. If a field doesn't
  fill on the live form, the popup's per-field report shows which one missed;
  capture that field's HTML and the matcher in `content/autofill.js` can be
  tightened.
- Gemini Nano is a small on-device model — quality is good for short summaries
  but not on par with a frontier cloud model. The episode-description fallback
  covers machines where it can't run at all.
- The Prompt API is still stabilizing; the extension feature-detects and
  degrades gracefully rather than assuming availability.
- Feed URLs: `https://feeds.twit.tv/sn.xml` (Security Now) and
  `https://risky.biz/feeds/risky-business` (Risky Business).
