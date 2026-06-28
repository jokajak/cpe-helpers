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

// Security Now episode number, from itunes:episode if present, else parsed from
// the title (e.g. "SN 1234: …", "Security Now 1234: …", or a bare 3-4 digit no.).
export function parseEpisodeNumber(title, itunesEpisode) {
  const ep = String(itunesEpisode || "").trim();
  if (/^\d+$/.test(ep)) return ep;
  const t = String(title || "");
  const m =
    t.match(/\b(?:SN|Security\s*Now)\s*#?\s*(\d{2,4})\b/i) ||
    t.match(/#\s*(\d{2,4})\b/) ||
    t.match(/\b(\d{3,4})\b/);
  return m ? m[1] : null;
}

// Build a Security Now CPE title prefixed "SN-<number>:", stripping any episode
// label already present in the base topic so the number isn't duplicated.
export function snTitle(episodeNumber, baseTitle) {
  const base = String(baseTitle || "").trim();
  const body =
    base.replace(/^\s*(?:(?:security\s*now|sn)\s*)?#?\s*\d{2,4}\s*[:.\-–]*\s*/i, "").trim() || base;
  return `SN-${episodeNumber}: ${body}`;
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
    const itunesEpisode = textOf(childByLocalName(item, "episode")); // itunes:episode
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
      // Only Security Now needs an episode number (for the "SN-<n>" title prefix).
      episodeNumber: feed.id === "security-now" ? parseEpisodeNumber(title, itunesEpisode) : null,
      description: stripHtml(description),
    };
  });
}

// ---- Security Now archive (grc.com) -------------------------------------
// The TWiT RSS only carries the newest ~10 episodes. To reach older ones we
// parse GRC's per-year archive pages. Structure (per the long-standing GRC
// layout): each episode is anchored by <a name="<number>">, followed by a
// pipe-delimited "episode | date | length" header, a <font size="2"> title and
// a <font size="1"> description.

export function grcUrlForYear(year, currentYear = new Date().getFullYear()) {
  return Number(year) >= Number(currentYear)
    ? "https://www.grc.com/securitynow.htm"
    : `https://www.grc.com/sn/past/${year}.htm`;
}

// Pull the date and duration (in whole minutes) out of an episode's header text.
// A "h:mm:ss" / "mm:ss" token is a clock time; "NN min" is already minutes
// (don't route it through parseDurationToMinutes, which treats a bare integer as
// seconds).
export function parseGrcHeader(text) {
  const s = String(text || "");
  let durationMinutes = null;
  const clock = s.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
  if (clock) {
    durationMinutes = parseDurationToMinutes(clock[1]);
  } else {
    const mins = s.match(/\b(\d{2,3})\s*min(?:ute)?s?\b/i);
    if (mins) durationMinutes = parseInt(mins[1], 10);
  }
  const date =
    (s.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
      s.match(
        /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i
      ) ||
      s.match(
        /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\b/i
      ) ||
      [])[1] || "";
  return { date, durationMinutes };
}

// Parse a GRC archive page's HTML into episode objects (same shape as the RSS
// path). Groups DOM nodes by the most recent episode anchor, so it tolerates
// variation in the exact table nesting.
export function parseGrcEpisodes(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body || doc.documentElement;
  if (!root) return [];

  const raw = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.number) raw.push(cur);
  };
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === 1) {
      const tag = node.tagName;
      if (tag === "A" && /^\d+$/.test(node.getAttribute("name") || "")) {
        flush();
        cur = { number: node.getAttribute("name"), header: "", title: "", description: "" };
        continue;
      }
      if (cur && tag === "FONT") {
        const size = node.getAttribute("size");
        if (size === "2" && !cur.title) cur.title = node.textContent.trim();
        else if (size === "1" && !cur.description) cur.description = node.textContent.trim();
      }
    } else if (cur && !cur.title) {
      // Accumulate text before the title font — the header lives here.
      cur.header += " " + node.textContent;
    }
  }
  flush();

  return raw
    .map((e) => {
      const { date, durationMinutes } = parseGrcHeader(e.header);
      return {
        feedId: "security-now",
        podcast: "Security Now",
        provider: "Security Now",
        title: e.title || `Security Now ${e.number}`,
        link: `https://www.grc.com/sn/sn-${e.number}.htm`,
        guid: `grc-sn-${e.number}`,
        date: toIsoDate(date),
        durationMinutes,
        episodeNumber: e.number,
        description: stripHtml(e.description),
      };
    })
    .sort((a, b) => Number(b.episodeNumber) - Number(a.episodeNumber));
}

// Fetch and parse one year of Security Now episodes from grc.com.
export async function fetchSecurityNowYear(year) {
  const url = grcUrlForYear(year);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to fetch Security Now ${year}: HTTP ${res.status}`);
  return parseGrcEpisodes(await res.text());
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
