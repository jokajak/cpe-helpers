// On-device generation via Chrome's built-in Prompt API (Gemini Nano).
// No API key, no account, no network — the model runs locally. The same
// CPE-summary prompt idea from the original Rust `sn-summarize` crate is used,
// but the model returns { title, description, domains } as JSON, constrained by
// a response schema whose `domains` are limited to the eight CISSP domains.
//
// Gemini Nano is hardware-gated and downloads on first use; callers should fall
// back to the episode description + keyword domain matching when availability()
// is "unavailable".

import { CISSP_DOMAINS, domainsFor } from "./domains.js";

const SYSTEM_PROMPT = `You generate ISC2 CISSP CPE (Continuing Professional Education) submission entries from security podcast episodes.

Given an episode's title, description, and the listener's actual listening time, produce a concise, professional CPE entry suitable for the ISC2 CPE portal.

Choose one or more of the eight CISSP domains that best match the episode's content.

Write the description in 2-3 sentences. Be factual and specific about the security topics actually covered; do not invent details that are not supported by the episode description. Respond only with the requested JSON.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Concise CPE activity title (podcast and episode topic)",
    },
    description: {
      type: "string",
      description: "2-3 sentence professional description for the ISC2 submission",
    },
    domains: {
      type: "array",
      items: { type: "string", enum: CISSP_DOMAINS },
      description: "One or more relevant CISSP domains",
    },
  },
  required: ["title", "description", "domains"],
  additionalProperties: false,
};

export function isSupported() {
  return typeof LanguageModel !== "undefined";
}

// Returns "unavailable" | "downloadable" | "downloading" | "available".
export async function availability() {
  if (!isSupported()) return "unavailable";
  try {
    return await LanguageModel.availability();
  } catch (_) {
    return "unavailable";
  }
}

function buildUserContent({ episode, speed, credits, actualMinutes }) {
  return [
    `Podcast: ${episode.podcast}`,
    `Episode title: ${episode.title}`,
    `Date: ${episode.date || "unknown"}`,
    `Episode duration (minutes): ${episode.durationMinutes ?? "unknown"}`,
    `Playback speed: ${speed}x`,
    `Actual listening time (minutes): ${Math.round(actualMinutes)}`,
    `CPE credits (whole hours, rounded down): ${credits}`,
    "",
    "Episode description:",
    // Gemini Nano has a small context window — keep the input compact.
    (episode.description || "").slice(0, 3500),
  ].join("\n");
}

function makeMonitor(onProgress) {
  return (m) => {
    m.addEventListener("downloadprogress", (e) => {
      if (onProgress) onProgress(e.loaded);
    });
  };
}

// Trigger (and report) the one-time Gemini Nano download without prompting.
export async function downloadModel(onProgress) {
  if (!isSupported()) {
    throw new Error("On-device AI (LanguageModel) isn't available in this browser.");
  }
  const session = await LanguageModel.create({ monitor: makeMonitor(onProgress) });
  session.destroy();
}

export async function generateCpe({ episode, speed, credits, actualMinutes, onProgress }) {
  if (!isSupported()) {
    throw new Error("On-device AI (LanguageModel) isn't available in this browser.");
  }
  if ((await availability()) === "unavailable") {
    throw new Error("The on-device AI model is unavailable on this device.");
  }

  const session = await LanguageModel.create({
    initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
    monitor: makeMonitor(onProgress),
  });
  try {
    const raw = await session.prompt(buildUserContent({ episode, speed, credits, actualMinutes }), {
      responseConstraint: RESPONSE_SCHEMA,
    });
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      throw new Error("Could not parse the model's response as JSON.");
    }
    if (!Array.isArray(parsed.domains) || parsed.domains.length === 0) {
      parsed.domains = domainsFor(episode.description);
    }
    return parsed;
  } finally {
    session.destroy();
  }
}
