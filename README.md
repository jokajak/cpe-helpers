# cpe-helpers

Utilities for managing CISSP CPE (Continuing Professional Education) credits
earned from security podcasts (Security Now, Risky Business).

## Browser extension (recommended)

[`extension/`](extension/) is a Chrome extension that does the whole workflow in
the browser, next to the ISC2 CPE submission form: it pulls recent episodes from
the podcast RSS feeds, computes CPE credits from the episode duration and your
playback speed, drafts an ISC2-ready title/description/domain **on-device** with
Chrome's built-in AI (Gemini Nano — no API key), and then **autofills** the ISC2
CPE form (with copy buttons as a fallback).

See [`extension/README.md`](extension/README.md) for install and usage.

## ISC2 Security Now CLI

[`tools/isc2-security-now/`](tools/isc2-security-now/) is a separate Python CLI
for a CSV-backed workflow: `sync` reconciles the ISC2 transcript, `list`
shows eligible pending episodes, and `submit` handles one selected episode. It uses a dedicated browser profile
and PEP 723 metadata, so `uv run sn_cpe.py` installs its Python dependency.
The personal CSV stays outside this repository.

See [`tools/isc2-security-now/README.md`](tools/isc2-security-now/README.md)
for setup and commands.

## Tests

- Extension (JS): `npm test` — zero-dependency unit tests via Node's built-in
  test runner (`node --test`) covering the credit math, CISSP domain matching,
  RSS duration parsing, and the on-device Prompt API client (with a mocked
  model). Runs in CI alongside a JS syntax check.
- Rust CLI: `cargo test`.

## Rust CLI (original approach)

The [`crates/`](crates/) workspace holds the original CLI tools (`sn-list`,
`sn-fetch`, `sn-summarize`, `cissp-tracker`). These had too much friction —
terminal-driven, separate from the web form where submissions happen — which is
what motivated the extension above. They remain here for reference and reuse
(the CPE credit formula and Claude prompt were carried over into the extension).
