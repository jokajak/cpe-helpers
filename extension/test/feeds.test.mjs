import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDurationToMinutes } from "../lib/feeds.js";

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
