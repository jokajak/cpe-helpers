// Thin wrappers over chrome.storage.local for settings and the
// already-submitted episode log (used to flag possible duplicates).

const DEFAULTS = {
  speed: 1.25,
};

export async function getSettings() {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...(stored.settings || {}) };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

// ---- Episode cache ------------------------------------------------------
// Cache the fetched episode list so opening the popup doesn't refetch every
// time; "Refresh" forces a new fetch.
const EPISODES_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getCachedEpisodes() {
  const stored = await chrome.storage.local.get("episodesCache");
  const cache = stored.episodesCache;
  if (!cache || !Array.isArray(cache.episodes)) return null;
  return {
    episodes: cache.episodes,
    fetchedAt: cache.fetchedAt || 0,
    fresh: Date.now() - (cache.fetchedAt || 0) < EPISODES_TTL_MS,
  };
}

export async function setCachedEpisodes(episodes) {
  await chrome.storage.local.set({ episodesCache: { episodes, fetchedAt: Date.now() } });
}

// ---- Generated drafts ---------------------------------------------------
// Persist the generated CPE entry per episode (keyed by guid) so reopening the
// popup or reselecting an episode restores the draft instead of regenerating.
export async function getEntry(guid) {
  if (!guid) return null;
  const stored = await chrome.storage.local.get("entries");
  return (stored.entries || {})[guid] || null;
}

export async function saveEntry(guid, entry) {
  if (!guid) return;
  const stored = await chrome.storage.local.get("entries");
  const entries = stored.entries || {};
  entries[guid] = entry;
  await chrome.storage.local.set({ entries });
}

// ---- Last selection -----------------------------------------------------
// Remember the podcast filter + episode + year so the popup restores across the
// multi-page ISC2 wizard (the domain step is a separate page).
export async function getSelection() {
  const stored = await chrome.storage.local.get("selection");
  return stored.selection || null;
}

export async function saveSelection(selection) {
  await chrome.storage.local.set({ selection });
}

export async function getSubmitted() {
  const stored = await chrome.storage.local.get("submitted");
  return stored.submitted || {};
}

export async function markSubmitted(guid) {
  if (!guid) return;
  const submitted = await getSubmitted();
  submitted[guid] = new Date().toISOString();
  await chrome.storage.local.set({ submitted });
}
