import { invoke } from "@tauri-apps/api/tauri";

export type FfmpegProgressEvent = {
  job_id: string;
  out_time_ms?: number;
  percent?: number;
  fps?: number;
  speed?: string;
  progress: string;
};

export type FfmpegLogEvent = {
  job_id: string;
  stream: "stdout" | "stderr";
  line: string;
};

export type FfmpegExitEvent = {
  job_id: string;
  code: number;
  success: boolean;
  error?: string;
};

export type DatasetCompleteEvent = {
  job_id: string;
  global_manifest_csv: string;
  frame_count: number;
  video_count: number;
};

export type DatasetProgressEvent = {
  job_id: string;
  current_video: string;
  per_video_progress: number;
  overall_progress: number;
  total_videos: number;
  completed_videos: number;
};

export type StandardizationCompleteEvent = {
  job_id: string;
  summary_path: string;
  item_count: number;
};

export type FfmpegCheck = {
  available: boolean;
  version?: string;
  error?: string;
};

export type VideoInfo = {
  duration?: number;
  avg_fps?: number;
  nb_frames?: number;
  width?: number;
  height?: number;
};

export type InspectorEntry = {
  path: string;
  media_type: "video" | "image";
  codec?: string;
  duration?: number;
  resolution?: string;
  fps?: number;
  audio_sample_rate?: number;
  error?: string;
};

export type DistributionItem = {
  value: string;
  count: number;
};

export type DurationStats = {
  min: number;
  mean: number;
  max: number;
  count: number;
};

export type InspectorStats = {
  total_files: number;
  video_count: number;
  image_count: number;
  duration?: DurationStats;
  resolution_distribution: DistributionItem[];
  fps_distribution: DistributionItem[];
};

export type InspectorSummary = {
  entries: InspectorEntry[];
  stats: InspectorStats;
};

export type DatasetRequest = {
  video_path?: string;
  input_dir?: string;
  output_dir: string;
  mode: "fps" | "nth" | "random";
  fps?: number;
  nth?: number;
  k?: number;
  seed?: number;
};

export type StandardizeRequest = {
  mode: "video" | "audio";
  inputs: string[];
  output_dir: string;
  fps?: number;
  interpolate?: boolean;
  reencode?: boolean;
  video_codec?: string;
  video_container?: string;
  audio_rate?: number;
  audio_channels?: number;
  audio_format?: "wav" | "flac";
};

export async function runFfmpeg(args: string[]): Promise<string> {
  return invoke<string>("run_ffmpeg", { args });
}

export async function runFfmpegWithProgress(args: string[]): Promise<string> {
  return invoke<string>("run_ffmpeg_with_progress", { args });
}

export async function runFfmpegImageSequence(
  inputs: string[],
  framerate: number,
  args: string[],
  output: string
): Promise<string> {
  return invoke<string>("run_ffmpeg_image_sequence", {
    inputs,
    framerate,
    args,
    output
  });
}

export async function runDatasetExtraction(request: DatasetRequest): Promise<string> {
  return invoke<string>("run_dataset_extraction", { request });
}

export async function scanVideoFolder(path: string): Promise<string[]> {
  return invoke<string[]>("scan_video_folder", { path });
}

export async function scanMediaFolder(path: string): Promise<string[]> {
  return invoke<string[]>("scan_media_folder", { path });
}

export async function inspectMedia(inputDir: string): Promise<InspectorSummary> {
  return invoke<InspectorSummary>("inspect_media", { request: { input_dir: inputDir } });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await invoke<void>("write_text_file", { path, contents });
}

export async function runStandardizationBatch(request: StandardizeRequest): Promise<string> {
  return invoke<string>("run_standardization_batch", { request });
}

export async function probeVideo(path: string): Promise<VideoInfo> {
  return invoke<VideoInfo>("probe_video", { path });
}

export async function copyFile(source: string, destination: string): Promise<void> {
  await invoke<void>("copy_file", { source, destination });
}

export async function cancelJob(jobId: string): Promise<void> {
  await invoke<void>("cancel_job", { job_id: jobId });
}

export async function checkFfmpeg(): Promise<FfmpegCheck> {
  return invoke<FfmpegCheck>("check_ffmpeg");
}
