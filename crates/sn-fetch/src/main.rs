use anyhow::{bail, Context, Result};
use clap::Parser;
use serde::Deserialize;
use std::fs;
use std::io::{self, BufRead};
use std::path::PathBuf;

/// Fetch Security Now episode details from grc.com and save as markdown.
///
/// Reads episode JSON from stdin (piped from sn-list), or fetches a single
/// episode by number or URL. Optionally downloads the episode audio.
#[derive(Parser)]
#[command(version, about)]
struct Args {
    /// Fetch a single episode by number (instead of reading stdin)
    #[arg(long)]
    episode: Option<u32>,

    /// Fetch a single episode by URL (instead of reading stdin)
    #[arg(long)]
    url: Option<String>,

    /// Directory to save episode markdown files
    #[arg(long, default_value = "./episodes")]
    output_dir: PathBuf,

    /// Also download the episode audio file
    #[arg(long)]
    audio: bool,
}

#[derive(Debug, Deserialize)]
struct EpisodeInput {
    episode: u32,
    date: String,
    title: String,
    url: String,
}

struct EpisodeDetails {
    episode: u32,
    title: String,
    date: String,
    duration: String,
    source_url: String,
    description: String,
    show_notes: String,
    audio_url: Option<String>,
}

fn main() -> Result<()> {
    let args = Args::parse();

    fs::create_dir_all(&args.output_dir)
        .with_context(|| format!("Failed to create output directory: {:?}", args.output_dir))?;

    let episodes = collect_episodes(&args)?;

    for input in &episodes {
        let details = fetch_episode_details(input)?;
        let markdown = render_markdown(&details, args.audio);
        let filename = format!("sn-{:04}.md", details.episode);
        let path = args.output_dir.join(&filename);
        fs::write(&path, &markdown)
            .with_context(|| format!("Failed to write {path:?}"))?;
        eprintln!("Wrote {path:?}");

        if args.audio {
            download_audio(&details, &args.output_dir)?;
        }
    }

    eprintln!("Fetched {} episodes", episodes.len());
    Ok(())
}

/// Collect episode inputs from CLI args or stdin.
fn collect_episodes(args: &Args) -> Result<Vec<EpisodeInput>> {
    if let Some(ep_num) = args.episode {
        Ok(vec![EpisodeInput {
            episode: ep_num,
            date: String::new(),
            title: String::new(),
            url: format!("https://www.grc.com/sn/sn-{ep_num}.htm"),
        }])
    } else if let Some(ref url) = args.url {
        Ok(vec![EpisodeInput {
            episode: 0,
            date: String::new(),
            title: String::new(),
            url: url.clone(),
        }])
    } else {
        let stdin = io::stdin();
        let mut episodes = Vec::new();
        for line in stdin.lock().lines() {
            let line = line.context("Failed to read stdin")?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let ep: EpisodeInput =
                serde_json::from_str(trimmed).context("Failed to parse episode JSON from stdin")?;
            episodes.push(ep);
        }
        if episodes.is_empty() {
            bail!("No episodes provided. Use --episode, --url, or pipe from sn-list.");
        }
        Ok(episodes)
    }
}

/// Fetch full episode details from grc.com.
fn fetch_episode_details(input: &EpisodeInput) -> Result<EpisodeDetails> {
    // TODO: Implement HTML scraping of the episode page
    //
    // Expected approach:
    //   let client = reqwest::blocking::Client::new();
    //   let html = client.get(&input.url).send()?.text()?;
    //   let document = scraper::Html::parse_document(&html);
    //   // Extract title, description, show notes, duration, audio URL...
    //
    // GRC.com episode pages typically contain:
    // - Episode title and number
    // - Air date
    // - Description/summary
    // - Show notes (detailed content)
    // - Links to audio files (MP3)
    //
    // Audio URL pattern is likely:
    //   https://media.grc.com/sn/sn-{episode}.mp3

    eprintln!(
        "WARNING: Episode detail fetching not yet implemented for episode {}",
        input.episode
    );

    Ok(EpisodeDetails {
        episode: input.episode,
        title: if input.title.is_empty() {
            format!("Episode {}", input.episode)
        } else {
            input.title.clone()
        },
        date: input.date.clone(),
        duration: String::from("TODO"),
        source_url: input.url.clone(),
        description: String::from("TODO: Fetch description from episode page"),
        show_notes: String::from("TODO: Fetch show notes from episode page"),
        audio_url: Some(format!(
            "https://media.grc.com/sn/sn-{:04}.mp3",
            input.episode
        )),
    })
}

/// Render episode details as a markdown document.
fn render_markdown(details: &EpisodeDetails, include_audio: bool) -> String {
    let mut md = format!(
        "# Security Now Episode {}: {}\n\n## Episode Details\n- **Date:** {}\n- **Episode:** {}\n- **Duration:** {}\n- **Source URL:** {}\n",
        details.episode,
        details.title,
        details.date,
        details.episode,
        details.duration,
        details.source_url,
    );

    if include_audio {
        if let Some(ref audio_url) = details.audio_url {
            md.push_str(&format!(
                "- **Audio:** sn-{:04}.mp3\n- **Audio URL:** {}\n",
                details.episode, audio_url
            ));
        }
    }

    md.push_str(&format!(
        "\n## Description\n{}\n\n## Show Notes\n{}\n",
        details.description, details.show_notes
    ));

    md
}

/// Download the episode audio file.
fn download_audio(details: &EpisodeDetails, output_dir: &PathBuf) -> Result<()> {
    let Some(ref audio_url) = details.audio_url else {
        eprintln!("No audio URL for episode {}", details.episode);
        return Ok(());
    };

    let filename = format!("sn-{:04}.mp3", details.episode);
    let path = output_dir.join(&filename);

    if path.exists() {
        eprintln!("Audio already exists: {path:?}");
        return Ok(());
    }

    // TODO: Implement audio download
    //
    // Expected approach:
    //   let client = reqwest::blocking::Client::new();
    //   let response = client.get(audio_url).send()?;
    //   let bytes = response.bytes()?;
    //   fs::write(&path, &bytes)?;

    eprintln!("WARNING: Audio download not yet implemented for {audio_url}");
    let _ = path;
    Ok(())
}
