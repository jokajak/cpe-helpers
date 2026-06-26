# cpe-helpers

Utilities for managing CISSP CPE (Continuing Professional Education) credits
earned from security podcasts (Security Now, Risky Business).

## Firefox extension (recommended)

[`extension/`](extension/) is a Firefox extension that does the whole workflow in
the browser, next to the ISC2 CPE submission form: it pulls recent episodes from
the podcast RSS feeds, computes CPE credits from the episode duration and your
playback speed, drafts an ISC2-ready title/description/domain via the Claude API,
and then **autofills** the ISC2 CPE form (with copy buttons as a fallback).

See [`extension/README.md`](extension/README.md) for install and usage.

## Rust CLI (original approach)

The [`crates/`](crates/) workspace holds the original CLI tools (`sn-list`,
`sn-fetch`, `sn-summarize`, `cissp-tracker`). These had too much friction —
terminal-driven, separate from the web form where submissions happen — which is
what motivated the extension above. They remain here for reference and reuse
(the CPE credit formula and Claude prompt were carried over into the extension).
