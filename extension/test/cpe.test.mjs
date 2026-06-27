import { test } from "node:test";
import assert from "node:assert/strict";
import { creditsFor, actualListeningMinutes } from "../lib/cpe.js";

// Mirrors the Rust unit tests in crates/sn-summarize/src/main.rs.
test("creditsFor at 1x", () => {
  assert.equal(creditsFor(60, 1), 1);
  assert.equal(creditsFor(119, 1), 1);
  assert.equal(creditsFor(120, 1), 2);
  assert.equal(creditsFor(59, 1), 0);
});

test("creditsFor at 1.25x", () => {
  assert.equal(creditsFor(120, 1.25), 1); // 96 actual minutes
  assert.equal(creditsFor(75, 1.25), 1); //  60 actual minutes
  assert.equal(creditsFor(74, 1.25), 0); //  59.2 actual minutes
  assert.equal(creditsFor(150, 1.25), 2); // 120 actual minutes
});

test("creditsFor at 2x", () => {
  assert.equal(creditsFor(120, 2), 1);
  assert.equal(creditsFor(119, 2), 0);
});

test("creditsFor guards bad input", () => {
  assert.equal(creditsFor(0, 1.25), 0);
  assert.equal(creditsFor(120, 0), 0);
  assert.equal(creditsFor(-10, 1.25), 0);
});

test("actualListeningMinutes", () => {
  assert.equal(actualListeningMinutes(120, 1.25), 96);
  assert.equal(actualListeningMinutes(60, 2), 30);
  // Non-positive speed returns the raw duration rather than dividing by zero.
  assert.equal(actualListeningMinutes(60, 0), 60);
});
