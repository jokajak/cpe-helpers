#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["playwright>=1.50,<2", "beautifulsoup4>=4.12,<5"]
# ///
"""Submit exactly one CSV-listed Security Now episode to ISC2."""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import sys
import tempfile
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Tag

from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import expect, sync_playwright

HOME = "https://cpe.isc2.org/s/"
TRANSCRIPT = "https://cpe.isc2.org/s/cpeportalcpelist"
EPISODE_RE = re.compile(r"\b(?:SN|Security Now)[-\s#:]*(1\d{3})\b", re.I)
DOMAINS = [
    "Security and Risk Management",
    "Asset Security",
    "Security Architecture and Engineering",
    "Communication and Network Security",
    "Identity and Access Management (IAM)",
    "Security Assessment and Testing",
    "Security Operations",
    "Software Development Security",
]
STAMP_RE = re.compile(
    r"(?:Confirmed at|[Ss]ubmission clicked at) (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)"
)


class Stop(Exception):
    pass


def read_csv(path: Path):
    with path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        fields, rows = reader.fieldnames, list(reader)
    needed = {"episode", "submitted_to_isc2", "notes_or_evidence"}
    if not fields or not needed.issubset(fields):
        raise Stop("Unrecognized CPE CSV columns.")
    return fields, rows


def atomic_write(path: Path, content: str):
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", dir=path.parent,
                                     prefix=".sn-cpe-", delete=False) as file:
        tmp = Path(file.name)
        file.write(content)
        file.flush()
        os.fsync(file.fileno())
    os.replace(tmp, path)


def write_csv(path: Path, fields, rows):
    from io import StringIO
    stream = StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    atomic_write(path, stream.getvalue())


def find_row(rows, episode):
    matching = [row for row in rows if row["episode"] == str(episode)]
    if len(matching) != 1:
        raise Stop(f"Expected one CSV row for #{episode}; found {len(matching)}.")
    return matching[0]


def details(row):
    episode = int(row["episode"])
    if row["credential"] != "CISSP" or row["cpe_group"] != "Group A":
        raise Stop("This row is not CISSP Group A.")
    release = date.fromisoformat(row["release_date"])
    if release < date(2025, 9, 1) or episode in (1058, 1105, 1106):
        raise Stop("This row is excluded for this certification cycle.")
    if "year in review" in row["title"].casefold() or "do not" in row["notes_or_evidence"].casefold():
        raise Stop("This row's exclusion note prevents submission.")
    start = date.fromisoformat(row["estimated_listening_week_start"])
    end = date.fromisoformat(row["estimated_listening_week_end"])
    monday = release + timedelta(days=7 - release.weekday())
    if start != monday or end != start + timedelta(days=6) or end >= date.today():
        raise Stop("The following-week Monday–Sunday listening window is invalid or unfinished.")
    duration = float(row["published_duration_minutes"])
    credit = float(row["provisional_cpe_half_hours"])
    calculated = math.floor((duration / 1.25 + 1e-9) / 30) * 0.5
    if credit <= 0 or abs(calculated - credit) > 1e-8:
        raise Stop(f"CSV credit {credit} differs from calculated credit {calculated}.")
    return start, end, credit


def list_available(rows, limit=None):
    available = []
    for row in sorted(rows, key=lambda item: int(item["episode"])):
        if row["submitted_to_isc2"].strip():
            continue
        try:
            start, end, credit = details(row)
        except Stop:
            continue
        available.append((row, start, end, credit))
    selected = available[:limit]
    for row, start, end, credit in selected:
        print(f"#{row['episode']} | {credit:.1f} CPE | {start}–{end} | {row['title']}")
    print(f"{len(available)} eligible pending episodes, "
          f"{sum(item[3] for item in available):.1f} CPE total"
          + (f"; showing first {len(selected)}" if limit is not None else ""))


def last_submission(rows, journal):
    stamps = []
    for row in rows:
        for match in STAMP_RE.finditer(row["notes_or_evidence"]):
            stamps.append(datetime.fromisoformat(match.group(1).replace("Z", "+00:00")))
    if journal.exists():
        attempt = json.loads(journal.read_text(encoding="utf-8"))
        stamps.append(datetime.fromisoformat(attempt["clicked_at"].replace("Z", "+00:00")))
    return max(stamps) if stamps else None


def wait_gap(rows, journal, seconds):
    prior = last_submission(rows, journal)
    if prior:
        remaining = (prior + timedelta(seconds=seconds) - datetime.now(timezone.utc)).total_seconds()
        if remaining > 0:
            print(f"Waiting {math.ceil(remaining)} seconds for the submission gap.", flush=True)
            time.sleep(remaining + 1)


def portal_diagnostic(page):
    # Do not print OAuth query parameters, which may contain temporary codes.
    address = urlsplit(page.url)
    location = f"{address.scheme}://{address.netloc}{address.path}"
    headings = page.get_by_role("heading").all_inner_texts()[:5]
    return f"location={location!r}, title={page.title()!r}, headings={headings!r}"


def open_portal(page, url, ready, description="CISSP portal"):
    """Wait for an authenticated view; allow sign-in in this browser run."""
    page.goto(url, wait_until="domcontentloaded")
    try:
        ready.wait_for(timeout=12000)
        return
    except PlaywrightTimeout:
        print("The expected ISC2 page is not available yet in the open browser.", flush=True)
        input(f"Sign in, open the {description}, then press Enter here: ")
    # A successful sign-in can leave the browser directly on the target page.
    # Avoid another navigation that could discard a short-lived session.
    try:
        ready.wait_for(timeout=3000)
        return
    except PlaywrightTimeout:
        pass
    page.goto(url, wait_until="domcontentloaded")
    try:
        ready.wait_for(timeout=20000)
    except PlaywrightTimeout as error:
        print("Portal diagnostic: " + portal_diagnostic(page), flush=True)
        input("Inspect the browser; press Enter to close it without changing the CSV: ")
        raise Stop(f"The {description} is still unavailable; no changes made.") from error


def transcript_item(cells):
    if len(cells) < 8:
        raise Stop("Unexpected transcript columns; CSV left unchanged.")
    match = EPISODE_RE.search(cells[0])
    credit_text = cells[4].strip().replace(",", "")
    try:
        credit = float(credit_text)
    except ValueError as error:
        raise Stop(f"Unexpected portal credit {credit_text!r}; CSV left unchanged.") from error
    return {
        "episode": int(match.group(1)) if match else None,
        "title": cells[0].strip(),
        "credit": credit,
        "status": cells[7].strip(),
    }


def scan_transcript(page, term_id):
    """Read every page once, without submitting or changing the portal."""
    open_portal(page, f"{TRANSCRIPT}?termId={term_id}",
                page.locator("#cpeTable tr").nth(1), "CISSP transcript")
    entries = []
    while True:
        table_rows = page.locator("#cpeTable tr")
        for tr in table_rows.all()[1:]:
            entries.append(transcript_item([s.strip() for s in tr.locator("td").all_inner_texts()]))
        next_button = page.locator('button.slds-button_neutral:has(svg[data-key="right"])')
        if not next_button.count():
            raise Stop("Transcript pagination control missing; CSV left unchanged.")
        if not next_button.is_enabled():
            break
        marker = page.get_by_text(re.compile(r"Page \d+ of \d+")).first
        old_page = marker.inner_text()
        next_button.click()
        try:
            expect(marker).not_to_have_text(old_page, timeout=15000)
            table_rows.nth(1).wait_for(timeout=15000)
        except (PlaywrightTimeout, AssertionError) as error:
            raise Stop("Transcript pagination stalled; CSV left unchanged.") from error
    return entries


def reconcile_transcript(path, fields, rows, entries, journal):
    by_episode = {}
    for item in entries:
        if item["episode"] is not None:
            by_episode.setdefault(item["episode"], []).append(item)
    updated = []
    ambiguous = []
    for row in rows:
        episode = int(row["episode"])
        matches = by_episode.get(episode, [])
        if not matches or row["submitted_to_isc2"].strip():
            continue
        if len(matches) != 1:
            ambiguous.append(f"#{episode}: {len(matches)} portal entries")
            continue
        item = matches[0]
        if item["status"].casefold() != "accepted":
            ambiguous.append(f"#{episode}: portal status {item['status']!r}")
            continue
        # The portal is authoritative for accepted credits; flag any difference.
        planned = row["provisional_cpe_half_hours"]
        difference = not planned or abs(float(planned) - item["credit"]) > 1e-8
        row["final_cpe_claim"] = f"{item['credit']:.1f}"
        row["submitted_to_isc2"] = "Yes — accepted in portal"
        note = f"Accepted transcript entry {item['title']!r}, {item['credit']:.1f} CPE"
        if difference:
            note += f"; differs from planned {planned or 'blank'} CPE"
        row["notes_or_evidence"] = row["notes_or_evidence"].rstrip(" .") + "; " + note + "."
        updated.append(episode)
    # Commit once, after every page loaded successfully.
    if updated:
        write_csv(path, fields, rows)
    if journal.exists():
        attempt = json.loads(journal.read_text(encoding="utf-8"))
        episode = int(attempt["episode"])
        matches = by_episode.get(episode, [])
        if len(matches) == 1 and matches[0]["status"].casefold() == "accepted":
            journal.unlink()
            print(f"Resolved prior submission journal for #{episode}.")
    print(f"Scanned {len(entries)} portal entries; updated {len(updated)} CSV rows: "
          + (", ".join(f"#{n}" for n in updated) if updated else "none"))
    if ambiguous:
        print("Needs manual review: " + "; ".join(ambiguous), file=sys.stderr)


DOMAIN_KEYWORDS = {
    "Security and Risk Management": ("risk", "governance", "compliance", "privacy",
                                     "regulation", "policy", "framework", "law"),
    "Asset Security": ("data classification", "data retention", "data broker",
                       "data leak", "asset", "data handling"),
    "Security Architecture and Engineering": ("cryptography", "encryption",
        "cipher", "certificate", "pki", "tpm", "firmware", "secure boot", "architecture",
        "attestation", "hardware", "quantum"),
    "Communication and Network Security": ("network", "firewall", "vpn", "dns",
        "routing", "wireless", "router", "tls", "ddos", "protocol", "zero trust"),
    "Identity and Access Management (IAM)": ("authentication", "authorization",
        "passkey", "password", "identity", "credential", "access control",
        "least privilege", "mfa", "sso", "oauth", "login"),
    "Security Assessment and Testing": ("penetration test", "pentest", "audit",
        "vulnerability", "scanning", "bug bounty", "cve", "disclosure", "red team"),
    "Security Operations": ("incident", "malware", "ransomware", "breach",
        "detection", "response", "backup", "patch", "phishing", "exploit", "attack"),
    "Software Development Security": ("software", "source code", "developer",
        "appsec", "supply chain", "dependency", "injection", "fuzzing", "coding"),
}


def fetch_episode_description(row):
    """Use the one episode's GRC archive entry; never synthesize its topics."""
    url = row["archive_url"]
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in ("grc.com", "www.grc.com"):
        raise Stop(f"Untrusted archive URL for #{row['episode']}: {url}")
    try:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0 (Security Now CPE helper)"})
        with urlopen(request, timeout=25) as response:
            soup = BeautifulSoup(response.read(), "html.parser")
    except (OSError, URLError) as error:
        raise Stop(f"Could not read GRC's episode description: {error}") from error
    anchor = soup.find("a", attrs={"name":str(row["episode"])})
    if anchor is None:
        raise Stop(f"Episode #{row['episode']} was not found in the GRC archive.")
    for element in anchor.next_elements:
        if not isinstance(element, Tag):
            continue
        if element is not anchor and element.name == "a" and str(element.get("name", "")).isdigit():
            break
        if element.name != "font" or element.get("size") != "1":
            continue
        title = element.find("font", attrs={"size":"2"})
        if title is None:
            continue
        text = element.get_text(" ", strip=True)
        heading = title.get_text(" ", strip=True)
        if text.startswith(heading):
            text = text[len(heading):]
        text = re.sub(r"\s+", " ", text).strip(" •-–—")
        if len(text) >= 25:
            return text
    raise Stop(f"GRC has no usable description for episode #{row['episode']}; no submission made.")


def choose_domain(row, description, given=None):
    if given:
        if given not in DOMAINS:
            raise Stop("Unknown domain label.")
        return given
    title, body = row["title"].casefold(), description.casefold()
    scores = {
        domain: sum(3 * (phrase in title) + (phrase in body)
                    for phrase in phrases)
        for domain, phrases in DOMAIN_KEYWORDS.items()
    }
    winner = max(DOMAINS, key=lambda domain: scores[domain])
    return winner if scores[winner] else "Security Operations"


def build_summary(row, description):
    topics = [part.strip(" .;•") for part in description.split("•") if part.strip(" .;•")]
    if len(topics) > 5:
        topics = topics[:4] + topics[-1:]
    body = "; ".join(topics) if len(topics) > 1 else description
    summary = f"Security Now #{row['episode']} ({row['title']}): {body}"
    if len(summary) > 750:
        summary = summary[:747].rsplit(" ", 1)[0].rstrip(" ,;") + "..."
    return summary


def enter_date(field, value):
    formatted = f"{value:%b} {value.day}, {value.year}"
    field.fill("")
    field.press_sequentially(formatted, delay=30)
    field.press("Tab")
    if str(value.year) not in field.input_value():
        raise Stop("Portal date field did not accept the listening date.")


def submit_form(page, row, start, end, credit, domain, summary, journal):
    card = page.get_by_role("button", name=re.compile("CISSP Logo"))
    open_portal(page, HOME, card)
    card.click(timeout=20000)
    enter_date(page.get_by_role("textbox", name="Start Date"), start)
    enter_date(page.get_by_role("textbox", name="End Date"), end)
    page.get_by_role("button", name="Save & Continue").click()
    page.get_by_role("combobox", name="Choose a category:").click()
    page.get_by_text("Education", exact=True).click()
    page.get_by_role("radio", name="Online webinars, podcasts and other online materials").check()
    page.get_by_role("textbox", name="Title").fill(f"SN-{row['episode']} {row['title']}")
    page.get_by_role("textbox", name="Presenter").fill("Steve Gibson")
    page.get_by_role("textbox", name="Year Published").fill(row["release_date"][:4])
    page.get_by_role("spinbutton", name="Credits").fill(f"{credit:.1f}")
    page.get_by_role("textbox", name="Summary").fill(summary)
    page.get_by_role("button", name="Save & Continue").click()
    page.get_by_text(domain, exact=True).click()
    page.get_by_role("button", name="Save & Continue").click()
    review = page.locator("body").inner_text(timeout=10000)
    for expected in (f"SN-{row['episode']}", f"{credit:.1f}",
                     f"{start.month}/{start.day}/{start.year}",
                     f"{end.month}/{end.day}/{end.year}", domain):
        if expected not in review:
            raise Stop(f"Portal review page missing {expected!r}; no submission made.")
    if input(f"Submit only #{row['episode']} for {credit:.1f} CPE? Type SUBMIT: ").strip() != "SUBMIT":
        raise Stop("Canceled at review; no submission made.")
    clicked = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    atomic_write(journal, json.dumps({"episode": int(row["episode"]),
                                      "clicked_at": clicked, "credit": credit}, indent=2))
    page.get_by_role("button", name="Submit CPE").click()
    try:
        page.get_by_role("heading", name="CPE Successfully Submitted!").wait_for(timeout=20000)
    except PlaywrightTimeout as error:
        raise Stop("Outcome unknown. Journal kept; inspect the portal and CSV manually.") from error
    confirmed = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    return clicked, confirmed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("login", "sync", "list", "show", "submit"))
    parser.add_argument("episode", type=int, nargs="?")
    parser.add_argument("--csv", type=Path, default=Path(__file__).with_name(
        "security-now-isc2-cpe-log-2025-08-to-2026-11.csv"))
    parser.add_argument("--profile", type=Path, default=Path.home() / ".sn-cpe-browser")
    parser.add_argument("--domain", help="Override the automatically selected CISSP domain")
    parser.add_argument("--min-gap", type=int, default=120, help="Seconds; minimum 120")
    parser.add_argument("--limit", type=int, help="For list, show only the first N episodes")
    parser.add_argument("--term-id", default=os.environ.get("ISC2_TERM_ID"),
                        help="ISC2 CISSP transcript term ID (or ISC2_TERM_ID environment variable)")
    args = parser.parse_args()
    if args.command in ("show", "submit") and args.episode is None:
        parser.error("show/submit requires exactly one episode number")
    if args.command in ("login", "sync", "list") and args.episode is not None:
        parser.error("login/sync/list takes no episode number")
    if args.min_gap < 120:
        parser.error("Minimum submission gap is 120 seconds.")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be a positive number")
    if args.command == "login":
        with sync_playwright() as p:
            context = p.chromium.launch_persistent_context(str(args.profile.expanduser()), headless=False)
            try:
                page = context.pages[0] if context.pages else context.new_page()
                page.goto(HOME)
                print("Sign in in the browser, then press Enter here.")
                input()
                card = page.get_by_role("button", name=re.compile("CISSP Logo"))
                open_portal(page, HOME, card)
                print("CISSP portal visible in this window. Sync and submit can also prompt for sign-in.")
            finally:
                context.close()
        return
    path = args.csv.resolve()
    fields, rows = read_csv(path)
    journal = path.with_suffix(".submission-journal.json")
    if args.command == "list":
        if journal.exists():
            attempt = json.loads(journal.read_text(encoding="utf-8"))
            raise Stop(f"Unresolved submission attempt for #{attempt['episode']}; "
                       "run sync or inspect the portal before listing available episodes.")
        list_available(rows, args.limit)
        return
    if args.command == "sync":
        if not args.term_id or not re.fullmatch(r"[A-Za-z0-9]+", args.term_id):
            raise Stop("Set ISC2_TERM_ID from your CISSP transcript URL or pass --term-id.")
        with sync_playwright() as p:
            context = p.chromium.launch_persistent_context(str(args.profile.expanduser()), headless=False)
            try:
                page = context.pages[0] if context.pages else context.new_page()
                entries = scan_transcript(page, args.term_id)
                reconcile_transcript(path, fields, rows, entries, journal)
            finally:
                context.close()
        return
    row = find_row(rows, args.episode)
    if row["submitted_to_isc2"].strip():
        print(f"#{args.episode} is marked submitted in the CSV; nothing submitted.")
        return
    start, end, credit = details(row)
    print(f"#{args.episode}: {row['title']} | estimated {start} to {end} | {credit:.1f} CPE")
    if args.command == "show":
        return
    if journal.exists():
        previous = json.loads(journal.read_text(encoding="utf-8"))
        raise Stop(f"Unresolved submission attempt for #{previous['episode']}. "
                   "Inspect the portal and update the CSV manually before retrying.")
    description = fetch_episode_description(row)
    domain = choose_domain(row, description, args.domain)
    summary = build_summary(row, description)
    print(f"Domain: {domain}\nSummary: {summary}")
    wait_gap(rows, journal, args.min_gap)
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(str(args.profile.expanduser()), headless=False)
        try:
            page = context.pages[0] if context.pages else context.new_page()
            clicked, confirmed = submit_form(page, row, start, end, credit, domain, summary, journal)
            row["final_cpe_claim"] = f"{credit:.1f}"
            row["submitted_to_isc2"] = "Yes — portal confirmed"
            row["notes_or_evidence"] = (
                row["notes_or_evidence"].rstrip(" .") +
                f"; Confirmed at {confirmed}; submission clicked at {clicked}."
            )
            write_csv(path, fields, rows)
            journal.unlink()
            print(f"#{args.episode} confirmed at {confirmed}; CSV updated. Done.")
        finally:
            context.close()


if __name__ == "__main__":
    try:
        main()
    except (Stop, PlaywrightTimeout) as error:
        print(f"Stopped: {error}", file=sys.stderr)
        sys.exit(1)
