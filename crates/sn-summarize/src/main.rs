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
}

const CPE_SECTION_HEADER: &str = "## CPE Submission";

fn main() -> Result<()> {
    let args = Args::parse();

    let api_key = std::env::var("ANTHROPIC_API_KEY")
        .context("ANTHROPIC_API_KEY environment variable not set")?;

    for file in &args.files {
        process_file(file, &api_key, args.force)?;
    }

    Ok(())
}

fn process_file(path: &PathBuf, api_key: &str, force: bool) -> Result<()> {
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

    let cpe_section = generate_cpe_summary(&content, api_key)?;

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

/// Call Claude API to generate a CPE submission summary from episode content.
fn generate_cpe_summary(episode_content: &str, api_key: &str) -> Result<String> {
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
    //                    Output ONLY the markdown section with these fields:\n\
    //                    - Activity Title (concise)\n\
    //                    - Completion Date\n\
    //                    - CPE Credits (based on duration, 1 credit per hour)\n\
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

    let _ = (episode_content, api_key); // suppress unused warnings

    bail!(
        "Claude API integration not yet implemented. \
         Set ANTHROPIC_API_KEY and implement the API call in generate_cpe_summary()."
    )
}
