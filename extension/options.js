import { getSettings, saveSettings } from "./lib/storage.js";
import { availability, downloadModel, isSupported } from "./lib/promptapi.js";

const el = (id) => document.getElementById(id);

const STATUS_TEXT = {
  available: "Ready — drafts run on-device.",
  downloadable: "Supported, but the model needs to be downloaded first.",
  downloading: "Model is downloading…",
  unavailable: "Not available on this browser/device — the extension will use the episode description instead.",
};

async function refreshStatus() {
  const status = isSupported() ? await availability() : "unavailable";
  el("ai-status").textContent = STATUS_TEXT[status] || status;
  el("download").hidden = !(status === "downloadable" || status === "downloading");
}

async function onDownload() {
  el("download").disabled = true;
  el("ai-progress").textContent = "Starting download…";
  try {
    await downloadModel((loaded) => {
      el("ai-progress").textContent = `Downloading… ${Math.round(loaded * 100)}%`;
    });
    el("ai-progress").textContent = "Download complete.";
  } catch (err) {
    el("ai-progress").textContent = `Download failed: ${err.message}`;
  } finally {
    el("download").disabled = false;
    refreshStatus();
  }
}

async function init() {
  const settings = await getSettings();
  el("speed").value = settings.speed;

  el("download").addEventListener("click", onDownload);
  el("save").addEventListener("click", async () => {
    const speed = parseFloat(el("speed").value);
    await saveSettings({ speed: speed > 0 ? speed : 1.25 });
    const saved = el("saved");
    saved.hidden = false;
    setTimeout(() => (saved.hidden = true), 1500);
  });

  refreshStatus();
}

init();
