import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Minimal in-memory chrome.storage.local stub (string-key get + object set,
// which is all storage.js uses).
function installFakeChrome() {
  const store = {};
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          return typeof key === "string" ? { [key]: store[key] } : { ...store };
        },
        async set(obj) {
          Object.assign(store, obj);
        },
      },
    },
  };
}

const {
  getCachedEpisodes,
  setCachedEpisodes,
  getEntry,
  saveEntry,
  getSelection,
  saveSelection,
} = await import("../lib/storage.js");

beforeEach(() => installFakeChrome());

test("episode cache round-trips and is fresh when just written", async () => {
  assert.equal(await getCachedEpisodes(), null);
  await setCachedEpisodes([{ guid: "a" }, { guid: "b" }]);
  const cache = await getCachedEpisodes();
  assert.equal(cache.episodes.length, 2);
  assert.equal(cache.fresh, true);
  assert.ok(cache.fetchedAt > 0);
});

test("entries are saved and fetched per guid", async () => {
  assert.equal(await getEntry("g1"), null);
  await saveEntry("g1", { fields: { title: "x" } });
  assert.deepEqual(await getEntry("g1"), { fields: { title: "x" } });
  assert.equal(await getEntry("missing"), null);
  assert.equal(await getEntry(""), null); // no guid
});

test("selection round-trips", async () => {
  assert.equal(await getSelection(), null);
  await saveSelection({ podcast: "security-now", guid: "g1", year: "2026" });
  assert.deepEqual(await getSelection(), { podcast: "security-now", guid: "g1", year: "2026" });
});
