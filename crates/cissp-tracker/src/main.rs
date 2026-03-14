use anyhow::{bail, Context, Result};
use chrono::NaiveDate;
use clap::{Parser, Subcommand};
use std::fs;
use std::path::PathBuf;

/// Track CISSP CPE progress in a simple markdown document.
#[derive(Parser)]
#[command(version, about)]
struct Args {
    /// Path to the tracker markdown file
    #[arg(long, default_value = "./tracker/cissp-cpes.md")]
    file: PathBuf,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Initialize a new CISSP CPE tracker
    Init {
        /// Start of certification period (YYYY-MM-DD)
        #[arg(long)]
        start: String,

        /// End of certification period (YYYY-MM-DD)
        #[arg(long)]
        end: String,

        /// Total CPEs required for the certification period
        #[arg(long, default_value = "40")]
        required: u32,
    },

    /// Add a CPE entry to the tracker
    Add {
        /// Number of CPE credits
        #[arg(long)]
        credits: u32,

        /// Title/description of the CPE activity
        #[arg(long)]
        title: String,

        /// Date of the CPE activity (YYYY-MM-DD)
        #[arg(long)]
        date: String,
    },

    /// Show current CPE progress
    Status,
}

struct TrackerData {
    period_start: String,
    period_end: String,
    required: u32,
    entries: Vec<CpeEntry>,
}

struct CpeEntry {
    date: String,
    title: String,
    credits: u32,
}

fn main() -> Result<()> {
    let args = Args::parse();

    match args.command {
        Command::Init {
            start,
            end,
            required,
        } => init_tracker(&args.file, &start, &end, required),
        Command::Add {
            credits,
            title,
            date,
        } => add_entry(&args.file, &date, &title, credits),
        Command::Status => show_status(&args.file),
    }
}

fn init_tracker(path: &PathBuf, start: &str, end: &str, required: u32) -> Result<()> {
    // Validate dates
    NaiveDate::parse_from_str(start, "%Y-%m-%d")
        .with_context(|| format!("Invalid start date: {start}"))?;
    NaiveDate::parse_from_str(end, "%Y-%m-%d")
        .with_context(|| format!("Invalid end date: {end}"))?;

    if path.exists() {
        bail!("Tracker file already exists: {path:?}. Delete it first to reinitialize.");
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let content = render_tracker(&TrackerData {
        period_start: start.to_string(),
        period_end: end.to_string(),
        required,
        entries: vec![],
    });

    fs::write(path, &content)?;
    eprintln!("Initialized tracker at {path:?}");
    Ok(())
}

fn add_entry(path: &PathBuf, date: &str, title: &str, credits: u32) -> Result<()> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .with_context(|| format!("Invalid date: {date}"))?;

    let mut tracker = parse_tracker(path)?;
    tracker.entries.push(CpeEntry {
        date: date.to_string(),
        title: title.to_string(),
        credits,
    });

    let content = render_tracker(&tracker);
    fs::write(path, &content)?;

    let submitted: u32 = tracker.entries.iter().map(|e| e.credits).sum();
    let remaining = tracker.required.saturating_sub(submitted);
    eprintln!("Added {credits} CPE(s): \"{title}\"");
    eprintln!("Progress: {submitted}/{} ({remaining} remaining)", tracker.required);
    Ok(())
}

fn show_status(path: &PathBuf) -> Result<()> {
    let tracker = parse_tracker(path)?;
    let submitted: u32 = tracker.entries.iter().map(|e| e.credits).sum();
    let remaining = tracker.required.saturating_sub(submitted);

    println!("CISSP CPE Status");
    println!("  Period:    {} to {}", tracker.period_start, tracker.period_end);
    println!("  Required:  {}", tracker.required);
    println!("  Submitted: {submitted}");
    println!("  Remaining: {remaining}");
    println!("  Entries:   {}", tracker.entries.len());
    Ok(())
}

fn render_tracker(data: &TrackerData) -> String {
    let submitted: u32 = data.entries.iter().map(|e| e.credits).sum();
    let remaining = data.required.saturating_sub(submitted);

    let mut md = format!(
        "# CISSP CPE Tracker\n\
         \n\
         ## Status\n\
         - **Certification Period:** {} to {}\n\
         - **CPEs Required:** {}\n\
         - **CPEs Submitted:** {}\n\
         - **CPEs Remaining:** {}\n\
         \n\
         ## CPE Log\n\
         | Date | Title | Credits |\n\
         |------|-------|--------:|\n",
        data.period_start, data.period_end, data.required, submitted, remaining
    );

    for entry in &data.entries {
        md.push_str(&format!(
            "| {} | {} | {} |\n",
            entry.date, entry.title, entry.credits
        ));
    }

    md
}

fn parse_tracker(path: &PathBuf) -> Result<TrackerData> {
    let content =
        fs::read_to_string(path).with_context(|| format!("Tracker not found: {path:?}. Run 'cissp-tracker init' first."))?;

    let mut period_start = String::new();
    let mut period_end = String::new();
    let mut required: u32 = 40;
    let mut entries = Vec::new();
    let mut in_table = false;

    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("- **Certification Period:** ") {
            if let Some((s, e)) = rest.split_once(" to ") {
                period_start = s.trim().to_string();
                period_end = e.trim().to_string();
            }
        } else if let Some(rest) = line.strip_prefix("- **CPEs Required:** ") {
            required = rest.trim().parse().unwrap_or(40);
        } else if line.starts_with("|---") {
            in_table = true;
        } else if in_table && line.starts_with('|') {
            let cols: Vec<&str> = line.split('|').collect();
            // cols[0] is empty (before first |), cols[1]=date, cols[2]=title, cols[3]=credits
            if cols.len() >= 4 {
                let date = cols[1].trim().to_string();
                let title = cols[2].trim().to_string();
                let credits: u32 = cols[3].trim().parse().unwrap_or(0);
                if credits > 0 {
                    entries.push(CpeEntry {
                        date,
                        title,
                        credits,
                    });
                }
            }
        }
    }

    Ok(TrackerData {
        period_start,
        period_end,
        required,
        entries,
    })
}
