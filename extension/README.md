# ISC2 CPE Helper (Firefox extension)

A Firefox extension that turns listening to the **Security Now** and **Risky
Business** podcasts into ISC2 CISSP CPE submissions with as little friction as
possible — right next to the ISC2 CPE form where you actually do the submitting.

It:

1. Fetches recent episodes from each podcast's RSS feed.
2. Lets you pick an episode and set your playback speed.
3. Computes CPE credits — `floor(duration / speed / 60)` (same formula as the
   repo's Rust `sn-summarize` crate).
4. Drafts an ISC2-ready title, 2–3 sentence description, and suggested CISSP
   domain(s) via the Claude API.
5. **Autofills** the ISC2 CPE form, with one-click **copy** buttons as a
   fallback.

## Install (temporary, for development)

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select `extension/manifest.json`.

The extension icon appears in the toolbar. Temporary add-ons are removed when
Firefox restarts — reload it the same way after a restart.

## Configure

Click the toolbar icon → the gear (⚙︎), or open the add-on's preferences:

- **Claude API key** — required to draft descriptions. Stored only in this
  browser's extension storage. Create one at `console.anthropic.com`.
- **Model** — Opus 4.8 (default, best quality), Sonnet 4.6, or Haiku 4.5
  (cheapest).
- **Default playback speed** — defaults to `1.25`.

## Use

1. Open the popup, choose a podcast and episode, confirm the playback speed.
2. Click **Generate CPE entry**.
3. Either click **Autofill this ISC2 tab** (when the active tab is the ISC2 CPE
   form) or use the per-field **Copy** buttons.
4. Optionally **Mark submitted** so the episode shows a ✓ and you don't
   double-submit.

## Layout

```
extension/
  manifest.json          MV3 manifest (Firefox)
  popup.html/.js/.css     main UI: pick episode, generate, copy, autofill
  options.html/.js        settings: API key, model, default speed
  content/autofill.js     content script: heuristic form filler on isc2.org
  lib/cpe.js              credit math
  lib/feeds.js            RSS fetch + parse → episode objects
  lib/claude.js           Claude Messages API client (structured JSON output)
  lib/storage.js          settings + submitted-episode log
  icons/icon.svg          toolbar/store icon
  test/mock-isc2-form.html  offline form for testing autofill
```

## Notes & limitations

- The exact ISC2 CPE portal markup is behind a login, so autofill matches fields
  by **meaning** (label / name / id / placeholder / aria-label, and `<select>`
  option text for the domain) rather than fixed selectors. If a field doesn't
  fill on the live form, the popup's per-field report shows which one missed;
  capture that field's HTML and the matcher in `content/autofill.js` can be
  tightened.
- The Claude API key lives in browser storage and requests use the
  `anthropic-dangerous-direct-browser-access` header — fine for a personal tool;
  don't ship this key anywhere shared.
- The feed URLs are `https://feeds.twit.tv/sn.xml` (Security Now) and
  `https://risky.biz/feeds/risky-business` (Risky Business).
