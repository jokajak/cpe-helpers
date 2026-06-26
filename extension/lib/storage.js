// Thin wrappers over browser.storage.local for settings and the
// already-submitted episode log (used to flag possible duplicates).

const DEFAULTS = {
  apiKey: "",
  model: "claude-opus-4-8",
  speed: 1.25,
};

export async function getSettings() {
  const stored = await browser.storage.local.get("settings");
  return { ...DEFAULTS, ...(stored.settings || {}) };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await browser.storage.local.set({ settings: next });
  return next;
}

export async function getSubmitted() {
  const stored = await browser.storage.local.get("submitted");
  return stored.submitted || {};
}

export async function markSubmitted(guid) {
  if (!guid) return;
  const submitted = await getSubmitted();
  submitted[guid] = new Date().toISOString();
  await browser.storage.local.set({ submitted });
}
