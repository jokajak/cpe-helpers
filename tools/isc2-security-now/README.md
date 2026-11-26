# Security Now → ISC2 CPE, one episode at a time

This optional Python CLI opens the ISC2 site in its own Chromium browser profile. You
sign in normally. It never reads your browser cookie jar or imports cookies from
developer tools. The `submit` command submits only the episode you specify.

## Setup

Use Python 3.10+ from this directory:

```sh
uv run --with "playwright>=1.50,<2" python -m playwright install chromium
uv run sn_cpe.py login
```

The first command installs the Chromium browser binary once. `uv run` reads the
script’s PEP 723 metadata and installs its Python dependency automatically.
`login` lets you sign in in a dedicated browser window. The browser profile
persists at `~/.sn-cpe-browser`. Keep that directory private. If ISC2 logs you
out, run `login` again.

## Before a session: reconcile your transcript

Copy the `termId` value from your CISSP transcript URL. Set it in your shell or pass `--term-id VALUE` to `sync`:

```sh
export ISC2_TERM_ID='your-term-id'
uv run sn_cpe.py sync --csv /path/to/current.csv
```

`sync` reads every page of your CISSP transcript once and updates the local
CSV for accepted entries whose titles contain a Security Now episode number
(such as `SN-1075`). It does not submit anything or change the portal. It
reports ambiguous duplicate entries and nonaccepted statuses for manual review.
If an accepted portal credit differs from the planned CSV credit, it records
the accepted amount and flags the difference in the CSV note. All page reads
must finish before it writes the CSV.

## Submit one episode

```sh
uv run sn_cpe.py show 1068 --csv /path/to/current.csv
uv run sn_cpe.py submit 1068 --csv /path/to/current.csv
```

`show` reads only the CSV. `submit` validates the row, prompts for a CISSP
domain, fills the ISC2 form, verifies the review fields, and asks you to type
`SUBMIT`. After the portal displays “CPE Successfully Submitted!”, it updates
the adjacent CSV and exits. It waits until at least 120 seconds after the last
recorded submission by default. For a longer interval:

```sh
uv run sn_cpe.py submit 1069 --min-gap 300
```

The CSV is intentionally **not** in this public repository. Download your
current CSV, then pass `--csv /path/to/current.csv` to `sync`, `show`, and
`submit`. Alternatively place it beside `sn_cpe.py` with the default name
shown by `uv run sn_cpe.py --help`. The script updates only that local file.

## Manual submissions and uncertain outcomes

Run `sync` before each session to capture manual submissions. The `submit`
command trusts the CSV status and does no transcript scan itself. If a manual
entry has no recognizable episode number in its portal title, mark its
`submitted_to_isc2` cell yourself before using `submit` for that episode.

Just before clicking Submit, the CLI writes a
`*.submission-journal.json` next to the CSV. If it crashes or the confirmation
page never appears, it blocks further submissions. Run `sync`: if the
episode appears as Accepted, it updates the CSV and clears the journal. If it
does not, inspect the portal yourself and resolve the journal manually. This
avoids an automatic retry after an uncertain submission.

The default 120-second gap is based on timestamps recorded in the CSV. If you
submitted manually very recently, wait two full minutes from that submission
before invoking the CLI, or use `--min-gap` with a suitable value.

The form selectors reflect the portal as observed on November 26, 2026. If
ISC2 changes its UI, the script stops; review its browser window before
retrying. It does not use ISC2 private APIs.
