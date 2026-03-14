use anyhow::{Context, Result};
use chrono::NaiveDate;
use clap::Parser;
use serde::Serialize;

/// List Security Now episodes from grc.com since a given date.
///
/// Outputs one JSON object per line to stdout, suitable for piping to sn-fetch.
#[derive(Parser)]
#[command(version, about)]
struct Args {
    /// Only include episodes on or after this date (YYYY-MM-DD)
    #[arg(long, default_value = "2025-09-01")]
    since: String,
}

#[derive(Debug, Serialize)]
struct Episode {
    episode: u32,
    date: String,
    title: String,
    url: String,
}

fn main() -> Result<()> {
    let args = Args::parse();

    let since = NaiveDate::parse_from_str(&args.since, "%Y-%m-%d")
        .with_context(|| format!("Invalid date format: {}", args.since))?;

    let episodes = fetch_episode_list(since)?;

    for ep in &episodes {
        let json = serde_json::to_string(ep)?;
        println!("{json}");
    }

    eprintln!("Listed {} episodes since {since}", episodes.len());
    Ok(())
}

/// Fetch and parse the Security Now episode archive from grc.com.
///
/// The archive page at https://www.grc.com/securitynow.htm lists episodes
/// organized by year. This function needs to:
/// 1. Fetch the archive page(s) for relevant years
/// 2. Parse the HTML to extract episode numbers, dates, titles, and URLs
/// 3. Filter to episodes on or after `since`
fn fetch_episode_list(since: NaiveDate) -> Result<Vec<Episode>> {
    // TODO: Implement HTML scraping of grc.com/securitynow.htm
    //
    // The archive page structure needs to be examined to determine:
    // - How episodes are listed (table rows, divs, etc.)
    // - Where episode dates, titles, and links are found
    // - Whether multiple year pages need to be fetched
    //
    // Expected approach:
    //   let client = reqwest::blocking::Client::new();
    //   let html = client.get("https://www.grc.com/securitynow.htm").send()?.text()?;
    //   let document = scraper::Html::parse_document(&html);
    //   // Parse episodes from HTML...
    //
    // For now, return an empty list so the tool compiles and runs.
    eprintln!("WARNING: Episode fetching not yet implemented. Returning empty list.");
    eprintln!("TODO: Implement HTML scraping of grc.com/securitynow.htm");

    let _ = since; // suppress unused warning
    Ok(vec![])
}
