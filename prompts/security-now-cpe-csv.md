# Agent prompt: build a Security Now CISSP CPE CSV

Copy the prompt below into an agent that can browse GRC and write a local CSV. Provide the date range and current CSV, if any. Keep the output outside this public repository; it contains your certification activity.

## Inputs to provide

- `cycle_start`: `2025-09-01` for this log and CLI.
- `first_release_date` and `last_release_date`: inclusive Security Now release-date range.
- `as_of_date`: date through which listening is being evaluated, in local time.
- `playback_speed`: `1.25`. The CLI validates this exact speed.
- `listening_pattern`: “I listen during the Monday–Sunday week after release.”
- `excluded_episodes_or_types`: for example, the nonsecurity vitamin D special and year-in-review episodes.
- `existing_csv`: optional current CSV to extend; provide the actual file, not just a filename.
- `portal_evidence`: optional ISC2 accepted transcript/export or specific confirmation evidence. Without it, submission fields stay blank.
- `output_path`: path for the resulting CSV, outside the Git repository.

## Prompt

You are building a factual, auditable Security Now listening log for CISSP Group A CPE. Generate a UTF-8 CSV at the requested `output_path`; do not submit CPEs or claim that the user listened on an exact date.

Use GRC’s Security Now current-year archive and per-year archive pages as the primary source for episode number, title, release date, published duration, and archive URL. Use an official episode page or feed to resolve missing facts. Record the source URL in `archive_url`. Cross-check episode numbers and dates, including year boundaries. Never invent a duration or title. If a fact cannot be verified, leave its numeric field blank and make the row ineligible pending verification.

If `existing_csv` is supplied, treat it as the authoritative state for previous rows. Preserve each existing episode’s submission status, `final_cpe_claim`, exact listening information, and evidence notes. Add new episodes and correct source facts only where supported; flag discrepancies rather than silently overwriting a confirmed row. Never infer that an episode was submitted merely because it is old or because it appears in a podcast archive. Only explicit portal evidence may establish a new submission status. Do not duplicate episode numbers.

Produce one row per episode, sorted by numeric `episode`, with exactly these columns in this order (no index column):

```csv
credential,cpe_group,episode,release_date,title,archive_url,published_duration_minutes,estimated_minutes_at_1.25x,provisional_cpe_half_hours,estimated_listening_week_start,estimated_listening_week_end,listened_on,actual_eligible_minutes,final_cpe_claim,submitted_to_isc2,notes_or_evidence
```

Set `credential` to `CISSP`. For a security episode with enough verified data, set `cpe_group` to `Group A`. For a nonsecurity special or year-in-review episode, set `cpe_group` to `Not eligible`, credit to `0.0` where duration is known, leave final/submission fields blank, and state the reason in `notes_or_evidence`. For an episode lacking a verified duration or other required fact, set `cpe_group` to `Needs verification`, leave provisional credit blank, and explain what is missing.

Apply the cycle boundary to the **release date**: episodes released before `cycle_start` are outside this log’s eligible cycle even if the estimated listening week overlaps the cycle. Keep them as historical rows if they fall in the requested release range; note that they are outside the cycle. Do not mark them submitted.

For a typical Tuesday release, the estimated listening window is the Monday through Sunday of the **next calendar week**. Calculate the same rule for any release weekday. Put those ISO dates in `estimated_listening_week_start` and `estimated_listening_week_end`. This is an estimated window, not proof of an exact listening day. Leave `listened_on` and `actual_eligible_minutes` empty unless the user supplies those facts.

For eligible rows, compute `estimated_minutes_at_1.25x = published_duration_minutes / 1.25` (the column name is historical; do not use a different speed without changing the CLI). Compute `provisional_cpe_half_hours = floor((published_duration_minutes / 1.25) / 30) * 0.5`, using the unrounded division result. Render the estimated minutes to one decimal place and CPE to one decimal place. Example: 157 minutes at 1.25× is 125.6 minutes and 2.0 CPE. Do not round CPE upward.

If the estimated listening week has not fully ended by `as_of_date`, retain the row but say the window is incomplete and leave submission fields blank. Do not describe an estimated week as confirmed listening. An incomplete window can be reconsidered in a later update; do not use a permanent exclusion note for it.

Pending rows have empty `final_cpe_claim` and `submitted_to_isc2`. An already accepted row may contain the portal’s actual credit in `final_cpe_claim`, a nonempty accepted status in `submitted_to_isc2`, and the concrete confirmation in `notes_or_evidence`. Preserve pre-existing accepted rows even if the portal title differs from the GRC episode title; flag any credit discrepancy for review.

Validate the output before finishing: parse the CSV again, confirm the exact header and unique ascending numeric episode numbers, check ISO dates and Monday–Sunday windows, recompute every provisional credit from the raw duration and speed, and confirm exclusions cannot appear as eligible pending rows. Summarize row counts (eligible pending, accepted, excluded/needs verification) and list unresolved source discrepancies. Do not put credentials, cookies, or browser session data in the CSV.

## Example inputs for the current log

- `cycle_start`: `2025-09-01`
- `first_release_date`: `2025-08-01`
- `last_release_date`: `2026-11-30`
- `as_of_date`: the date you generate or refresh the log
- `playback_speed`: `1.25`
- `listening_pattern`: following-week Monday–Sunday estimated window
- `excluded_episodes_or_types`: vitamin D nonsecurity special and year-in-review episodes
- `existing_csv`: your latest local `security-now-isc2-cpe-log-2025-08-to-2026-11.csv`, if updating it

The current CLI is specific to the September 2025 cycle and 1.25× playback. For a different cycle or speed, update its validation rules along with this prompt.

After generation, run `uv run sn_cpe.py list --csv /path/to/output.csv`. Run `sync` against ISC2 before submitting if you have manually added CPEs. The CLI uses `Group A`, the date window, and the provisional credit fields to decide what is available.
