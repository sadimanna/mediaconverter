import React, { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/api/dialog";
import FilePicker from "./FilePicker";
import { inspectMedia, InspectorSummary, scanMediaFolder, writeTextFile } from "../api/ffmpeg";

const formatNumber = (value?: number, digits = 2) => {
  if (value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
};

const buildCsv = (entries: InspectorSummary["entries"]) => {
  const escape = (value: string) => {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const header = [
    "path",
    "media_type",
    "codec",
    "duration",
    "resolution",
    "fps",
    "audio_sample_rate",
    "error"
  ].join(",");

  const rows = entries.map((entry) =>
    [
      entry.path ?? "",
      entry.media_type ?? "",
      entry.codec ?? "",
      entry.duration !== undefined ? entry.duration.toFixed(3) : "",
      entry.resolution ?? "",
      entry.fps !== undefined ? entry.fps.toFixed(3) : "",
      entry.audio_sample_rate !== undefined ? String(entry.audio_sample_rate) : "",
      entry.error ?? ""
    ]
      .map((value) => escape(String(value)))
      .join(",")
  );

  return [header, ...rows].join("\n");
};

const countMedia = (paths: string[]) => {
  const videoExt = new Set(["mp4", "mkv", "mov", "avi", "webm"]);
  const imageExt = new Set(["png", "jpg", "jpeg", "webp", "tiff", "tif"]);
  let videos = 0;
  let images = 0;
  for (const path of paths) {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (videoExt.has(ext)) videos += 1;
    if (imageExt.has(ext)) images += 1;
  }
  return { videos, images };
};

export default function InspectorTools() {
  const [inputDir, setInputDir] = useState<string[]>([]);
  const [detected, setDetected] = useState<string[]>([]);
  const [summary, setSummary] = useState<InspectorSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const folder = inputDir[0];
    if (!folder) {
      setDetected([]);
      return;
    }
    void scanMediaFolder(folder)
      .then(setDetected)
      .catch(() => setDetected([]));
  }, [inputDir]);

  const counts = useMemo(() => countMedia(detected), [detected]);

  const handleInspect = async () => {
    const folder = inputDir[0];
    if (!folder) return;
    setLoading(true);
    setError(null);
    try {
      const result = await inspectMedia(folder);
      setSummary(result);
    } catch (err) {
      setSummary(null);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!summary) return;
    const destination = await save({ defaultPath: "dataset_summary.csv" });
    if (!destination) return;
    const csv = buildCsv(summary.entries);
    await writeTextFile(destination, csv);
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title text-lg">Media Inspector</h2>
          <span className="badge">FFprobe</span>
        </div>

        <FilePicker
          label="Input folder"
          value={inputDir}
          onPick={setInputDir}
          directory
          helper="Top-level only. Videos and images are detected by extension."
        />

        <div className="text-xs text-slate-400">
          Detected files: {detected.length} (videos: {counts.videos}, images: {counts.images})
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={handleInspect} disabled={loading || detected.length === 0}>
            {loading ? "Inspecting..." : "Run Inspector"}
          </button>
          {summary ? (
            <button className="btn-secondary" onClick={handleExport}>
              Save dataset_summary.csv
            </button>
          ) : null}
        </div>

        {error ? <div className="text-xs text-coral">{error}</div> : null}
      </div>

      {summary ? (
        <div className="space-y-4">
          <div className="glass-card p-5 space-y-2 text-sm text-slate-200">
            <h3 className="section-title text-base">Summary</h3>
            <div>Total files: {summary.stats.total_files}</div>
            <div>Videos: {summary.stats.video_count}</div>
            <div>Images: {summary.stats.image_count}</div>
            {summary.stats.duration ? (
              <div>
                Duration (s) min/mean/max: {formatNumber(summary.stats.duration.min)} /{" "}
                {formatNumber(summary.stats.duration.mean)} / {formatNumber(summary.stats.duration.max)}
              </div>
            ) : null}
            {summary.stats.resolution_distribution.length > 0 ? (
              <div>
                Resolution distribution:{" "}
                {summary.stats.resolution_distribution.map((item) => `${item.value} (${item.count})`).join(", ")}
              </div>
            ) : null}
            {summary.stats.fps_distribution.length > 0 ? (
              <div>
                FPS distribution:{" "}
                {summary.stats.fps_distribution.map((item) => `${item.value} (${item.count})`).join(", ")}
              </div>
            ) : null}
          </div>

          <div className="glass-card p-5">
            <h3 className="section-title text-base">Per-file Info</h3>
            <div className="mt-3 overflow-auto">
              <table className="w-full text-xs text-slate-200">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-2 text-left">File</th>
                    <th className="pb-2 text-left">Type</th>
                    <th className="pb-2 text-left">Codec</th>
                    <th className="pb-2 text-left">Duration</th>
                    <th className="pb-2 text-left">Resolution</th>
                    <th className="pb-2 text-left">FPS</th>
                    <th className="pb-2 text-left">Audio Hz</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.entries.map((entry) => (
                    <tr key={entry.path} className="border-t border-slate-800/50">
                      <td className="py-2 pr-4 max-w-[280px] truncate">{entry.path}</td>
                      <td className="py-2 pr-4">{entry.media_type}</td>
                      <td className="py-2 pr-4">{entry.codec ?? "-"}</td>
                      <td className="py-2 pr-4">{entry.duration ? formatNumber(entry.duration) : "-"}</td>
                      <td className="py-2 pr-4">{entry.resolution ?? "-"}</td>
                      <td className="py-2 pr-4">{entry.fps ? formatNumber(entry.fps) : "-"}</td>
                      <td className="py-2 pr-4">{entry.audio_sample_rate ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
