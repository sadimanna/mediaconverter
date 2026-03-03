import React, { useMemo, useState } from "react";
import FilePicker from "./FilePicker";
import { StandardizeRequest } from "../api/ffmpeg";

type StandardizeToolsProps = {
  onAddJob: (job: { name: string; kind: "standardize"; standardize: StandardizeRequest; output?: string }) => void;
};

const presetOptions = [
  { id: "custom", label: "Custom" },
  { id: "speech", label: "Speech ML (16kHz mono)" },
  { id: "video-ml", label: "Video ML (30fps H.264)" }
] as const;

type PresetId = (typeof presetOptions)[number]["id"];

export default function StandardizeTools({ onAddJob }: StandardizeToolsProps) {
  const [preset, setPreset] = useState<PresetId>("custom");
  const [mode, setMode] = useState<"video" | "audio">("video");
  const [inputs, setInputs] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState<string[]>([]);

  const [fps, setFps] = useState("30");
  const [interpolate, setInterpolate] = useState(false);
  const [reencode, setReencode] = useState(true);
  const [videoCodec, setVideoCodec] = useState("libx264");
  const [videoContainer, setVideoContainer] = useState("mp4");

  const [audioRate, setAudioRate] = useState("16000");
  const [audioChannels, setAudioChannels] = useState("1");
  const [audioFormat, setAudioFormat] = useState<"wav" | "flac">("wav");

  const parseNumber = (value: string) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
  };

  const handlePresetChange = (value: PresetId) => {
    setPreset(value);
    if (value === "speech") {
      setMode("audio");
      setAudioRate("16000");
      setAudioChannels("1");
      setAudioFormat("wav");
    } else if (value === "video-ml") {
      setMode("video");
      setFps("30");
      setVideoCodec("libx264");
      setVideoContainer("mp4");
      setInterpolate(false);
      setReencode(true);
    }
  };

  const outputHint = useMemo(() => {
    if (mode === "audio") {
      return `Outputs end with _std.${audioFormat}`;
    }
    return `Outputs end with _std.${videoContainer}`;
  }, [mode, audioFormat, videoContainer]);

  const handleAdd = () => {
    const output = outputDir[0];
    if (!output || inputs.length === 0) return;

    const request: StandardizeRequest = {
      mode,
      inputs,
      output_dir: output,
      fps: mode === "video" ? parseNumber(fps) : undefined,
      interpolate: mode === "video" ? interpolate : undefined,
      reencode: mode === "video" ? reencode : undefined,
      video_codec: mode === "video" ? videoCodec : undefined,
      video_container: mode === "video" ? videoContainer : undefined,
      audio_rate: mode === "audio" ? parseNumber(audioRate) : undefined,
      audio_channels: mode === "audio" ? parseNumber(audioChannels) : undefined,
      audio_format: mode === "audio" ? audioFormat : undefined
    };

    onAddJob({
      name: mode === "video" ? "Standardization (Video)" : "Standardization (Audio)",
      kind: "standardize",
      standardize: request,
      output
    });
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title text-lg">Multimodal Standardization</h2>
          <span className="badge">Batch</span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-slate-400">Preset</label>
            <select className="select" value={preset} onChange={(e) => handlePresetChange(e.target.value as PresetId)}>
              {presetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Mode</label>
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value as "video" | "audio")}>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
            </select>
          </div>
        </div>

        <FilePicker
          label="Input files"
          value={inputs}
          onPick={setInputs}
          multiple
          accept={[".mp4", ".mkv", ".mov", ".webm", ".avi", ".wav", ".flac", ".mp3", ".aac", ".m4a"]}
          helper="Select one or more video or audio files. Drag-and-drop supported."
        />
        <FilePicker
          label="Output folder"
          value={outputDir}
          onPick={setOutputDir}
          directory
          helper={`Standardized outputs and dataset_summary.json will be written here. ${outputHint}`}
        />

        {mode === "video" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs text-slate-400">Target FPS</label>
              <input className="input" value={fps} onChange={(e) => setFps(e.target.value)} />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-mint"
                  checked={reencode}
                  onChange={(e) => setReencode(e.target.checked)}
                />
                Re-encode (required for FPS changes)
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-mint"
                  checked={interpolate}
                  onChange={(e) => setInterpolate(e.target.checked)}
                />
                Interpolate frames
              </label>
            </div>
            <div>
              <label className="text-xs text-slate-400">Video Codec</label>
              <select className="select" value={videoCodec} onChange={(e) => setVideoCodec(e.target.value)}>
                <option value="libx264">H.264 (libx264)</option>
                <option value="libx265">H.265 (libx265)</option>
                <option value="libsvtav1">AV1 (libsvtav1)</option>
                <option value="mpeg4">MPEG-4 Part 2</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400">Container</label>
              <select className="select" value={videoContainer} onChange={(e) => setVideoContainer(e.target.value)}>
                <option value="mp4">MP4</option>
                <option value="mkv">MKV</option>
                <option value="mov">MOV</option>
                <option value="avi">AVI</option>
                <option value="webm">WebM</option>
              </select>
            </div>
          </div>
        ) : null}

        {mode === "audio" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs text-slate-400">Sample Rate (Hz)</label>
              <input className="input" value={audioRate} onChange={(e) => setAudioRate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400">Channels</label>
              <select className="select" value={audioChannels} onChange={(e) => setAudioChannels(e.target.value)}>
                <option value="1">Mono</option>
                <option value="2">Stereo</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400">Format</label>
              <select className="select" value={audioFormat} onChange={(e) => setAudioFormat(e.target.value as "wav" | "flac")}>
                <option value="wav">WAV</option>
                <option value="flac">FLAC</option>
              </select>
            </div>
          </div>
        ) : null}

        <button className="btn-primary" onClick={handleAdd}>
          Add Job
        </button>
      </div>
    </div>
  );
}
