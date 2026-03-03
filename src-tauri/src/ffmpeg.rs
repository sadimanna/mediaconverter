use crate::progress::{parse_progress_line, ProgressState};
use rand::seq::SliceRandom;
use rand::SeedableRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{copy, create_dir_all, read_dir, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::Window;
use uuid::Uuid;

#[derive(Clone, Default)]
pub struct JobRegistry {
  jobs: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>
}

#[derive(Serialize, Clone)]
pub struct FfmpegCheck {
  pub available: bool,
  pub version: Option<String>,
  pub error: Option<String>
}

#[derive(Serialize, Clone)]
struct ProgressEvent {
  job_id: String,
  out_time_ms: Option<u64>,
  fps: Option<f32>,
  speed: Option<String>,
  progress: String,
  percent: Option<f64>
}

#[derive(Serialize, Clone)]
struct LogEvent {
  job_id: String,
  stream: String,
  line: String
}

#[derive(Serialize, Clone)]
struct ExitEvent {
  job_id: String,
  code: i32,
  success: bool,
  error: Option<String>
}

#[derive(Serialize, Clone)]
struct DatasetCompleteEvent {
  job_id: String,
  global_manifest_csv: String,
  frame_count: usize,
  video_count: usize
}

#[derive(Serialize, Clone)]
struct DatasetProgressEvent {
  job_id: String,
  current_video: String,
  per_video_progress: f64,
  overall_progress: f64,
  total_videos: usize,
  completed_videos: usize
}

#[derive(Serialize, Clone)]
struct StandardizationCompleteEvent {
  job_id: String,
  summary_path: String,
  item_count: usize
}

#[derive(Serialize, Clone)]
pub struct VideoInfo {
  pub duration: Option<f64>,
  pub avg_fps: Option<f64>,
  pub nb_frames: Option<u64>,
  pub width: Option<u32>,
  pub height: Option<u32>
}

#[derive(Deserialize)]
pub struct DatasetRequest {
  pub video_path: Option<String>,
  pub input_dir: Option<String>,
  pub output_dir: String,
  pub mode: String,
  pub fps: Option<f32>,
  pub nth: Option<u64>,
  pub k: Option<u64>,
  pub seed: Option<u64>
}

#[derive(Deserialize)]
pub struct StandardizeRequest {
  pub mode: String,
  pub inputs: Vec<String>,
  pub output_dir: String,
  pub fps: Option<f32>,
  pub interpolate: Option<bool>,
  pub reencode: Option<bool>,
  pub video_codec: Option<String>,
  pub video_container: Option<String>,
  pub audio_rate: Option<u32>,
  pub audio_channels: Option<u32>,
  pub audio_format: Option<String>
}

#[allow(dead_code)]
#[derive(Clone, Debug)]
struct FrameMeta {
  frame_index: u64,
  timestamp: f64,
  width: u32,
  height: u32
}

#[derive(Serialize)]
struct ManifestEntry {
  source_video: String,
  video_id: String,
  frame_index: u64,
  timestamp: f64,
  relative_output_path: String
}

#[derive(Serialize, Clone)]
struct StandardizationEntry {
  source_path: String,
  output_path: String,
  mode: String,
  fps: Option<f32>,
  interpolate: Option<bool>,
  video_codec: Option<String>,
  video_container: Option<String>,
  audio_rate: Option<u32>,
  audio_channels: Option<u32>,
  audio_format: Option<String>,
  resolution: Option<String>,
  duration: Option<f64>,
  sha256: String
}

#[derive(Serialize)]
struct StandardizationSummary {
  item_count: usize,
  entries: Vec<StandardizationEntry>
}

#[derive(Serialize, Clone)]
pub struct InspectorEntry {
  path: String,
  media_type: String,
  codec: Option<String>,
  duration: Option<f64>,
  resolution: Option<String>,
  fps: Option<f64>,
  audio_sample_rate: Option<u32>,
  error: Option<String>
}

#[derive(Serialize, Clone)]
pub struct DistributionItem {
  value: String,
  count: usize
}

#[derive(Serialize, Clone)]
pub struct DurationStats {
  min: f64,
  mean: f64,
  max: f64,
  count: usize
}

#[derive(Serialize, Clone)]
pub struct InspectorStats {
  total_files: usize,
  video_count: usize,
  image_count: usize,
  duration: Option<DurationStats>,
  resolution_distribution: Vec<DistributionItem>,
  fps_distribution: Vec<DistributionItem>
}

#[derive(Serialize, Clone)]
pub struct InspectorSummary {
  entries: Vec<InspectorEntry>,
  stats: InspectorStats
}

#[derive(Deserialize)]
pub struct InspectorRequest {
  pub input_dir: String
}

fn validate_video_target(codec: &str, container: &str) -> Result<(), String> {
  let allowed: &[&str] = match container {
    "mp4" | "mov" => &["libx264", "libx265", "mpeg4", "libsvtav1"],
    "mkv" => &["libx264", "libx265", "mpeg4", "libsvtav1"],
    "avi" => &["libx264", "libx265", "mpeg4"],
    "webm" => &["libsvtav1"],
    _ => return Err("Unsupported video container.".to_string())
  };

  if allowed.contains(&codec) {
    Ok(())
  } else {
    Err(format!(
      "Codec {} is not compatible with container {}.",
      codec, container
    ))
  }
}

fn check_ffmpeg_internal() -> Result<String, String> {
  let output = Command::new("ffmpeg")
    .arg("-version")
    .output()
    .map_err(|err| err.to_string())?;

  if !output.status.success() {
    return Err("FFmpeg returned a non-zero status.".to_string());
  }

  let stdout = String::from_utf8_lossy(&output.stdout);
  let version_line = stdout.lines().next().unwrap_or("").trim();
  Ok(version_line.to_string())
}

pub fn emit_ffmpeg_check(window: &Window) {
  let payload = match check_ffmpeg_internal() {
    Ok(version) => FfmpegCheck {
      available: true,
      version: Some(version),
      error: None
    },
    Err(error) => FfmpegCheck {
      available: false,
      version: None,
      error: Some(error)
    }
  };

  let _ = window.emit("ffmpeg-check", payload);
}

fn find_first_input(args: &[String]) -> Option<String> {
  let mut iter = args.iter();
  while let Some(arg) = iter.next() {
    if arg == "-i" {
      if let Some(path) = iter.next() {
        return Some(path.to_string());
      }
    }
  }
  None
}

fn probe_duration_ms(path: &str) -> Option<u64> {
  let output = Command::new("ffprobe")
    .args([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path
    ])
    .output()
    .ok()?;

  if !output.status.success() {
    return None;
  }

  let stdout = String::from_utf8_lossy(&output.stdout);
  let seconds = stdout.trim().parse::<f64>().ok()?;
  Some((seconds * 1000.0) as u64)
}

fn parse_fraction(value: &str) -> Option<f64> {
  if let Some((num, den)) = value.split_once('/') {
    let n = num.parse::<f64>().ok()?;
    let d = den.parse::<f64>().ok()?;
    if d == 0.0 {
      None
    } else {
      Some(n / d)
    }
  } else {
    value.parse::<f64>().ok()
  }
}

fn is_supported_video_extension(ext: &str) -> bool {
  matches!(ext, "mp4" | "mkv" | "mov" | "avi" | "webm")
}

fn is_supported_video(path: &Path) -> bool {
  path
    .extension()
    .and_then(|ext| ext.to_str())
    .map(|ext| is_supported_video_extension(&ext.to_lowercase()))
    .unwrap_or(false)
}

fn is_supported_image_extension(ext: &str) -> bool {
  matches!(ext, "png" | "jpg" | "jpeg" | "webp" | "tiff" | "tif")
}

fn is_supported_image(path: &Path) -> bool {
  path
    .extension()
    .and_then(|ext| ext.to_str())
    .map(|ext| is_supported_image_extension(&ext.to_lowercase()))
    .unwrap_or(false)
}

fn collect_videos_in_dir(dir: &Path) -> Result<Vec<PathBuf>, String> {
  let mut videos: Vec<PathBuf> = Vec::new();
  for entry in read_dir(dir).map_err(|err| err.to_string())? {
    let entry = entry.map_err(|err| err.to_string())?;
    let path = entry.path();
    if path.is_file() && is_supported_video(&path) {
      videos.push(path);
    }
  }
  videos.sort();
  Ok(videos)
}

fn collect_media_in_dir(dir: &Path) -> Result<Vec<PathBuf>, String> {
  let mut files: Vec<PathBuf> = Vec::new();
  for entry in read_dir(dir).map_err(|err| err.to_string())? {
    let entry = entry.map_err(|err| err.to_string())?;
    let path = entry.path();
    if path.is_file() && (is_supported_video(&path) || is_supported_image(&path)) {
      files.push(path);
    }
  }
  files.sort();
  Ok(files)
}

fn probe_video_info(path: &str) -> Option<VideoInfo> {
  let output = Command::new("ffprobe")
    .args([
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,avg_frame_rate,nb_frames",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      path
    ])
    .output()
    .ok()?;

  if !output.status.success() {
    return None;
  }

  let json: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
  let duration = json
    .get("format")
    .and_then(|format| format.get("duration"))
    .and_then(|value| value.as_str())
    .and_then(|value| value.parse::<f64>().ok());

  let stream = json.get("streams")?.get(0)?;
  let avg_fps = stream
    .get("avg_frame_rate")
    .and_then(|value| value.as_str())
    .and_then(parse_fraction);

  let nb_frames = stream
    .get("nb_frames")
    .and_then(|value| value.as_str())
    .and_then(|value| value.parse::<u64>().ok());

  let width = stream.get("width").and_then(|value| value.as_u64()).map(|v| v as u32);
  let height = stream.get("height").and_then(|value| value.as_u64()).map(|v| v as u32);

  Some(VideoInfo {
    duration,
    avg_fps,
    nb_frames,
    width,
    height
  })
}

fn probe_media_entry(path: &Path) -> InspectorEntry {
  let path_string = path.to_string_lossy().to_string();
  let media_type = if is_supported_image(path) { "image" } else { "video" }.to_string();

  let output = Command::new("ffprobe")
    .args([
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,codec_type,width,height,avg_frame_rate,sample_rate",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      &path_string
    ])
    .output();

  let output = match output {
    Ok(output) => output,
    Err(err) => {
      return InspectorEntry {
        path: path_string,
        media_type,
        codec: None,
        duration: None,
        resolution: None,
        fps: None,
        audio_sample_rate: None,
        error: Some(err.to_string())
      };
    }
  };

  if !output.status.success() {
    return InspectorEntry {
      path: path_string,
      media_type,
      codec: None,
      duration: None,
      resolution: None,
      fps: None,
      audio_sample_rate: None,
      error: Some("ffprobe failed".to_string())
    };
  }

  let json: serde_json::Value = match serde_json::from_slice(&output.stdout) {
    Ok(value) => value,
    Err(err) => {
      return InspectorEntry {
        path: path_string,
        media_type,
        codec: None,
        duration: None,
        resolution: None,
        fps: None,
        audio_sample_rate: None,
        error: Some(err.to_string())
      };
    }
  };

  let streams = json.get("streams").and_then(|v| v.as_array()).cloned().unwrap_or_default();
  let mut video_stream: Option<serde_json::Value> = None;
  let mut audio_stream: Option<serde_json::Value> = None;

  for stream in streams {
    if let Some(kind) = stream.get("codec_type").and_then(|v| v.as_str()) {
      if kind == "video" && video_stream.is_none() {
        video_stream = Some(stream.clone());
      }
      if kind == "audio" && audio_stream.is_none() {
        audio_stream = Some(stream.clone());
      }
    }
  }

  let codec = video_stream
    .as_ref()
    .and_then(|stream| stream.get("codec_name"))
    .and_then(|value| value.as_str())
    .map(|value| value.to_string());

  let width = video_stream
    .as_ref()
    .and_then(|stream| stream.get("width"))
    .and_then(|value| value.as_u64());
  let height = video_stream
    .as_ref()
    .and_then(|stream| stream.get("height"))
    .and_then(|value| value.as_u64());
  let resolution = match (width, height) {
    (Some(w), Some(h)) => Some(format!("{}x{}", w, h)),
    _ => None
  };

  let fps = video_stream
    .as_ref()
    .and_then(|stream| stream.get("avg_frame_rate"))
    .and_then(|value| value.as_str())
    .and_then(parse_fraction)
    .filter(|value| *value > 0.0);

  let duration = json
    .get("format")
    .and_then(|format| format.get("duration"))
    .and_then(|value| value.as_str())
    .and_then(|value| value.parse::<f64>().ok())
    .filter(|value| *value > 0.0);

  let audio_sample_rate = audio_stream
    .as_ref()
    .and_then(|stream| stream.get("sample_rate"))
    .and_then(|value| value.as_str())
    .and_then(|value| value.parse::<u32>().ok());

  InspectorEntry {
    path: path_string,
    media_type,
    codec,
    duration,
    resolution,
    fps,
    audio_sample_rate,
    error: None
  }
}

fn probe_output_details(path: &str) -> (Option<String>, Option<f64>) {
  let output = Command::new("ffprobe")
    .args([
      "-v",
      "error",
      "-show_entries",
      "stream=width,height",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      path
    ])
    .output();

  if let Ok(output) = output {
    if output.status.success() {
      if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
        let duration = json
          .get("format")
          .and_then(|format| format.get("duration"))
          .and_then(|value| value.as_str())
          .and_then(|value| value.parse::<f64>().ok());
        let stream = json.get("streams").and_then(|streams| streams.get(0));
        let resolution = stream.and_then(|stream| {
          let w = stream.get("width")?.as_u64()?;
          let h = stream.get("height")?.as_u64()?;
          Some(format!("{}x{}", w, h))
        });
        return (resolution, duration);
      }
    }
  }

  (None, None)
}

fn estimate_total_frames(path: &str) -> Option<u64> {
  if let Some(info) = probe_video_info(path) {
    if let Some(nb_frames) = info.nb_frames {
      return Some(nb_frames);
    }
    if let (Some(duration), Some(avg_fps)) = (info.duration, info.avg_fps) {
      return Some((duration * avg_fps).round() as u64);
    }
  }

  let output = Command::new("ffprobe")
    .args([
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_frames",
      "-show_entries",
      "stream=nb_read_frames",
      "-of",
      "default=nokey=1:noprint_wrappers=1",
      path
    ])
    .output()
    .ok()?;

  if !output.status.success() {
    return None;
  }

  let stdout = String::from_utf8_lossy(&output.stdout);
  stdout.trim().parse::<u64>().ok()
}

fn build_dataset_filter(request: &DatasetRequest, video_path: &str) -> Result<String, String> {
  let mut filter_parts: Vec<String> = Vec::new();
  match request.mode.as_str() {
    "fps" => {
      let fps = request.fps.unwrap_or(1.0).max(0.1);
      filter_parts.push(format!("fps={}", fps));
    }
    "nth" => {
      let nth = request.nth.unwrap_or(10).max(1);
      filter_parts.push(format!("select='not(mod(n\\,{}))'", nth));
    }
    "random" => {
      let total = estimate_total_frames(video_path).ok_or("Unable to estimate total frames")?;
      if total == 0 {
        return Err("Video contains no frames".to_string());
      }
      let k = request.k.unwrap_or(10).min(total).max(1);
      let seed = request.seed.unwrap_or(42);
      let indices = sample_indices(total, k, seed);
      filter_parts.push(build_select_expression(&indices));
    }
    _ => return Err("Unknown sampling mode".to_string())
  }

  filter_parts.push("showinfo".to_string());
  Ok(filter_parts.join(","))
}

fn map_to_distribution(map: HashMap<String, usize>) -> Vec<DistributionItem> {
  let mut items: Vec<(String, usize)> = map.into_iter().collect();
  items.sort_by(|a, b| a.0.cmp(&b.0));
  items
    .into_iter()
    .map(|(value, count)| DistributionItem { value, count })
    .collect()
}

fn build_inspector_stats(entries: &[InspectorEntry]) -> InspectorStats {
  let total_files = entries.len();
  let video_count = entries.iter().filter(|entry| entry.media_type == "video").count();
  let image_count = entries.iter().filter(|entry| entry.media_type == "image").count();

  let durations: Vec<f64> = entries.iter().filter_map(|entry| entry.duration).collect();
  let duration = if durations.is_empty() {
    None
  } else {
    let min = durations
      .iter()
      .cloned()
      .fold(f64::INFINITY, |acc, value| acc.min(value));
    let max = durations
      .iter()
      .cloned()
      .fold(f64::NEG_INFINITY, |acc, value| acc.max(value));
    let sum: f64 = durations.iter().sum();
    Some(DurationStats {
      min,
      mean: sum / durations.len() as f64,
      max,
      count: durations.len()
    })
  };

  let mut resolution_map: HashMap<String, usize> = HashMap::new();
  for entry in entries {
    if let Some(resolution) = entry.resolution.as_ref() {
      *resolution_map.entry(resolution.clone()).or_insert(0) += 1;
    }
  }

  let mut fps_map: HashMap<String, usize> = HashMap::new();
  for entry in entries {
    if let Some(fps) = entry.fps {
      let key = format!("{:.3}", fps);
      *fps_map.entry(key).or_insert(0) += 1;
    }
  }

  InspectorStats {
    total_files,
    video_count,
    image_count,
    duration,
    resolution_distribution: map_to_distribution(resolution_map),
    fps_distribution: map_to_distribution(fps_map)
  }
}

fn sanitize_video_id(path: &str) -> String {
  let binding = PathBuf::from(path);
  let stem = binding
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("video");
  stem
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
    .collect()
}

fn escape_concat_path(path: &str) -> String {
  path.replace('\\', "/").replace('"', "\\\"").replace('\'', "\\'")
}

fn write_concat_file(inputs: &[String]) -> Result<PathBuf, String> {
  let mut path = std::env::temp_dir();
  path.push(format!("ffmpeg_concat_{}.txt", Uuid::new_v4()));

  let mut file = File::create(&path).map_err(|err| err.to_string())?;
  for input in inputs {
    let safe = escape_concat_path(input);
    writeln!(file, "file '{}'", safe).map_err(|err| err.to_string())?;
  }

  Ok(path)
}

fn parse_showinfo(line: &str) -> Option<FrameMeta> {
  if !line.contains("showinfo") {
    return None;
  }

  let mut frame_index: Option<u64> = None;
  let mut timestamp: Option<f64> = None;
  let mut width: Option<u32> = None;
  let mut height: Option<u32> = None;

  let tokens: Vec<&str> = line.split_whitespace().collect();
  let mut idx = 0;
  while idx < tokens.len() {
    let token = tokens[idx];
    if token.starts_with("n:") {
      let value = if token == "n:" && idx + 1 < tokens.len() {
        idx += 1;
        tokens[idx]
      } else {
        token.trim_start_matches("n:")
      };
      frame_index = value.parse::<u64>().ok();
    } else if token.starts_with("pts_time:") {
      let value = if token == "pts_time:" && idx + 1 < tokens.len() {
        idx += 1;
        tokens[idx]
      } else {
        token.trim_start_matches("pts_time:")
      };
      timestamp = value.parse::<f64>().ok();
    } else if token.starts_with("s:") {
      let value = if token == "s:" && idx + 1 < tokens.len() {
        idx += 1;
        tokens[idx]
      } else {
        token.trim_start_matches("s:")
      };
      if let Some((w, h)) = value.split_once('x') {
        width = w.parse::<u32>().ok();
        height = h.parse::<u32>().ok();
      }
    }
    idx += 1;
  }

  match (frame_index, timestamp, width, height) {
    (Some(frame_index), Some(timestamp), Some(width), Some(height)) => Some(FrameMeta {
      frame_index,
      timestamp,
      width,
      height
    }),
    _ => None
  }
}

fn prepare_ffmpeg_args(mut args: Vec<String>) -> Vec<String> {
  if !args.iter().any(|arg| arg == "-hide_banner") {
    args.insert(0, "-hide_banner".to_string());
  }

  if !args.iter().any(|arg| arg == "-progress") {
    args.push("-progress".to_string());
    args.push("pipe:1".to_string());
  }

  if !args.iter().any(|arg| arg == "-nostats") {
    args.push("-nostats".to_string());
  }

  args
}

fn spawn_ffmpeg(
  registry: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
  args: Vec<String>
) -> Result<(String, Arc<Mutex<Child>>, ChildStdout, ChildStderr), String> {
  let mut child = Command::new("ffmpeg")
    .args(&args)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|err| err.to_string())?;

  let stdout = child.stdout.take().ok_or("Unable to capture stdout")?;
  let stderr = child.stderr.take().ok_or("Unable to capture stderr")?;

  let job_id = Uuid::new_v4().to_string();
  let child_handle = Arc::new(Mutex::new(child));
  registry
    .lock()
    .map_err(|_| "Job registry poisoned")?
    .insert(job_id.clone(), child_handle.clone());

  Ok((job_id, child_handle, stdout, stderr))
}

fn spawn_progress_thread(
  window: Window,
  job_id: String,
  stdout: ChildStdout,
  duration_ms: Option<u64>
) {
  std::thread::spawn(move || {
    let reader = BufReader::new(stdout);
    let mut progress_state = ProgressState::default();

    for line in reader.lines().flatten() {
      if let Some(snapshot) = parse_progress_line(&mut progress_state, &line) {
        let percent = match (snapshot.out_time_ms, duration_ms) {
          (Some(current), Some(total)) if total > 0 => Some((current as f64 / total as f64).min(1.0)),
          _ => None
        };

        let payload = ProgressEvent {
          job_id: job_id.clone(),
          out_time_ms: snapshot.out_time_ms,
          fps: snapshot.fps,
          speed: snapshot.speed.clone(),
          progress: snapshot.progress.clone(),
          percent
        };
        let _ = window.emit("ffmpeg-progress", payload);
      }
    }
  });
}

fn append_error_log(output_root: &PathBuf, message: &str) {
  let path = output_root.join("errors.log");
  if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
    let _ = writeln!(file, "{}", message);
  }
}

fn emit_dataset_progress(
  window: &Window,
  job_id: &str,
  current_video: &str,
  per_video: f64,
  overall: f64,
  total_videos: usize,
  completed_videos: usize
) {
  let payload = DatasetProgressEvent {
    job_id: job_id.to_string(),
    current_video: current_video.to_string(),
    per_video_progress: per_video.clamp(0.0, 100.0),
    overall_progress: overall.clamp(0.0, 100.0),
    total_videos,
    completed_videos
  };
  let _ = window.emit("dataset-progress", payload);
}

fn spawn_dataset_progress_thread(
  window: Window,
  job_id: String,
  stdout: ChildStdout,
  duration_ms: Option<u64>,
  current_video: String,
  total_videos: usize,
  completed_videos: usize
) {
  std::thread::spawn(move || {
    let reader = BufReader::new(stdout);
    let mut progress_state = ProgressState::default();

    for line in reader.lines().flatten() {
      if let Some(snapshot) = parse_progress_line(&mut progress_state, &line) {
        let per_video = match (snapshot.out_time_ms, duration_ms) {
          (Some(current), Some(total)) if total > 0 => (current as f64 / total as f64 * 100.0).min(100.0),
          _ => 0.0
        };
        let overall = if total_videos > 0 {
          ((completed_videos as f64) + (per_video / 100.0)) / (total_videos as f64) * 100.0
        } else {
          per_video
        };
        emit_dataset_progress(
          &window,
          &job_id,
          &current_video,
          per_video,
          overall,
          total_videos,
          completed_videos
        );
      }
    }
  });
}

fn emit_simple_progress(window: &Window, job_id: &str, percent: f64) {
  let payload = ProgressEvent {
    job_id: job_id.to_string(),
    out_time_ms: None,
    fps: None,
    speed: None,
    progress: "continue".to_string(),
    percent: Some(percent.clamp(0.0, 1.0))
  };
  let _ = window.emit("ffmpeg-progress", payload);
}

fn spawn_log_thread(
  window: Window,
  job_id: String,
  stderr: ChildStderr,
  showinfo: Option<Arc<Mutex<Vec<FrameMeta>>>>
) {
  std::thread::spawn(move || {
    let reader = BufReader::new(stderr);
    for line in reader.lines().flatten() {
      if let Some(meta) = showinfo.as_ref().and_then(|_| parse_showinfo(&line)) {
        if let Some(store) = &showinfo {
          if let Ok(mut guard) = store.lock() {
            guard.push(meta);
          }
        }
      }

      let payload = LogEvent {
        job_id: job_id.clone(),
        stream: "stderr".to_string(),
        line
      };
      let _ = window.emit("ffmpeg-log", payload);
    }
  });
}

fn sha256_file(path: &PathBuf) -> Result<String, String> {
  let mut file = File::open(path).map_err(|err| err.to_string())?;
  let mut hasher = Sha256::new();
  std::io::copy(&mut file, &mut hasher).map_err(|err| err.to_string())?;
  Ok(hex::encode(hasher.finalize()))
}

fn build_select_expression(indices: &[u64]) -> String {
  let expr = indices
    .iter()
    .map(|index| format!("eq(n\\,{})", index))
    .collect::<Vec<_>>()
    .join("+");
  format!("select='{}'", expr)
}

fn sample_indices(total: u64, k: u64, seed: u64) -> Vec<u64> {
  let mut indices: Vec<u64> = (0..total).collect();
  let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
  indices.shuffle(&mut rng);
  indices.truncate(k as usize);
  indices.sort_unstable();
  indices
}

fn write_manifest_csv(path: &PathBuf, entries: &[ManifestEntry]) -> Result<(), String> {
  let mut writer = csv::Writer::from_path(path).map_err(|err| err.to_string())?;
  for entry in entries {
    writer.serialize(entry).map_err(|err| err.to_string())?;
  }
  writer.flush().map_err(|err| err.to_string())?;
  Ok(())
}

fn write_summary(
  output_dir: &PathBuf,
  entries: &[StandardizationEntry]
) -> Result<String, String> {
  let summary_path = output_dir.join("dataset_summary.json");
  let summary = StandardizationSummary {
    item_count: entries.len(),
    entries: entries.to_vec()
  };
  let json = serde_json::to_string_pretty(&summary).map_err(|err| err.to_string())?;
  let mut file = File::create(&summary_path).map_err(|err| err.to_string())?;
  file.write_all(json.as_bytes()).map_err(|err| err.to_string())?;
  Ok(summary_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn check_ffmpeg() -> Result<FfmpegCheck, String> {
  match check_ffmpeg_internal() {
    Ok(version) => Ok(FfmpegCheck {
      available: true,
      version: Some(version),
      error: None
    }),
    Err(error) => Ok(FfmpegCheck {
      available: false,
      version: None,
      error: Some(error)
    })
  }
}

#[tauri::command]
pub fn probe_video(path: String) -> Result<VideoInfo, String> {
  probe_video_info(&path).ok_or("Unable to probe video metadata".to_string())
}

#[tauri::command]
pub fn copy_file(source: String, destination: String) -> Result<(), String> {
  copy(source, destination).map_err(|err| err.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn scan_video_folder(path: String) -> Result<Vec<String>, String> {
  let dir = PathBuf::from(path);
  let videos = collect_videos_in_dir(&dir)?;
  Ok(videos
    .into_iter()
    .map(|item| item.to_string_lossy().to_string())
    .collect())
}

#[tauri::command]
pub fn scan_media_folder(path: String) -> Result<Vec<String>, String> {
  let dir = PathBuf::from(path);
  let files = collect_media_in_dir(&dir)?;
  Ok(files
    .into_iter()
    .map(|item| item.to_string_lossy().to_string())
    .collect())
}

#[tauri::command]
pub fn inspect_media(request: InspectorRequest) -> Result<InspectorSummary, String> {
  let dir = PathBuf::from(&request.input_dir);
  let files = collect_media_in_dir(&dir)?;
  if files.is_empty() {
    return Err("No supported media files found.".to_string());
  }

  let mut entries: Vec<InspectorEntry> = Vec::new();
  for path in files {
    entries.push(probe_media_entry(&path));
  }

  let stats = build_inspector_stats(&entries);
  Ok(InspectorSummary { entries, stats })
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
  std::fs::write(path, contents).map_err(|err| err.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn run_ffmpeg(args: Vec<String>) -> Result<String, String> {
  let output = Command::new("ffmpeg")
    .args(args)
    .output()
    .map_err(|err| err.to_string())?;

  let mut combined = String::new();
  combined.push_str(&String::from_utf8_lossy(&output.stdout));
  combined.push_str(&String::from_utf8_lossy(&output.stderr));

  if output.status.success() {
    Ok(combined)
  } else {
    Err(combined)
  }
}

#[tauri::command]
pub fn run_ffmpeg_with_progress(
  window: Window,
  state: tauri::State<JobRegistry>,
  args: Vec<String>
) -> Result<String, String> {
  let duration_ms = find_first_input(&args).and_then(|path| probe_duration_ms(&path));
  let args = prepare_ffmpeg_args(args);
  let (job_id, child_handle, stdout, stderr) = spawn_ffmpeg(state.jobs.clone(), args)?;

  spawn_progress_thread(window.clone(), job_id.clone(), stdout, duration_ms);
  spawn_log_thread(window.clone(), job_id.clone(), stderr, None);

  let registry = state.jobs.clone();
  let exit_window = window.clone();
  let exit_job_id = job_id.clone();
  std::thread::spawn(move || {
    let status = match child_handle.lock() {
      Ok(mut child) => child.wait().ok(),
      Err(_) => None
    };
    let code = status.and_then(|status| status.code()).unwrap_or(-1);
    let success = status.map(|status| status.success()).unwrap_or(false);

    if let Ok(mut jobs) = registry.lock() {
      jobs.remove(&exit_job_id);
    }

    let payload = ExitEvent {
      job_id: exit_job_id,
      code,
      success,
      error: if success { None } else { Some("FFmpeg exited with a non-zero status".to_string()) }
    };
    let _ = exit_window.emit("ffmpeg-exit", payload);
  });

  Ok(job_id)
}

#[tauri::command]
pub fn run_ffmpeg_image_sequence(
  window: Window,
  state: tauri::State<JobRegistry>,
  inputs: Vec<String>,
  framerate: f32,
  args: Vec<String>,
  output: String
) -> Result<String, String> {
  if inputs.is_empty() {
    return Err("No input images provided.".to_string());
  }

  let list_path = write_concat_file(&inputs)?;
  let mut cmd_args = vec![
    "-f".to_string(),
    "concat".to_string(),
    "-safe".to_string(),
    "0".to_string(),
    "-i".to_string(),
    list_path.to_string_lossy().to_string(),
    "-r".to_string(),
    framerate.to_string()
  ];

  cmd_args.extend(args);
  cmd_args.push(output);

  let duration_ms = if framerate > 0.0 {
    Some(((inputs.len() as f32 / framerate) * 1000.0) as u64)
  } else {
    None
  };

  let cmd_args = prepare_ffmpeg_args(cmd_args);
  let (job_id, child_handle, stdout, stderr) = spawn_ffmpeg(state.jobs.clone(), cmd_args)?;

  spawn_progress_thread(window.clone(), job_id.clone(), stdout, duration_ms);
  spawn_log_thread(window.clone(), job_id.clone(), stderr, None);

  let registry = state.jobs.clone();
  let exit_window = window.clone();
  let exit_job_id = job_id.clone();
  std::thread::spawn(move || {
    let status = match child_handle.lock() {
      Ok(mut child) => child.wait().ok(),
      Err(_) => None
    };
    let code = status.and_then(|status| status.code()).unwrap_or(-1);
    let success = status.map(|status| status.success()).unwrap_or(false);

    if let Ok(mut jobs) = registry.lock() {
      jobs.remove(&exit_job_id);
    }

    let payload = ExitEvent {
      job_id: exit_job_id,
      code,
      success,
      error: if success { None } else { Some("FFmpeg exited with a non-zero status".to_string()) }
    };
    let _ = exit_window.emit("ffmpeg-exit", payload);
  });

  Ok(job_id)
}

#[tauri::command]
pub fn run_dataset_extraction(
  window: Window,
  state: tauri::State<JobRegistry>,
  request: DatasetRequest
) -> Result<String, String> {
  let output_root = PathBuf::from(&request.output_dir);
  create_dir_all(&output_root).map_err(|err| err.to_string())?;

  let mut videos: Vec<PathBuf> = Vec::new();
  if let Some(input_dir) = request.input_dir.as_ref().filter(|p| !p.is_empty()) {
    videos = collect_videos_in_dir(Path::new(input_dir))?;
  } else if let Some(video_path) = request.video_path.as_ref().filter(|p| !p.is_empty()) {
    videos.push(PathBuf::from(video_path));
  } else {
    return Err("Select a video file or input folder.".to_string());
  }

  if videos.is_empty() {
    return Err("No supported video files found.".to_string());
  }

  let job_id = Uuid::new_v4().to_string();
  let registry = state.jobs.clone();
  let job_id_thread = job_id.clone();

  std::thread::spawn(move || {
    let total_videos = videos.len();
    let mut completed_videos: usize = 0;
    let mut failed_videos: usize = 0;
    let mut global_entries: Vec<ManifestEntry> = Vec::new();

    emit_dataset_progress(
      &window,
      &job_id_thread,
      "",
      0.0,
      0.0,
      total_videos,
      completed_videos
    );

    for video_path in videos {
      let video_path_str = video_path.to_string_lossy().to_string();
      let current_name = video_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("video")
        .to_string();
      let video_id = sanitize_video_id(&video_path_str);
      let video_dir = output_root.join(&video_id);

      if let Err(err) = create_dir_all(&video_dir) {
        let message = format!("{}: {}", video_path_str, err);
        append_error_log(&output_root, &message);
        let _ = window.emit(
          "ffmpeg-log",
          LogEvent {
            job_id: job_id_thread.clone(),
            stream: "stderr".to_string(),
            line: message.clone()
          }
        );
        failed_videos += 1;
        completed_videos += 1;
        let overall = completed_videos as f64 / total_videos as f64 * 100.0;
        emit_dataset_progress(
          &window,
          &job_id_thread,
          &current_name,
          100.0,
          overall,
          total_videos,
          completed_videos
        );
        continue;
      }

      emit_dataset_progress(
        &window,
        &job_id_thread,
        &current_name,
        0.0,
        completed_videos as f64 / total_videos as f64 * 100.0,
        total_videos,
        completed_videos
      );

      let filter = match build_dataset_filter(&request, &video_path_str) {
        Ok(filter) => filter,
        Err(err) => {
          let message = format!("{}: {}", video_path_str, err);
          append_error_log(&output_root, &message);
          let _ = window.emit(
            "ffmpeg-log",
            LogEvent {
              job_id: job_id_thread.clone(),
              stream: "stderr".to_string(),
              line: message.clone()
            }
          );
          failed_videos += 1;
          completed_videos += 1;
          let overall = completed_videos as f64 / total_videos as f64 * 100.0;
          emit_dataset_progress(
            &window,
            &job_id_thread,
            &current_name,
            100.0,
            overall,
            total_videos,
            completed_videos
          );
          continue;
        }
      };

      let output_pattern = video_dir.join(format!("{}_%06d.png", video_id));
      let mut args = vec![
        "-i".to_string(),
        video_path_str.clone(),
        "-vf".to_string(),
        filter,
        "-vsync".to_string(),
        "0".to_string(),
        "-c:v".to_string(),
        "png".to_string(),
        output_pattern.to_string_lossy().to_string()
      ];

      args = prepare_ffmpeg_args(args);
      let mut child = match Command::new("ffmpeg")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn() {
        Ok(child) => child,
        Err(err) => {
          let message = format!("Failed to start ffmpeg for {}: {}", video_path_str, err);
          append_error_log(&output_root, &message);
          let _ = window.emit(
            "ffmpeg-log",
            LogEvent {
              job_id: job_id_thread.clone(),
              stream: "stderr".to_string(),
              line: message.clone()
            }
          );
          failed_videos += 1;
          completed_videos += 1;
          let overall = completed_videos as f64 / total_videos as f64 * 100.0;
          emit_dataset_progress(
            &window,
            &job_id_thread,
            &current_name,
            100.0,
            overall,
            total_videos,
            completed_videos
          );
          continue;
        }
      };

      let duration_ms = probe_duration_ms(&video_path_str);
      let stdout = child.stdout.take();
      let stderr = child.stderr.take();
      let child_handle = Arc::new(Mutex::new(child));
      if let Ok(mut jobs) = registry.lock() {
        jobs.insert(job_id_thread.clone(), child_handle.clone());
      }

      let showinfo_store = Arc::new(Mutex::new(Vec::<FrameMeta>::new()));
      if let Some(stdout) = stdout {
        spawn_dataset_progress_thread(
          window.clone(),
          job_id_thread.clone(),
          stdout,
          duration_ms,
          current_name.clone(),
          total_videos,
          completed_videos
        );
      }
      if let Some(stderr) = stderr {
        spawn_log_thread(
          window.clone(),
          job_id_thread.clone(),
          stderr,
          Some(showinfo_store.clone())
        );
      }

      let status = match child_handle.lock() {
        Ok(mut child) => child.wait().ok(),
        Err(_) => None
      };
      let success = status.map(|s| s.success()).unwrap_or(false);

      if !success {
        let message = format!("FFmpeg failed for {}", video_path_str);
        append_error_log(&output_root, &message);
        let _ = window.emit(
          "ffmpeg-log",
          LogEvent {
            job_id: job_id_thread.clone(),
            stream: "stderr".to_string(),
            line: message.clone()
          }
        );
        failed_videos += 1;
        completed_videos += 1;
        let overall = completed_videos as f64 / total_videos as f64 * 100.0;
        emit_dataset_progress(
          &window,
          &job_id_thread,
          &current_name,
          100.0,
          overall,
          total_videos,
          completed_videos
        );
        continue;
      }

      let frames = showinfo_store.lock().map(|v| v.clone()).unwrap_or_default();
      match build_manifest_entries_for_video(&frames, &video_dir, &video_id, &video_path_str) {
        Ok(entries) => {
          let manifest_path = video_dir.join("manifest.csv");
          if let Err(err) = write_manifest_csv(&manifest_path, &entries) {
            let message = format!("{}: {}", manifest_path.to_string_lossy(), err);
            append_error_log(&output_root, &message);
          }
          global_entries.extend(entries);
        }
        Err(err) => {
          let message = format!("{}: {}", video_path_str, err);
          append_error_log(&output_root, &message);
        }
      }

      completed_videos += 1;
      let overall = completed_videos as f64 / total_videos as f64 * 100.0;
      emit_dataset_progress(
        &window,
        &job_id_thread,
        &current_name,
        100.0,
        overall,
        total_videos,
        completed_videos
      );
    }

    let global_manifest_path = output_root.join("global_manifest.csv");
    if let Err(err) = write_manifest_csv(&global_manifest_path, &global_entries) {
      let message = format!("{}: {}", global_manifest_path.to_string_lossy(), err);
      append_error_log(&output_root, &message);
    }

    let payload = DatasetCompleteEvent {
      job_id: job_id_thread.clone(),
      global_manifest_csv: global_manifest_path.to_string_lossy().to_string(),
      frame_count: global_entries.len(),
      video_count: total_videos
    };
    let _ = window.emit("dataset-complete", payload);

    if let Ok(mut jobs) = registry.lock() {
      jobs.remove(&job_id_thread);
    }

    let success = failed_videos == 0;
    let payload = ExitEvent {
      job_id: job_id_thread.clone(),
      code: if success { 0 } else { 1 },
      success,
      error: if success {
        None
      } else {
        Some(format!("{} videos failed. See errors.log.", failed_videos))
      }
    };
    let _ = window.emit("ffmpeg-exit", payload);
  });

  Ok(job_id)
}

#[tauri::command]
pub fn run_standardization_batch(
  window: Window,
  state: tauri::State<JobRegistry>,
  request: StandardizeRequest
) -> Result<String, String> {
  if request.inputs.is_empty() {
    return Err("No input files provided.".to_string());
  }

  create_dir_all(&request.output_dir).map_err(|err| err.to_string())?;

  let job_id = Uuid::new_v4().to_string();
  let registry = state.jobs.clone();
  let output_dir = PathBuf::from(request.output_dir.clone());
  let job_id_thread = job_id.clone();

  std::thread::spawn(move || {
    let total = request.inputs.len() as f64;
    let mut entries: Vec<StandardizationEntry> = Vec::new();
    let mut success = true;
    let mut error_message: Option<String> = None;

    for (index, input) in request.inputs.iter().enumerate() {
      emit_simple_progress(&window, &job_id_thread, index as f64 / total);

      let input_path = PathBuf::from(input);
      let base = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("input")
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect::<String>();

      let (output_path, args, mode_label, entry_fps, entry_interpolate, entry_codec, entry_container, entry_rate, entry_channels, entry_format) = if request.mode == "audio" {
        let rate = request.audio_rate.unwrap_or(16000);
        let channels = request.audio_channels.unwrap_or(1).clamp(1, 2);
        let format = request.audio_format.clone().unwrap_or_else(|| "wav".to_string());
        let codec = match format.as_str() {
          "wav" => "pcm_s16le",
          "flac" => "flac",
          _ => {
            let message = "Unsupported audio format. Use wav or flac.".to_string();
            let _ = window.emit(
              "ffmpeg-log",
              LogEvent {
                job_id: job_id_thread.clone(),
                stream: "stderr".to_string(),
                line: message.clone()
              }
            );
            success = false;
            error_message = Some(message);
            break;
          }
        };
        let output_path = output_dir.join(format!("{}_std.{}", base, format.as_str()));
        let args = vec![
          "-y".to_string(),
          "-i".to_string(),
          input.to_string(),
          "-vn".to_string(),
          "-ar".to_string(),
          rate.to_string(),
          "-ac".to_string(),
          channels.to_string(),
          "-c:a".to_string(),
          codec.to_string(),
          output_path.to_string_lossy().to_string()
        ];
        (
          output_path,
          args,
          "audio".to_string(),
          None,
          None,
          None,
          None,
          Some(rate),
          Some(channels),
          Some(format)
        )
      } else {
        let fps = request.fps.unwrap_or(30.0).max(0.1);
        let interpolate = request.interpolate.unwrap_or(false);
        let reencode = request.reencode.unwrap_or(true);
        if !reencode {
          let message = "FPS normalization requires re-encoding. Enable re-encode.".to_string();
          let _ = window.emit(
            "ffmpeg-log",
            LogEvent {
              job_id: job_id_thread.clone(),
              stream: "stderr".to_string(),
              line: message.clone()
            }
          );
          success = false;
          error_message = Some(message);
          break;
        }
        let codec = request.video_codec.clone().unwrap_or_else(|| "libx264".to_string());
        if !["libx264", "libx265", "libsvtav1", "mpeg4"].contains(&codec.as_str()) {
          let message = "Unsupported video codec.".to_string();
          let _ = window.emit(
            "ffmpeg-log",
            LogEvent {
              job_id: job_id_thread.clone(),
              stream: "stderr".to_string(),
              line: message.clone()
            }
          );
          success = false;
          error_message = Some(message);
          break;
        }
        let container = request.video_container.clone().unwrap_or_else(|| "mp4".to_string());
        if let Err(message) = validate_video_target(&codec, &container) {
          let _ = window.emit(
            "ffmpeg-log",
            LogEvent {
              job_id: job_id_thread.clone(),
              stream: "stderr".to_string(),
              line: message.clone()
            }
          );
          success = false;
          error_message = Some(message);
          break;
        }
        let output_path = output_dir.join(format!("{}_std.{}", base, container.as_str()));
        let mut args = vec![
          "-y".to_string(),
          "-i".to_string(),
          input.to_string(),
          "-r".to_string(),
          format!("{}", fps),
          "-c:v".to_string(),
          codec.clone(),
          "-pix_fmt".to_string(),
          "yuv420p".to_string(),
          "-c:a".to_string(),
          "copy".to_string()
        ];
        if interpolate {
          args.push("-vf".to_string());
          args.push(format!("minterpolate=fps={}", fps));
        }
        args.push(output_path.to_string_lossy().to_string());
        (
          output_path,
          args,
          "video".to_string(),
          Some(fps),
          Some(interpolate),
          Some(codec),
          Some(container),
          None,
          None,
          None
        )
      };

      if !success {
        break;
      }

      let args = prepare_ffmpeg_args(args);
      let mut child = match Command::new("ffmpeg")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn() {
        Ok(child) => child,
        Err(err) => {
          let message = format!("Failed to start ffmpeg: {}", err);
          let _ = window.emit(
            "ffmpeg-log",
            LogEvent {
              job_id: job_id_thread.clone(),
              stream: "stderr".to_string(),
              line: message.clone()
            }
          );
          success = false;
          error_message = Some(message);
          break;
        }
      };

      let stdout = child.stdout.take();
      let stderr = child.stderr.take();
      let child_handle = Arc::new(Mutex::new(child));
      if let Ok(mut jobs) = registry.lock() {
        jobs.insert(job_id_thread.clone(), child_handle.clone());
      }

      if let Some(stdout) = stdout {
        spawn_progress_thread(window.clone(), job_id_thread.clone(), stdout, None);
      }
      if let Some(stderr) = stderr {
        spawn_log_thread(window.clone(), job_id_thread.clone(), stderr, None);
      }

      let status = match child_handle.lock() {
        Ok(mut child) => child.wait().ok(),
        Err(_) => None
      };
      let success = status.map(|s| s.success()).unwrap_or(false);

      if !success {
        let message = "Standardization failed for a file.".to_string();
        let _ = window.emit(
          "ffmpeg-log",
          LogEvent {
            job_id: job_id_thread.clone(),
            stream: "stderr".to_string(),
            line: message.clone()
          }
        );
        error_message = Some(message);
        break;
      }

      let checksum = sha256_file(&output_path).unwrap_or_else(|_| "".to_string());
      let (resolution, duration) = probe_output_details(&output_path.to_string_lossy());

      entries.push(StandardizationEntry {
        source_path: input.to_string(),
        output_path: output_path.to_string_lossy().to_string(),
        mode: mode_label.clone(),
        fps: entry_fps,
        interpolate: entry_interpolate,
        video_codec: entry_codec,
        video_container: entry_container,
        audio_rate: entry_rate,
        audio_channels: entry_channels,
        audio_format: entry_format,
        resolution,
        duration,
        sha256: checksum
      });

      emit_simple_progress(&window, &job_id_thread, (index + 1) as f64 / total);
    }

    if let Ok(summary_path) = write_summary(&output_dir, &entries) {
      let payload = StandardizationCompleteEvent {
        job_id: job_id_thread.clone(),
        summary_path,
        item_count: entries.len()
      };
      let _ = window.emit("standardization-complete", payload);
    }

    if let Ok(mut jobs) = registry.lock() {
      jobs.remove(&job_id_thread);
    }

    let payload = ExitEvent {
      job_id: job_id_thread.clone(),
      code: if success { 0 } else { 1 },
      success,
      error: if success { None } else { Some(error_message.unwrap_or_else(|| "Standardization failed.".to_string())) }
    };
    let _ = window.emit("ffmpeg-exit", payload);
  });

  Ok(job_id)
}

fn build_manifest_entries_for_video(
  frames: &[FrameMeta],
  video_dir: &PathBuf,
  video_id: &str,
  source_video: &str
) -> Result<Vec<ManifestEntry>, String> {
  let mut files: Vec<PathBuf> = read_dir(video_dir)
    .map_err(|err| err.to_string())?
    .filter_map(|entry| entry.ok().map(|e| e.path()))
    .filter(|path| path.extension().and_then(|e| e.to_str()) == Some("png"))
    .collect();

  files.sort();

  let mut entries: Vec<ManifestEntry> = Vec::new();
  for (index, file_path) in files.iter().enumerate() {
    let timestamp = frames
      .get(index)
      .map(|frame| frame.timestamp)
      .unwrap_or(0.0);
    let frame_index = frames
      .get(index)
      .map(|frame| frame.frame_index + 1)
      .unwrap_or((index as u64) + 1);
    let filename = file_path
      .file_name()
      .and_then(|name| name.to_str())
      .unwrap_or("frame.png");
    let rel_path = PathBuf::from(video_id).join(filename);
    let rel_path = rel_path.to_string_lossy().replace('\\', "/");

    entries.push(ManifestEntry {
      source_video: source_video.to_string(),
      video_id: video_id.to_string(),
      frame_index,
      timestamp,
      relative_output_path: rel_path
    });
  }

  Ok(entries)
}

#[tauri::command]
pub fn cancel_job(state: tauri::State<JobRegistry>, job_id: String) -> Result<(), String> {
  let jobs = state.jobs.lock().map_err(|_| "Job registry poisoned")?;
  let child = jobs.get(&job_id).ok_or("Job not found")?.clone();
  drop(jobs);
  child
    .lock()
    .map_err(|_| "Job lock poisoned")?
    .kill()
    .map_err(|err| err.to_string())?;
  Ok(())
}
