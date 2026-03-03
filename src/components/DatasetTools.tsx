import React, { useEffect, useMemo, useState } from "react";
import FilePicker from "./FilePicker";
import { DatasetRequest, probeVideo, scanVideoFolder, VideoInfo } from "../api/ffmpeg";

type DatasetToolsProps = {
  onAddJob: (job: { name: string; kind: "dataset"; dataset: DatasetRequest; output?: string }) => void;
};

export default function DatasetTools({ onAddJob }: DatasetToolsProps) {
  const [inputMode, setInputMode] = useState<"file" | "folder">("file");
  const [videoPath, setVideoPath] = useState<string[]>([]);
  const [inputFolder, setInputFolder] = useState<string[]>([]);
  const [detectedVideos, setDetectedVideos] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState<string[]>([]);
  const [outputPath, setOutputPath] = useState("");
  const [mode, setMode] = useState<"fps" | "nth" | "random">("fps");
  const [fps, setFps] = useState("1");
  const [nth, setNth] = useState("10");
  const [k, setK] = useState("100");
  const [seed, setSeed] = useState("42");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);

  useEffect(() => {
    if (inputMode !== "file") {
      setVideoInfo(null);
      return;
    }
    const path = videoPath[0];
    if (!path) {
      setVideoInfo(null);
      return;
    }
    void probeVideo(path)
      .then(setVideoInfo)
      .catch(() => setVideoInfo(null));
  }, [videoPath, inputMode]);

  useEffect(() => {
    if (inputMode === "file") {
      setInputFolder([]);
      setDetectedVideos([]);
    } else {
      setVideoPath([]);
      setVideoInfo(null);
    }
  }, [inputMode]);

  useEffect(() => {
    if (inputMode !== "folder") {
      setDetectedVideos([]);
      return;
    }
    const folder = inputFolder[0];
    if (!folder) {
      setDetectedVideos([]);
      return;
    }
    void scanVideoFolder(folder)
      .then(setDetectedVideos)
      .catch(() => setDetectedVideos([]));
  }, [inputFolder, inputMode]);

  const expectedCount = useMemo(() => {
    if (!videoInfo) return null;
    const duration = videoInfo.duration ?? 0;
    const avgFps = videoInfo.avg_fps ?? 0;
    const total = videoInfo.nb_frames ?? (duration && avgFps ? Math.round(duration * avgFps) : null);

    if (mode === "fps") {
      const fpsVal = Number(fps) || 0;
      if (!duration || !fpsVal) return null;
      return Math.floor(duration * fpsVal);
    }
    if (mode === "nth") {
      const nthVal = Number(nth) || 0;
      if (!total || !nthVal) return null;
      return Math.floor(total / nthVal);
    }
    const kVal = Number(k) || 0;
    if (!total || !kVal) return kVal || null;
    return Math.min(kVal, total);
  }, [videoInfo, mode, fps, nth, k]);

  const handleAdd = () => {
    const output = outputPath.trim() || outputDir[0];
    if (!output) return;

    if (inputMode === "file" && !videoPath[0]) return;
    if (inputMode === "folder" && (!inputFolder[0] || detectedVideos.length === 0)) return;

    const request: DatasetRequest = {
      video_path: inputMode === "file" ? videoPath[0] : undefined,
      input_dir: inputMode === "folder" ? inputFolder[0] : undefined,
      output_dir: output,
      mode,
      fps: mode === "fps" ? Number(fps) : undefined,
      nth: mode === "nth" ? Number(nth) : undefined,
      k: mode === "random" ? Number(k) : undefined,
      seed: mode === "random" ? Number(seed) : undefined
    };

    onAddJob({
      name: "Dataset Extraction",
        kind: "dataset",
        dataset: request,
        output
      });
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title text-lg">Dataset Extraction</h2>
          <span className="badge">Deterministic</span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-slate-400">Input Type</label>
            <select className="select" value={inputMode} onChange={(e) => setInputMode(e.target.value as "file" | "folder")}>
              <option value="file">Select Video</option>
              <option value="folder">Select Folder</option>
            </select>
          </div>
        </div>

        {inputMode === "file" ? (
          <FilePicker
            label="Source video"
            value={videoPath}
            onPick={setVideoPath}
            accept={[".mp4", ".mkv", ".webm", ".avi", ".mov"]}
          />
        ) : (
          <FilePicker
            label="Input folder"
            value={inputFolder}
            onPick={setInputFolder}
            directory
            helper="Top-level only. Subfolders are ignored."
          />
        )}

        {inputMode === "folder" ? (
          <div className="text-xs text-slate-400">Detected videos: {detectedVideos.length}</div>
        ) : null}

        <FilePicker
          label="Output folder"
          value={outputDir}
          onPick={setOutputDir}
          directory
          helper="Select an existing folder or type a new path below."
        />
        <div>
          <label className="text-xs text-slate-400">Or create new folder (path)</label>
          <input
            className="input"
            placeholder="e.g. /Users/name/Datasets/output"
            value={outputPath}
            onChange={(e) => setOutputPath(e.target.value)}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-slate-400">Sampling Mode</label>
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value as "fps" | "nth" | "random")}> 
              <option value="fps">Fixed FPS</option>
              <option value="nth">Every Nth Frame</option>
              <option value="random">Uniform Random K</option>
            </select>
          </div>
          {mode === "fps" ? (
            <div>
              <label className="text-xs text-slate-400">FPS</label>
              <input className="input" value={fps} onChange={(e) => setFps(e.target.value)} />
            </div>
          ) : null}
          {mode === "nth" ? (
            <div>
              <label className="text-xs text-slate-400">Every Nth Frame</label>
              <input className="input" value={nth} onChange={(e) => setNth(e.target.value)} />
            </div>
          ) : null}
          {mode === "random" ? (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-slate-400">K Frames</label>
                <input className="input" value={k} onChange={(e) => setK(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400">Seed</label>
                <input className="input" value={seed} onChange={(e) => setSeed(e.target.value)} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="text-xs text-slate-400">
          {inputMode === "file"
            ? `Expected frame count: ${expectedCount !== null ? expectedCount : "-"}`
            : "Expected frame count: -"}
        </div>

        <button className="btn-primary" onClick={handleAdd}>
          Add Job
        </button>
      </div>
    </div>
  );
}
