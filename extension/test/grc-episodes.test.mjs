import { test } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./dom-setup.mjs";

// feeds.js uses browser DOM globals lazily (inside the parsing functions), so we
// install the linkedom-backed shims before importing it.
installDom();
const { parseGrcEpisodes } = await import("../lib/feeds.js");

// A faithful slice of GRC's securitynow.htm / sn/past/<year>.htm layout: each
// episode is anchored by <a name="N">, then a header <font size=1> with the
// pipe-delimited "Episode #N | date | length", then a content <font size=1>
// that wraps the <font size=2> title and carries the show-notes text, then
// per-file <font size=1> size labels. The header and the size labels are also
// size=1 — the regression this guards against is the parser grabbing the header
// line as the description instead of the real notes.
const FIXTURE = `
<a name="1084"></a>
<br>
<table style="width:60em;"><tr><td>
<font size=1>Episode&nbsp;#1084 | 23 Jun 2026 | 141 min.</font></td></tr></table>
<table><tr><td colspan=6><font size=1><font size=2><b>The Residential Proxy Threat</b></font><br><br />&bull; First bullet here. &bull; Second bullet here.</font></td></tr>
<tr><td><a href="https://media.grc.com/sn/sn-1084.mp3"></a><font size=1>68&nbsp;MB</font></td></tr></table>

<a name="1083"></a>
<br>
<table style="width:60em;"><tr><td>
<font size=1>Episode&nbsp;#1083 | 16 Jun 2026 | 134 min.</font></td></tr></table>
<table><tr><td colspan=6><font size=1><font size=2><b>Patch Tuesday</b></font><br><br />Notes for episode 1083.</font></td></tr>
<tr><td><a href="https://media.grc.com/sn/sn-1083.mp3"></a><font size=1>62&nbsp;MB</font></td></tr></table>
`;

test("parseGrcEpisodes extracts number, title, date and duration", () => {
  const eps = parseGrcEpisodes(FIXTURE);
  assert.equal(eps.length, 2);

  // Sorted newest-first.
  assert.deepEqual(
    eps.map((e) => e.episodeNumber),
    ["1084", "1083"]
  );

  const e = eps[0];
  assert.equal(e.episodeNumber, "1084");
  assert.equal(e.title, "The Residential Proxy Threat");
  assert.equal(e.date, "2026-06-23");
  assert.equal(e.durationMinutes, 141);
  assert.equal(e.link, "https://www.grc.com/sn/sn-1084.htm");
  assert.equal(e.guid, "grc-sn-1084");
});

test("parseGrcEpisodes captures the show-notes description, not the header line", () => {
  const [e1084, e1083] = parseGrcEpisodes(FIXTURE);

  // The real notes are present...
  assert.match(e1084.description, /First bullet here\. .*Second bullet here\./);
  assert.equal(e1083.description, "Notes for episode 1083.");

  // ...and the header line / title are NOT leaking into the description
  // (this is the bug that motivated the test).
  assert.doesNotMatch(e1084.description, /Episode\s*#?1084/);
  assert.doesNotMatch(e1084.description, /141\s*min/);
  assert.doesNotMatch(e1084.description, /Residential Proxy Threat/);
});

test("parseGrcEpisodes returns no episodes for markup without anchors", () => {
  assert.deepEqual(parseGrcEpisodes("<p>no episodes here</p>"), []);
});
