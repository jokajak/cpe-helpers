// Fetch and parse the podcast RSS feeds into normalized episode objects.
//
// Episodes mirror the data model the Rust `sn-fetch` crate produced
// (EpisodeDetails: title, date, duration, source_url, description), but sourced
// from clean RSS feeds rather than scraping grc.com — an extension can fetch
// these cross-origin thanks to the host permissions in the manifest.

const DEFAULT_FEEDS = [
  {
    id: "security-now",
    name: "Security Now",
    provider: "Security Now (TWiT)",
    url: "https://feeds.twit.tv/sn.xml",
  },
  {
    id: "risky-business",
    name: "Risky Business",
    provider: "Risky Business Media",
    url: "https://risky.biz/feeds/risky-business",
  },
];

export function defaultFeeds() {
  return DEFAULT_FEEDS.map((f) => ({ ...f }));
}

// Accepts "5400" (seconds), "1:30:00" (h:m:s) or "90:00" (m:s) → whole minutes.
export function parseDurationToMinutes(raw) {
  if (!raw) return null;
  const value = raw.trim();
  if (/^\d+$/.test(value)) return Math.round(parseInt(value, 10) / 60);
  const parts = value.split(":").map((p) => Number(p));
  if (parts.length === 0 || parts.some((n) => Number.isNaN(n))) return null;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return Math.round(seconds / 60);
}

function childByLocalName(parent, localName) {
  for (const el of parent.children) {
    if (el.localName === localName) return el;
  }
  return null;
}

function textOf(el) {
  return el && el.textContent ? el.textContent.trim() : "";
}

function stripHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function toIsoDate(pubDate) {
  if (!pubDate) return "";
  const d = new Date(pubDate);
  return Number.isNaN(d.getTime()) ? pubDate : d.toISOString().slice(0, 10);
}

export async function fetchFeed(feed) {
  const res = await fetch(feed.url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${feed.name}: HTTP ${res.status}`);
  }
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error(`Could not parse the ${feed.name} feed`);
  }

  return [...doc.querySelectorAll("item")].map((item) => {
    const title = textOf(childByLocalName(item, "title"));
    const pubDate = textOf(childByLocalName(item, "pubDate"));
    const guidEl = childByLocalName(item, "guid");
    const link = textOf(childByLocalName(item, "link")) || textOf(guidEl);
    const durationRaw = textOf(childByLocalName(item, "duration")); // itunes:duration
    // Prefer the RSS <description> (episode summary) over content:encoded (the
    // fuller show notes) — it's cleaner and a better fit for a CPE blurb.
    const summary = textOf(childByLocalName(item, "description"));
    const description = summary || textOf(childByLocalName(item, "encoded"));

    return {
      feedId: feed.id,
      podcast: feed.name,
      provider: feed.provider,
      title,
      link,
      guid: textOf(guidEl) || link,
      date: toIsoDate(pubDate),
      durationMinutes: parseDurationToMinutes(durationRaw),
      description: stripHtml(description),
    };
  });
}

// Fetch every requested feed, tolerating individual feed failures so one dead
// feed doesn't blank the whole list. Returns { episodes, errors }.
export async function fetchEpisodes(feeds) {
  const results = await Promise.allSettled(feeds.map((f) => fetchFeed(f)));
  const episodes = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") episodes.push(...r.value);
    else errors.push(`${feeds[i].name}: ${r.reason.message || r.reason}`);
  });
  episodes.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { episodes, errors };
}
