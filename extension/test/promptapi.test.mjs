import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { availability, generateCpe, isSupported } from "../lib/promptapi.js";

const EPISODE = {
  podcast: "Security Now",
  title: "Test episode",
  date: "2026-06-01",
  durationMinutes: 120,
  description: "A discussion of TLS encryption and firewall rules.",
  link: "https://example.com/ep",
};

// Install a fake Chrome Prompt API that returns a canned JSON payload.
function installFakeModel(payload) {
  globalThis.LanguageModel = {
    async availability() {
      return "available";
    },
    async create() {
      return {
        async prompt() {
          return JSON.stringify(payload);
        },
        destroy() {},
      };
    },
  };
}

afterEach(() => {
  delete globalThis.LanguageModel;
});

test("reports unavailable when the API is absent", async () => {
  assert.equal(isSupported(), false);
  assert.equal(await availability(), "unavailable");
});

test("generateCpe rejects when the API is absent", async () => {
  await assert.rejects(
    () => generateCpe({ episode: EPISODE, speed: 1.25, credits: 1, actualMinutes: 96 }),
    /isn't available/
  );
});

test("generateCpe parses the model's JSON and passes domains through", async () => {
  installFakeModel({
    title: "TLS deep dive",
    description: "Covered TLS and firewalls.",
    domains: ["Communication and Network Security"],
  });
  const out = await generateCpe({ episode: EPISODE, speed: 1.25, credits: 1, actualMinutes: 96 });
  assert.equal(out.title, "TLS deep dive");
  assert.deepEqual(out.domains, ["Communication and Network Security"]);
});

test("generateCpe fills domains from keywords when the model returns none", async () => {
  installFakeModel({ title: "T", description: "D", domains: [] });
  const out = await generateCpe({ episode: EPISODE, speed: 1.25, credits: 1, actualMinutes: 96 });
  assert.ok(out.domains.length > 0, "expected fallback domains");
  assert.ok(out.domains.includes("Communication and Network Security"));
});
