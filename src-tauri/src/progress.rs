use serde::Serialize;

#[derive(Default, Clone)]
pub struct ProgressState {
  pub out_time_ms: Option<u64>,
  pub fps: Option<f32>,
  pub speed: Option<String>,
  pub progress: String
}

#[derive(Default, Clone, Serialize)]
pub struct ProgressSnapshot {
  pub out_time_ms: Option<u64>,
  pub fps: Option<f32>,
  pub speed: Option<String>,
  pub progress: String
}

impl ProgressState {
  pub fn snapshot(&self) -> ProgressSnapshot {
    ProgressSnapshot {
      out_time_ms: self.out_time_ms,
      fps: self.fps,
      speed: self.speed.clone(),
      progress: self.progress.clone()
    }
  }
}

pub fn parse_progress_line(state: &mut ProgressState, line: &str) -> Option<ProgressSnapshot> {
  let trimmed = line.trim();
  if trimmed.is_empty() {
    return None;
  }

  let (key, value) = match trimmed.split_once('=') {
    Some((key, value)) => (key, value),
    None => return None
  };

  match key {
    "out_time_ms" => {
      state.out_time_ms = value.parse::<u64>().ok();
    }
    "fps" => {
      state.fps = value.parse::<f32>().ok();
    }
    "speed" => {
      state.speed = Some(value.to_string());
    }
    "progress" => {
      state.progress = value.to_string();
      return Some(state.snapshot());
    }
    _ => {}
  }

  None
}
