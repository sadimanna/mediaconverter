#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ffmpeg;
mod progress;

use tauri::Manager;

fn main() {
  tauri::Builder::default()
    .manage(ffmpeg::JobRegistry::default())
    .invoke_handler(tauri::generate_handler![
      ffmpeg::run_ffmpeg,
      ffmpeg::run_ffmpeg_with_progress,
      ffmpeg::run_ffmpeg_image_sequence,
      ffmpeg::run_dataset_extraction,
      ffmpeg::run_standardization_batch,
      ffmpeg::probe_video,
      ffmpeg::copy_file,
      ffmpeg::scan_video_folder,
      ffmpeg::scan_media_folder,
      ffmpeg::inspect_media,
      ffmpeg::write_text_file,
      ffmpeg::cancel_job,
      ffmpeg::check_ffmpeg
    ])
    .setup(|app| {
      if let Some(window) = app.get_window("main") {
        ffmpeg::emit_ffmpeg_check(&window);
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
