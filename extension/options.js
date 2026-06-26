import { getSettings, saveSettings } from "./lib/storage.js";
import { MODELS } from "./lib/claude.js";

const el = (id) => document.getElementById(id);

async function init() {
  const modelSel = el("model");
  MODELS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    modelSel.appendChild(opt);
  });

  const settings = await getSettings();
  el("apiKey").value = settings.apiKey;
  el("model").value = settings.model;
  el("speed").value = settings.speed;

  el("save").addEventListener("click", async () => {
    const speed = parseFloat(el("speed").value);
    await saveSettings({
      apiKey: el("apiKey").value.trim(),
      model: el("model").value,
      speed: speed > 0 ? speed : 1.25,
    });
    const saved = el("saved");
    saved.hidden = false;
    setTimeout(() => (saved.hidden = true), 1500);
  });
}

init();
