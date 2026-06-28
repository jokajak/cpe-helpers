import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDurationToMinutes, parseEpisodeNumber, snTitle } from "../lib/feeds.js";

test("parses raw seconds", () => {
  assert.equal(parseDurationToMinutes("5400"), 90);
  assert.equal(parseDurationToMinutes("90"), 2); // rounds 1.5 → 2
});

test("parses mm:ss", () => {
  assert.equal(parseDurationToMinutes("90:00"), 90);
  assert.equal(parseDurationToMinutes("75:30"), 76); // rounds
});

test("parses hh:mm:ss", () => {
  assert.equal(parseDurationToMinutes("1:30:00"), 90);
  assert.equal(parseDurationToMinutes("2:05:00"), 125);
});

test("returns null for unparseable input", () => {
  assert.equal(parseDurationToMinutes(""), null);
  assert.equal(parseDurationToMinutes(null), null);
  assert.equal(parseDurationToMinutes("about an hour"), null);
  assert.equal(parseDurationToMinutes("1:aa:00"), null);
});

test("parseEpisodeNumber prefers itunes:episode, then the title", () => {
  assert.equal(parseEpisodeNumber("Whatever", "1234"), "1234");
  assert.equal(parseEpisodeNumber("SN 1010: Topic", ""), "1010");
  assert.equal(parseEpisodeNumber("Security Now 999: Topic", null), "999");
  assert.equal(parseEpisodeNumber("Episode #1234 — Topic", ""), "1234");
  assert.equal(parseEpisodeNumber("No number here", ""), null);
});

test("snTitle prefixes and de-duplicates the episode label", () => {
  assert.equal(snTitle("1234", "TLS deep dive"), "SN-1234: TLS deep dive");
  assert.equal(snTitle("1234", "Security Now 1234: TLS deep dive"), "SN-1234: TLS deep dive");
  assert.equal(snTitle("1234", "1234: TLS deep dive"), "SN-1234: TLS deep dive");
  assert.equal(snTitle("1234", "SN 1234 - TLS"), "SN-1234: TLS");
});
