use anyhow::{bail, Context, Result};
use clap::Parser;
use std::fs;
use std::path::PathBuf;

/// Use Claude API to generate CPE submission summaries for Security Now episodes.
///
/// Reads episode markdown files and appends a "## CPE Submission" section with
/// a concise summary suitable for ISC2 CPE submission.
#[derive(Parser)]
#[command(version, about)]
struct Args {
    /// Episode markdown files to summarize
    #[arg(required = true)]
    files: Vec<PathBuf>,

    /// Overwrite existing CPE Submission sections
    #[arg(long)]
    force: bool,

    /// Playback speed multiplier (e.g. 1.25 for 1.25x speed)
    #[arg(long, default_value = "1.25")]
    speed: f64,
}

const CPE_SECTION_HEADER: &str = "## CPE Submission";

fn main() -> Result<()> {
    let args = Args::parse();

    let api_key = std::env::var("ANTHROPIC_API_KEY")
        .context("ANTHROPIC_API_KEY environment variable not set")?;

    if args.speed <= 0.0 {
        bail!("--speed must be positive");
    }

    for file in &args.files {
        process_file(file, &api_key, args.force, args.speed)?;
    }

    Ok(())
}

fn process_file(path: &PathBuf, api_key: &str, force: bool, speed: f64) -> Result<()> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read {path:?}"))?;

    if content.contains(CPE_SECTION_HEADER) && !force {
        eprintln!("Skipping {path:?}: already has CPE Submission section (use --force to overwrite)");
        return Ok(());
    }

    let content = if force {
        strip_existing_cpe_section(&content)
    } else {
        content
    };

    let cpe_section = generate_cpe_summary(&content, api_key, speed)?;

    let updated = format!("{}\n{cpe_section}\n", content.trim_end());
    fs::write(path, &updated)
        .with_context(|| format!("Failed to write {path:?}"))?;

    eprintln!("Added CPE Submission section to {path:?}");
    Ok(())
}

/// Remove an existing CPE Submission section from the markdown.
fn strip_existing_cpe_section(content: &str) -> String {
    if let Some(idx) = content.find(CPE_SECTION_HEADER) {
        // Find the next h2 section after CPE Submission, or end of file
        let rest = &content[idx + CPE_SECTION_HEADER.len()..];
        let end = rest.find("\n## ").map(|i| idx + CPE_SECTION_HEADER.len() + i);
        match end {
            Some(end_idx) => format!("{}{}", &content[..idx], &content[end_idx..]),
            None => content[..idx].to_string(),
        }
    } else {
        content.to_string()
    }
}

/// Calculate CPE credits from episode duration and playback speed.
///
/// Credits = floor(duration_minutes / speed / 60)
/// e.g. a 110-minute episode at 1.25x = 88 minutes = 1 CPE credit
fn calculate_cpe_credits(duration_minutes: f64, speed: f64) -> u32 {
    let actual_minutes = duration_minutes / speed;
    (actual_minutes / 60.0).floor() as u32
}

/// Call Claude API to generate a CPE submission summary from episode content.
fn generate_cpe_summary(episode_content: &str, api_key: &str, speed: f64) -> Result<String> {
    // TODO: Implement Claude API call
    //
    // Expected approach using the Anthropic Messages API:
    //
    //   let client = reqwest::blocking::Client::new();
    //   let response = client
    //       .post("https://api.anthropic.com/v1/messages")
    //       .header("x-api-key", api_key)
    //       .header("anthropic-version", "2023-06-01")
    //       .header("content-type", "application/json")
    //       .json(&serde_json::json!({
    //           "model": "claude-sonnet-4-20250514",
    //           "max_tokens": 1024,
    //           "messages": [{
    //               "role": "user",
    //               "content": format!(
    //                   "Given this Security Now podcast episode information, generate a CPE \
    //                    submission entry for ISC2 CISSP continuing education.\n\n\
    //                    The listener plays the episode at {speed}x speed. The actual listening \
    //                    duration should be calculated as: episode_duration / {speed}. \
    //                    CPE credits are rounded DOWN to the nearest whole hour of actual \
    //                    listening time.\n\n\
    //                    Output ONLY the markdown section (no ```markdown fences) with these fields:\n\
    //                    - Activity Title (concise)\n\
    //                    - Completion Date\n\
    //                    - CPE Credits (whole hours, rounded down, based on actual listening time)\n\
    //                    - Playback Speed: {speed}x\n\
    //                    - Actual Listening Time (episode duration / {speed})\n\
    //                    - Domain (map to relevant CISSP domain(s))\n\
    //                    - Description (2-3 sentences suitable for ISC2)\n\n\
    //                    Episode content:\n{episode_content}"
    //               )
    //           }]
    //       }))
    //       .send()?;
    //
    //   Parse the response and extract the text content.

    eprintln!("WARNING: Claude API call not yet implemented");

    let _ = (episode_content, api_key, speed); // suppress unused warnings

    bail!(
        "Claude API integration not yet implemented. \
         Set ANTHROPIC_API_KEY and implement the API call in generate_cpe_summary()."
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cpe_credits_at_1x() {
        assert_eq!(calculate_cpe_credits(60.0, 1.0), 1);
        assert_eq!(calculate_cpe_credits(119.0, 1.0), 1);
        assert_eq!(calculate_cpe_credits(120.0, 1.0), 2);
        assert_eq!(calculate_cpe_credits(59.0, 1.0), 0);
    }

    #[test]
    fn test_cpe_credits_at_1_25x() {
        // 120 min episode at 1.25x = 96 min actual = 1 credit
        assert_eq!(calculate_cpe_credits(120.0, 1.25), 1);
        // 75 min episode at 1.25x = 60 min actual = 1 credit
        assert_eq!(calculate_cpe_credits(75.0, 1.25), 1);
        // 74 min episode at 1.25x = 59.2 min actual = 0 credits
        assert_eq!(calculate_cpe_credits(74.0, 1.25), 0);
        // 150 min episode at 1.25x = 120 min actual = 2 credits
        assert_eq!(calculate_cpe_credits(150.0, 1.25), 2);
    }

    #[test]
    fn test_cpe_credits_at_2x() {
        // 120 min at 2x = 60 min = 1 credit
        assert_eq!(calculate_cpe_credits(120.0, 2.0), 1);
        // 119 min at 2x = 59.5 min = 0 credits
        assert_eq!(calculate_cpe_credits(119.0, 2.0), 0);
    }
}
