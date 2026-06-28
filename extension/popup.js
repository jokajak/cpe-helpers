import { defaultFeeds, fetchEpisodes } from "./lib/feeds.js";
import { creditsFor, actualListeningMinutes } from "./lib/cpe.js";
import { generateCpe, availability } from "./lib/promptapi.js";
import { domainsFor } from "./lib/domains.js";
import {
  getSettings,
  saveSettings,
  getSubmitted,
  markSubmitted,
  getCachedEpisodes,
  setCachedEpisodes,
  getEntry,
  saveEntry,
  getSelection,
  saveSelection,
} from "./lib/storage.js";

const el = (id) => document.getElementById(id);

const state = {
  episodes: [],
  feeds: defaultFeeds(),
  settings: null,
  submitted: {},
  current: null, // { episode, generated, fields }
};

function setStatus(message, ok = false) {
  const node = el("status");
  if (!message) {
    node.hidden = true;
    return;
  }
  node.textContent = message;
  node.classList.toggle("ok", ok);
  node.hidden = false;
}

function visibleEpisodes() {
  const pick = el("podcast").value;
  return state.episodes.filter((e) => pick === "all" || e.feedId === pick);
}

function renderEpisodeOptions() {
  const select = el("episode");
  const list = visibleEpisodes();
  select.innerHTML = "";
  if (list.length === 0) {
    select.innerHTML = '<option value="">No episodes loaded</option>';
    return;
  }
  list.forEach((ep, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    const dur = ep.durationMinutes ? `${ep.durationMinutes}m` : "?";
    const seen = state.submitted[ep.guid] ? "✓ " : "";
    opt.textContent = `${seen}${ep.date} · ${ep.podcast} · ${ep.title} (${dur})`;
    select.appendChild(opt);
  });
  updateCreditPreview();
  syncYearDefault();
}

function selectedEpisode() {
  const i = parseInt(el("episode").value, 10);
  const list = visibleEpisodes();
  return Number.isNaN(i) ? null : list[i] || null;
}

function currentSpeed() {
  const v = parseFloat(el("speed").value);
  return v > 0 ? v : 1;
}

function updateCreditPreview() {
  const ep = selectedEpisode();
  const node = el("credit-preview");
  if (!ep || !ep.durationMinutes) {
    node.textContent = "";
    return;
  }
  const credits = creditsFor(ep.durationMinutes, currentSpeed());
  const actual = Math.round(actualListeningMinutes(ep.durationMinutes, currentSpeed()));
  node.textContent = `${credits} credit(s) · ${actual} min`;
}

// Render from the local cache without hitting the network. Returns true if a
// cache existed.
async function loadFromCache() {
  const cache = await getCachedEpisodes();
  if (!cache || cache.episodes.length === 0) return false;
  state.episodes = cache.episodes;
  renderEpisodeOptions();
  const age = Math.round((Date.now() - cache.fetchedAt) / 60000);
  setStatus(cache.fresh ? `${cache.episodes.length} episodes (cached). Refresh for latest.`
    : `${cache.episodes.length} episodes (cached ${age} min ago). Refresh for latest.`);
  return true;
}

// Fetch from the feeds and update the cache (used by Refresh and the first run).
async function loadEpisodes() {
  setStatus("Fetching episodes…");
  el("refresh").disabled = true;
  try {
    const { episodes, errors } = await fetchEpisodes(state.feeds);
    state.episodes = episodes;
    if (episodes.length) await setCachedEpisodes(episodes);
    renderEpisodeOptions();
    await restoreSelection();
    if (errors.length && episodes.length) {
      setStatus(`Loaded with warnings: ${errors.join("; ")}`);
    } else if (errors.length) {
      setStatus(errors.join("; "));
    } else {
      setStatus(`${episodes.length} episodes loaded.`, true);
    }
  } catch (err) {
    setStatus(err.message || String(err));
  } finally {
    el("refresh").disabled = false;
  }
}

// No-model fallback: use the episode's own description + keyword domain matching.
function fallbackEntry(episode) {
  const desc = (episode.description || "").replace(/\s+/g, " ").trim();
  const trimmed = desc.length > 500 ? desc.slice(0, 500).replace(/\s+\S*$/, "") + "…" : desc;
  return {
    title: `${episode.podcast}: ${episode.title}`,
    description: trimmed || `Listened to the ${episode.podcast} episode "${episode.title}".`,
    domains: domainsFor(desc),
  };
}

function yearOf(dateStr) {
  const m = String(dateStr || "").match(/\d{4}/);
  return m ? m[0] : String(new Date().getFullYear());
}

// The "Year Published" the ISC2 form wants. Defaults to the episode's publish
// year but is user-editable (e.g. Security Now back-catalog listening).
function currentYear() {
  const v = el("year").value.trim();
  if (/^\d{4}$/.test(v)) return v;
  const ep = selectedEpisode();
  return ep ? yearOf(ep.date) : String(new Date().getFullYear());
}

// Reset the year input to the selected episode's publish year.
function syncYearDefault() {
  const ep = selectedEpisode();
  el("year").value = ep ? yearOf(ep.date) : "";
}

function buildFields(episode, generated, credits) {
  return {
    title: generated.title || `${episode.podcast}: ${episode.title}`,
    provider: episode.provider,
    date: episode.date,
    year: currentYear(),
    credits: String(credits),
    domain: (generated.domains || []).join(", "),
    domains: generated.domains || [],
    description: generated.description || "",
    url: episode.link || "",
  };
}

function renderResult(fields, episode) {
  document.querySelectorAll("#result .field").forEach((field) => {
    const key = field.dataset.field;
    field.querySelector(".value").textContent = fields[key] || "";
  });
  el("result").hidden = false;
  el("mark-submitted").textContent = state.submitted[episode.guid] ? "Already submitted ✓" : "Mark submitted";
  refreshAutofillButton();
}

// Persist the current UI selection so the popup restores it next open.
async function persistSelection() {
  const ep = selectedEpisode();
  await saveSelection({
    podcast: el("podcast").value,
    guid: ep ? ep.guid : null,
    year: el("year").value,
  });
}

// If a draft was already generated for the selected episode, restore it.
async function restoreEntryForSelected(hideIfNone = false) {
  const ep = selectedEpisode();
  if (!ep) return;
  const saved = await getEntry(ep.guid);
  if (saved && saved.fields) {
    if (saved.fields.year) el("year").value = saved.fields.year;
    state.current = { episode: ep, generated: saved.generated, fields: saved.fields };
    renderResult(saved.fields, ep);
    setStatus("Restored saved draft. Autofill the current ISC2 page or copy fields.", true);
  } else if (hideIfNone) {
    state.current = null;
    el("result").hidden = true;
    refreshAutofillButton();
  }
}

// Restore the last podcast + episode + year, then any saved draft.
async function restoreSelection() {
  const sel = await getSelection();
  if (!sel) return;
  if (sel.podcast) el("podcast").value = sel.podcast;
  renderEpisodeOptions();
  if (sel.guid) {
    const list = visibleEpisodes();
    const idx = list.findIndex((e) => e.guid === sel.guid);
    if (idx >= 0) el("episode").value = String(idx);
  }
  if (sel.year) el("year").value = sel.year;
  updateCreditPreview();
  await restoreEntryForSelected();
}

// Called whenever the podcast/episode selection changes.
async function onSelectionChanged() {
  updateCreditPreview();
  syncYearDefault();
  await persistSelection();
  await restoreEntryForSelected(true);
}

async function onGenerate() {
  const episode = selectedEpisode();
  if (!episode) {
    setStatus("Pick an episode first.");
    return;
  }
  const speed = currentSpeed();
  const credits = creditsFor(episode.durationMinutes || 0, speed);
  const actual = actualListeningMinutes(episode.durationMinutes || 0, speed);

  el("generate").disabled = true;
  try {
    let generated;
    const status = await availability();
    if (status === "unavailable") {
      generated = fallbackEntry(episode);
      setStatus("On-device AI unavailable — drafted from the episode description. Edit as needed.", true);
    } else {
      setStatus(status === "available" ? "Drafting with on-device AI…" : "Preparing on-device model…");
      generated = await generateCpe({
        episode,
        speed,
        credits,
        actualMinutes: actual,
        onProgress: (f) => setStatus(`Downloading on-device model… ${Math.round(f * 100)}%`),
      });
      setStatus("Draft ready. Copy fields or autofill the ISC2 form.", true);
    }
    state.current = { episode, generated, fields: buildFields(episode, generated, credits) };
    renderResult(state.current.fields, episode);
    await saveEntry(episode.guid, { generated: state.current.generated, fields: state.current.fields });
    await persistSelection();
  } catch (err) {
    // Any failure still yields a usable entry from the description.
    const generated = fallbackEntry(episode);
    state.current = { episode, generated, fields: buildFields(episode, generated, credits) };
    renderResult(state.current.fields, episode);
    await saveEntry(episode.guid, { generated: state.current.generated, fields: state.current.fields });
    await persistSelection();
    setStatus(`On-device AI failed (${err.message}). Used the episode description instead.`);
  } finally {
    el("generate").disabled = false;
  }
}

async function activeIsc2TabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return null;
  return /:\/\/[^/]*isc2\.org\//.test(tab.url) ? tab.id : null;
}

async function refreshAutofillButton() {
  const tabId = await activeIsc2TabId();
  const btn = el("autofill");
  btn.disabled = tabId === null || !state.current;
  btn.title = tabId === null ? "Open the ISC2 CPE form in the active tab to enable autofill" : "";
}

async function onAutofill() {
  if (!state.current) return;
  const tabId = await activeIsc2TabId();
  if (tabId === null) {
    setStatus("The active tab isn't an ISC2 page. Use the copy buttons instead.");
    return;
  }
  try {
    const report = (await chrome.tabs.sendMessage(tabId, {
      type: "cpe-autofill",
      fields: state.current.fields,
    })) || {};
    const candidates = report.__candidates || [];
    const entries = Object.entries(report).filter(([k]) => !k.startsWith("__"));
    const summary = entries
      .filter(([, v]) => v !== "skipped")
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
    const node = el("autofill-report");
    node.textContent = summary || "Nothing to fill.";
    // If something wasn't found, surface the field names this page actually has,
    // so the matcher can be tuned. Full detail is in the page's devtools console.
    const missed = entries.filter(([, v]) => v === "not found").map(([k]) => k);
    if (missed.length && candidates.length) {
      const names = candidates.map((c) => c.name || c.label || c.placeholder).filter(Boolean);
      node.textContent += ` — not found: ${missed.join(", ")}. Page fields: ${names.join(", ") || "none"}`;
      console.debug("[ISC2 CPE Helper] autofill candidates", candidates);
    }
    node.hidden = false;
    setStatus("Autofill attempted. Check the form and the report below.", true);
  } catch (err) {
    setStatus("Could not reach the ISC2 page. Reload it and try again, or copy manually.");
  }
}

async function onMarkSubmitted() {
  if (!state.current) return;
  await markSubmitted(state.current.episode.guid);
  state.submitted = await getSubmitted();
  el("mark-submitted").textContent = "Already submitted ✓";
  renderEpisodeOptions();
}

async function copyFieldValue(button) {
  const value = button.closest(".value-row").querySelector(".value").textContent;
  try {
    await navigator.clipboard.writeText(value);
    const original = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = original), 900);
  } catch (_) {
    setStatus("Clipboard copy was blocked by the browser.");
  }
}

async function init() {
  state.settings = await getSettings();
  state.submitted = await getSubmitted();

  const podcastSel = el("podcast");
  state.feeds.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    podcastSel.appendChild(opt);
  });

  el("speed").value = state.settings.speed;

  el("refresh").addEventListener("click", loadEpisodes);
  podcastSel.addEventListener("change", async () => {
    renderEpisodeOptions();
    await onSelectionChanged();
  });
  el("episode").addEventListener("change", onSelectionChanged);
  el("speed").addEventListener("change", async () => {
    updateCreditPreview();
    await saveSettings({ speed: currentSpeed() });
  });
  // Let the user override the year; keep the entry + saved draft in sync.
  el("year").addEventListener("change", async () => {
    await persistSelection();
    if (!state.current) return;
    state.current.fields.year = currentYear();
    const cell = document.querySelector('#result .field[data-field="year"] .value');
    if (cell) cell.textContent = state.current.fields.year;
    await saveEntry(state.current.episode.guid, {
      generated: state.current.generated,
      fields: state.current.fields,
    });
  });
  el("generate").addEventListener("click", onGenerate);
  el("autofill").addEventListener("click", onAutofill);
  el("mark-submitted").addEventListener("click", onMarkSubmitted);
  el("open-options").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  document.querySelectorAll("#result .copy").forEach((b) =>
    b.addEventListener("click", () => copyFieldValue(b))
  );

  // Use the local cache for an instant open; only fetch if there's nothing cached.
  const hadCache = await loadFromCache();
  if (hadCache) {
    await restoreSelection();
  } else {
    await loadEpisodes();
  }
}

init();
