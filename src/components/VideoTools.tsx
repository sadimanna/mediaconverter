import React, { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/api/dialog";
import presetsData from "../../presets.json";
import FilePicker from "./FilePicker";

type Preset = {
  id: string;
  label: string;
  formats: string[];
  args: string[];
};

type AudioPreset = {
  id: string;
  label: string;
  ext: string;
  args: string[];
};

type VideoJobInput = {
  name: string;
  args: string[];
  output?: string;
  kind?: "ffmpeg" | "image-sequence";
  inputs?: string[];
  frameRate?: number;
};

type VideoToolsProps = {
  onAddJob: (job: VideoJobInput) => void;
};

const VIDEO_FORMATS = ["mp4", "mkv", "webm", "avi", "mov"];

const videoPresets = (presetsData as { video_presets: Preset[] }).video_presets;
const audioPresets = (presetsData as { audio_extract: AudioPreset[] }).audio_extract;

const defaultPresetFor = (format: string) =>
  videoPresets.find((preset) => preset.formats.includes(format))?.id ?? videoPresets[0]?.id ?? "";

const buildOutputPath = async (defaultName?: string) => {
  const path = await save({
    defaultPath: defaultName
  });
  return path || "";
};

const joinArgs = (...chunks: (string | string[])[]): string[] => {
  const out: string[] = [];
  chunks.forEach((chunk) => {
    if (Array.isArray(chunk)) {
      out.push(...chunk);
    } else if (chunk) {
      out.push(chunk);
    }
  });
  return out;
};

const normalizeFrameRate = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 30;
  return Math.min(120, Math.max(1, parsed));
};

export default function VideoTools({ onAddJob }: VideoToolsProps) {
  const [convertInput, setConvertInput] = useState<string[]>([]);
  const [convertOutput, setConvertOutput] = useState("");
  const [convertFormat, setConvertFormat] = useState("mp4");
  const [convertPreset, setConvertPreset] = useState(defaultPresetFor("mp4"));
  const [convertMode, setConvertMode] = useState<"convert" | "remux">("convert");

  const [trimInput, setTrimInput] = useState<string[]>([]);
  const [trimOutput, setTrimOutput] = useState("");
  const [trimStart, setTrimStart] = useState("00:00:00");
  const [trimEnd, setTrimEnd] = useState("");

  const [extractInput, setExtractInput] = useState<string[]>([]);
  const [extractOutput, setExtractOutput] = useState("");
  const [extractPreset, setExtractPreset] = useState(audioPresets[0]?.id ?? "");

  const [mergeVideo, setMergeVideo] = useState<string[]>([]);
  const [mergeAudio, setMergeAudio] = useState<string[]>([]);
  const [mergeOutput, setMergeOutput] = useState("");

  const [gifInput, setGifInput] = useState<string[]>([]);
  const [gifOutput, setGifOutput] = useState("");
  const [gifFormat, setGifFormat] = useState("mp4");
  const [gifPreset, setGifPreset] = useState(defaultPresetFor("mp4"));

  const [sequenceInputs, setSequenceInputs] = useState<string[]>([]);
  const [sequenceOutput, setSequenceOutput] = useState("");
  const [sequenceFormat, setSequenceFormat] = useState("mp4");
  const [sequencePreset, setSequencePreset] = useState(defaultPresetFor("mp4"));
  const [sequenceFrameRate, setSequenceFrameRate] = useState("30");
  const [sequenceSort, setSequenceSort] = useState(true);

  const filteredPresets = useMemo(
    () => videoPresets.filter((preset) => preset.formats.includes(convertFormat)),
    [convertFormat]
  );

  const selectedPreset = useMemo(
    () => filteredPresets.find((preset) => preset.id === convertPreset),
    [convertPreset, filteredPresets]
  );

  const selectedAudioPreset = useMemo(
    () => audioPresets.find((preset) => preset.id === extractPreset),
    [extractPreset]
  );

  const gifPresets = useMemo(
    () => videoPresets.filter((preset) => preset.formats.includes(gifFormat)),
    [gifFormat]
  );

  const selectedGifPreset = useMemo(
    () => gifPresets.find((preset) => preset.id === gifPreset),
    [gifPreset, gifPresets]
  );

  const sequencePresets = useMemo(
    () => videoPresets.filter((preset) => preset.formats.includes(sequenceFormat)),
    [sequenceFormat]
  );

  const selectedSequencePreset = useMemo(
    () => sequencePresets.find((preset) => preset.id === sequencePreset),
    [sequencePreset, sequencePresets]
  );

  useEffect(() => {
    if (convertMode === "remux") return;
    if (!selectedPreset) {
      setConvertPreset(filteredPresets[0]?.id ?? "");
    }
  }, [convertMode, convertFormat, filteredPresets, selectedPreset]);

  useEffect(() => {
    if (!selectedGifPreset) {
      setGifPreset(gifPresets[0]?.id ?? "");
    }
  }, [gifFormat, gifPresets, selectedGifPreset]);

  useEffect(() => {
    if (!selectedSequencePreset) {
      setSequencePreset(sequencePresets[0]?.id ?? "");
    }
  }, [sequenceFormat, sequencePresets, selectedSequencePreset]);

  const handleConvert = async () => {
    const input = convertInput[0];
    if (!input) return;
    if (convertMode === "convert" && !selectedPreset) return;

    const output = convertOutput || (await buildOutputPath(`output.${convertFormat}`));
    if (!output) return;

    const args = convertMode === "remux"
      ? joinArgs(["-i", input, "-c", "copy", output])
      : joinArgs(["-i", input], selectedPreset?.args ?? [], [output]);

    onAddJob({
      name: convertMode === "remux" ? "Remux Video" : "Convert Video",
      args,
      output
    });
  };

  const handleTrim = async () => {
    const input = trimInput[0];
    if (!input) return;
    const output = trimOutput || (await buildOutputPath("trimmed.mp4"));
    if (!output) return;

    const args = joinArgs([
      "-ss",
      trimStart,
      ...(trimEnd ? ["-to", trimEnd] : []),
      "-i",
      input,
      "-c",
      "copy",
      output
    ]);

    onAddJob({ name: "Trim Video", args, output });
  };

  const handleExtract = async () => {
    const input = extractInput[0];
    if (!input || !selectedAudioPreset) return;
    const output = extractOutput || (await buildOutputPath(`audio.${selectedAudioPreset.ext}`));
    if (!output) return;

    const args = joinArgs(["-i", input], selectedAudioPreset.args, [output]);
    onAddJob({ name: "Extract Audio", args, output });
  };

  const handleMerge = async () => {
    const video = mergeVideo[0];
    const audio = mergeAudio[0];
    if (!video || !audio) return;
    const output = mergeOutput || (await buildOutputPath("merged.mp4"));
    if (!output) return;

    const args = joinArgs([
      "-i",
      video,
      "-i",
      audio,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      output
    ]);

    onAddJob({ name: "Merge Audio + Video", args, output });
  };

  const handleGif = async () => {
    const input = gifInput[0];
    if (!input || !selectedGifPreset) return;
    const output = gifOutput || (await buildOutputPath(`animation.${gifFormat}`));
    if (!output) return;

    const args = joinArgs(["-i", input], selectedGifPreset.args, [output]);
    onAddJob({ name: "GIF to Video", args, output });
  };

  const handleSequence = async () => {
    if (sequenceInputs.length === 0 || !selectedSequencePreset) return;
    const output = sequenceOutput || (await buildOutputPath(`sequence.${sequenceFormat}`));
    if (!output) return;

    const inputs = sequenceSort ? [...sequenceInputs].sort((a, b) => a.localeCompare(b)) : sequenceInputs;
    const frameRate = normalizeFrameRate(sequenceFrameRate);

    onAddJob({
      name: "Images to Video",
      kind: "image-sequence",
      inputs,
      frameRate,
      args: selectedSequencePreset.args,
      output
    });
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title text-lg">Convert or Remux</h2>
          <span className="badge">Video</span>
        </div>
        <FilePicker
          label="Source video"
          value={convertInput}
          onPick={setConvertInput}
          accept={[".mp4", ".mkv", ".webm", ".avi", ".mov"]}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <label className="text-xs text-slate-400">Mode</label>
            <select className="select" value={convertMode} onChange={(e) => setConvertMode(e.target.value as "convert" | "remux")}>
              <option value="convert">Convert</option>
              <option value="remux">Remux (copy streams)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Preset</label>
            <select
              className="select"
              value={convertPreset}
              onChange={(e) => setConvertPreset(e.target.value)}
              disabled={convertMode === "remux" || filteredPresets.length === 0}
            >
              {filteredPresets.length === 0 ? (
                <option value="">No presets for {convertFormat.toUpperCase()}</option>
              ) : (
                filteredPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Format</label>
            <select className="select" value={convertFormat} onChange={(e) => setConvertFormat(e.target.value)}>
              {VIDEO_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            className="input"
            placeholder="Output path"
            value={convertOutput}
            onChange={(e) => setConvertOutput(e.target.value)}
          />
          <button
            className="btn-secondary"
            onClick={async () => setConvertOutput((await buildOutputPath(`output.${convertFormat}`)) || "")}
          >
            Choose output
          </button>
        </div>
        <button className="btn-primary" onClick={handleConvert}>
          Add Job
        </button>
      </div>

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title text-lg">Trim Video</h2>
          <span className="badge">Segment</span>
        </div>
        <FilePicker label="Source video" value={trimInput} onPick={setTrimInput} accept={[".mp4", ".mkv", ".webm", ".avi", ".mov"]} />
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-slate-400">Start (HH:MM:SS)</label>
            <input className="input" value={trimStart} onChange={(e) => setTrimStart(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400">End (optional)</label>
            <input className="input" placeholder="00:00:20" value={trimEnd} onChange={(e) => setTrimEnd(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className="btn-secondary w-full" onClick={async () => setTrimOutput((await buildOutputPath("trimmed.mp4")) || "")}>Choose output</button>
          </div>
        </div>
        <input className="input" placeholder="Output path" value={trimOutput} onChange={(e) => setTrimOutput(e.target.value)} />
        <button className="btn-primary" onClick={handleTrim}>
          Add Job
        </button>
      </div>

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title text-lg">Extract Audio</h2>
          <span className="badge">Audio</span>
        </div>
        <FilePicker label="Source video" value={extractInput} onPick={setExtractInput} accept={[".mp4", ".mkv", ".webm", ".avi", ".mov"]} />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-slate-400">Format</label>
            <select className="select" value={extractPreset} onChange={(e) => setExtractPreset(e.target.value)}>
              {audioPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn-secondary w-full" onClick={async () => setExtractOutput((await buildOutputPath(`audio.${selectedAudioPreset?.ext || "mp3"}`)) || "")}>Choose output</button>
          </div>
        </div>
        <input className="input" placeholder="Output path" value={extractOutput} onChange={(e) => setExtractOutput(e.target.value)} />
        <button className="btn-primary" onClick={handleExtract}>
          Add Job
        </button>
      </div>

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title text-lg">Merge External Audio</h2>
          <span className="badge">AV Merge</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <FilePicker label="Video input" value={mergeVideo} onPick={setMergeVideo} accept={[".mp4", ".mkv", ".webm", ".avi", ".mov"]} />
          <FilePicker label="Audio input" value={mergeAudio} onPick={setMergeAudio} accept={[".mp3", ".wav", ".aac", ".m4a", ".flac"]} />
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input className="input" placeholder="Output path" value={mergeOutput} onChange={(e) => setMergeOutput(e.target.value)} />
          <button className="btn-secondary" onClick={async () => setMergeOutput((await buildOutputPath("merged.mp4")) || "")}>Choose output</button>
        </div>
        <button className="btn-primary" onClick={handleMerge}>
          Add Job
        </button>
      </div>

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title text-lg">GIF to Video</h2>
          <span className="badge">Animation</span>
        </div>
        <FilePicker label="GIF input" value={gifInput} onPick={setGifInput} accept={[".gif"]} />
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-slate-400">Preset</label>
            <select className="select" value={gifPreset} onChange={(e) => setGifPreset(e.target.value)}>
              {gifPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Format</label>
            <select className="select" value={gifFormat} onChange={(e) => setGifFormat(e.target.value)}>
              {VIDEO_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input className="input" placeholder="Output path" value={gifOutput} onChange={(e) => setGifOutput(e.target.value)} />
          <button className="btn-secondary" onClick={async () => setGifOutput((await buildOutputPath(`animation.${gifFormat}`)) || "")}>Choose output</button>
        </div>
        <button className="btn-primary" onClick={handleGif}>
          Add Job
        </button>
      </div>

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title text-lg">Images to Video</h2>
          <span className="badge">Batch</span>
        </div>
        <FilePicker label="Image sequence" value={sequenceInputs} onPick={setSequenceInputs} multiple accept={[".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"]} />
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="text-xs text-slate-400">Frame Rate</label>
            <input className="input" value={sequenceFrameRate} onChange={(e) => setSequenceFrameRate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Preset</label>
            <select className="select" value={sequencePreset} onChange={(e) => setSequencePreset(e.target.value)}>
              {sequencePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Format</label>
            <select className="select" value={sequenceFormat} onChange={(e) => setSequenceFormat(e.target.value)}>
              {VIDEO_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={sequenceSort} onChange={(e) => setSequenceSort(e.target.checked)} />
            Sort by filename
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input className="input" placeholder="Output path" value={sequenceOutput} onChange={(e) => setSequenceOutput(e.target.value)} />
          <button className="btn-secondary" onClick={async () => setSequenceOutput((await buildOutputPath(`sequence.${sequenceFormat}`)) || "")}>Choose output</button>
        </div>
        <button className="btn-primary" onClick={handleSequence}>
          Add Job
        </button>
      </div>
    </div>
  );
}
