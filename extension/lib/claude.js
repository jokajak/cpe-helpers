// Claude API client. Calls the Messages API directly from the (privileged)
// extension page context — the API key never enters a content script.
//
// Browser note: direct browser access to the Anthropic API requires the
// `anthropic-dangerous-direct-browser-access` header plus the api.anthropic.com
// host permission. The tradeoff is that the API key lives in extension storage
// on the user's machine — acceptable for a personal tool.
//
// Adapts the CPE-summary prompt sketched in the Rust `sn-summarize` crate into
// a JSON-returning request via structured outputs (output_config.format), so
// the response parses cleanly into { title, description, domains }.

export const MODELS = [
  { id: "claude-opus-4-8", label: "Opus 4.8 (default, highest quality)" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (balanced)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (fastest, cheapest)" },
];

const CISSP_DOMAINS = [
  "Security and Risk Management",
  "Asset Security",
  "Security Architecture and Engineering",
  "Communication and Network Security",
  "Identity and Access Management (IAM)",
  "Security Assessment and Testing",
  "Security Operations",
  "Software Development Security",
];

const SYSTEM_PROMPT = `You generate ISC2 CISSP CPE (Continuing Professional Education) submission entries from security podcast episodes.

Given an episode's title, show notes, and the listener's actual listening time, produce a concise, professional CPE entry suitable for the ISC2 CPE portal.

Map the episode's content to one or more of the eight CISSP domains (use these exact names):
${CISSP_DOMAINS.map((d, i) => `${i + 1}. ${d}`).join("\n")}

Write the description in 2-3 sentences. Be factual and specific about the security topics actually covered in the episode; do not invent details that are not supported by the show notes.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Concise CPE activity title, e.g. the podcast and episode topic",
    },
    description: {
      type: "string",
      description: "2-3 sentence professional description for the ISC2 submission",
    },
    domains: {
      type: "array",
      items: { type: "string" },
      description: "One or more relevant CISSP domain names from the provided list",
    },
  },
  required: ["title", "description", "domains"],
  additionalProperties: false,
};

export async function generateCpe({ apiKey, model, episode, speed, credits, actualMinutes }) {
  if (!apiKey) {
    throw new Error("No Claude API key set. Open the extension options to add one.");
  }

  const userContent = [
    `Podcast: ${episode.podcast}`,
    `Episode title: ${episode.title}`,
    `Date: ${episode.date || "unknown"}`,
    `Episode duration (minutes): ${episode.durationMinutes ?? "unknown"}`,
    `Playback speed: ${speed}x`,
    `Actual listening time (minutes): ${Math.round(actualMinutes)}`,
    `CPE credits (whole hours, rounded down): ${credits}`,
    "",
    "Show notes / description:",
    (episode.description || "").slice(0, 6000),
  ].join("\n");

  const body = {
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Claude API error (HTTP ${res.status})`;
    try {
      const err = await res.json();
      if (err && err.error && err.error.message) message += `: ${err.error.message}`;
    } catch (_) {
      // ignore body parse failures
    }
    throw new Error(message);
  }

  const data = await res.json();
  if (data.stop_reason === "refusal") {
    throw new Error("Claude declined to generate this entry.");
  }
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock || !textBlock.text) {
    throw new Error("Claude returned no text content.");
  }
  try {
    return JSON.parse(textBlock.text);
  } catch (_) {
    throw new Error("Could not parse Claude's response as JSON.");
  }
}
