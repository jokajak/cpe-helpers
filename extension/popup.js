import { defaultFeeds, fetchEpisodes } from "./lib/feeds.js";
import { creditsFor, actualListeningMinutes } from "./lib/cpe.js";
import { generateCpe, availability } from "./lib/promptapi.js";
import { domainsFor } from "./lib/domains.js";
import { getSettings, saveSettings, getSubmitted, markSubmitted } from "./lib/storage.js";

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

async function loadEpisodes() {
  setStatus("Fetching episodes…");
  el("refresh").disabled = true;
  try {
    const { episodes, errors } = await fetchEpisodes(state.feeds);
    state.episodes = episodes;
    renderEpisodeOptions();
    if (errors.length && episodes.length) {
      setStatus(`Loaded with warnings: ${errors.join("; ")}`);
    } else if (errors.length) {
      setStatus(errors.join("; "));
    } else {
      setStatus("");
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

function buildFields(episode, generated, credits) {
  return {
    title: generated.title || `${episode.podcast}: ${episode.title}`,
    provider: episode.provider,
    date: episode.date,
    credits: String(credits),
    domain: (generated.domains || []).join(", "),
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
  } catch (err) {
    // Any failure still yields a usable entry from the description.
    const generated = fallbackEntry(episode);
    state.current = { episode, generated, fields: buildFields(episode, generated, credits) };
    renderResult(state.current.fields, episode);
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
    const report = await chrome.tabs.sendMessage(tabId, {
      type: "cpe-autofill",
      fields: state.current.fields,
    });
    const summary = Object.entries(report || {})
      .filter(([, v]) => v !== "skipped")
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
    const node = el("autofill-report");
    node.textContent = summary || "Nothing to fill.";
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
  podcastSel.addEventListener("change", renderEpisodeOptions);
  el("episode").addEventListener("change", updateCreditPreview);
  el("speed").addEventListener("change", async () => {
    updateCreditPreview();
    await saveSettings({ speed: currentSpeed() });
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

  await loadEpisodes();
}

init();
