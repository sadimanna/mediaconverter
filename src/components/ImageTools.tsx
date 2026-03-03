import React, { useMemo, useState } from "react";
import { save } from "@tauri-apps/api/dialog";
import FilePicker from "./FilePicker";

type ImageJobInput = {
  name: string;
  args: string[];
  output?: string;
};

type ImageToolsProps = {
  onAddJob: (job: ImageJobInput) => void;
};

const IMAGE_FORMATS = ["png", "jpg", "webp", "tiff"];

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

const sanitizeDir = (path: string) => path.replace(/[\\/]+$/, "");

const buildOutputPath = async (defaultName?: string) => {
  const path = await save({
    defaultPath: defaultName
  });
  return path || "";
};

const buildImageFilters = (width: string, height: string, grayscale: boolean) => {
  const filters: string[] = [];
  if (width || height) {
    if (width && height) {
      filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
    } else if (width) {
      filters.push(`scale=${width}:-1`);
    } else {
      filters.push(`scale=-1:${height}`);
    }
  }
  if (grayscale) {
    filters.push("format=gray");
  }
  return filters.length ? ["-vf", filters.join(",")] : [];
};

const buildQualityArgs = (format: string, quality: number) => {
  if (format === "jpg") {
    return ["-q:v", Math.max(2, Math.round((100 - quality) / 2)).toString()];
  }
  if (format === "webp") {
    return ["-quality", quality.toString()];
  }
  return [] as string[];
};

const getOutputPath = (dir: string, inputPath: string, format: string) => {
  const normalized = inputPath.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() || "image";
  const base = fileName.replace(/\.[^/.]+$/, "");
  const separator = dir.includes("\\") ? "\\" : "/";
  const cleanDir = sanitizeDir(dir);
  return `${cleanDir}${separator}${base}.${format}`;
};

export default function ImageTools({ onAddJob }: ImageToolsProps) {
  const [convertInput, setConvertInput] = useState<string[]>([]);
  const [convertOutput, setConvertOutput] = useState("");
  const [convertFormat, setConvertFormat] = useState("png");
  const [convertQuality, setConvertQuality] = useState(85);
  const [convertGrayscale, setConvertGrayscale] = useState(false);

  const [batchInputs, setBatchInputs] = useState<string[]>([]);
  const [batchOutputDir, setBatchOutputDir] = useState<string[]>([]);
  const [batchFormat, setBatchFormat] = useState("jpg");
  const [batchQuality, setBatchQuality] = useState(85);
  const [batchGrayscale, setBatchGrayscale] = useState(false);

  const [resizeInput, setResizeInput] = useState<string[]>([]);
  const [resizeOutput, setResizeOutput] = useState("");
  const [resizeWidth, setResizeWidth] = useState("1280");
  const [resizeHeight, setResizeHeight] = useState("");
  const [resizeQuality, setResizeQuality] = useState(85);
  const [resizeGrayscale, setResizeGrayscale] = useState(false);
  const [resizeFormat, setResizeFormat] = useState("jpg");

  const batchOutputPath = useMemo(() => batchOutputDir[0] ?? "", [batchOutputDir]);

  const handleConvert = async () => {
    const input = convertInput[0];
    if (!input) return;
    const output = convertOutput || (await buildOutputPath(`converted.${convertFormat}`));
    if (!output) return;

    const args = joinArgs(
      ["-i", input],
      buildQualityArgs(convertFormat, convertQuality),
      convertGrayscale ? ["-vf", "format=gray"] : [],
      [output]
    );

    onAddJob({ name: "Convert Image", args, output });
  };

  const handleBatch = () => {
    if (batchInputs.length === 0 || !batchOutputPath) return;

    const qualityArgs = buildQualityArgs(batchFormat, batchQuality);
    const filters = batchGrayscale ? ["-vf", "format=gray"] : [];

    batchInputs.forEach((input) => {
      const output = getOutputPath(batchOutputPath, input, batchFormat);
      const args = joinArgs(["-i", input], qualityArgs, filters, [output]);
      onAddJob({ name: "Batch Image Convert", args, output });
    });
  };

  const handleResize = async () => {
    const input = resizeInput[0];
    if (!input) return;
    const output = resizeOutput || (await buildOutputPath(`resized.${resizeFormat}`));
    if (!output) return;

    const args = joinArgs(
      ["-i", input],
      buildImageFilters(resizeWidth, resizeHeight, resizeGrayscale),
      buildQualityArgs(resizeFormat, resizeQuality),
      [output]
    );

    onAddJob({ name: "Resize Image", args, output });
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title text-lg">Convert Image</h2>
          <span className="badge">Single</span>
        </div>
        <FilePicker label="Source image" value={convertInput} onPick={setConvertInput} accept={[".png", ".jpg", ".jpeg", ".webp", ".tiff"]} />
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-slate-400">Format</label>
            <select className="select" value={convertFormat} onChange={(e) => setConvertFormat(e.target.value)}>
              {IMAGE_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Quality</label>
            <input
              className="input"
              type="range"
              min={50}
              max={100}
              value={convertQuality}
              onChange={(e) => setConvertQuality(Number(e.target.value))}
            />
            <div className="text-xs text-slate-500">{convertQuality}</div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={convertGrayscale} onChange={(e) => setConvertGrayscale(e.target.checked)} />
            Grayscale
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input className="input" placeholder="Output path" value={convertOutput} onChange={(e) => setConvertOutput(e.target.value)} />
          <button className="btn-secondary" onClick={async () => setConvertOutput((await buildOutputPath(`converted.${convertFormat}`)) || "")}>Choose output</button>
        </div>
        <button className="btn-primary" onClick={handleConvert}>
          Add Job
        </button>
      </div>

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title text-lg">Batch Convert</h2>
          <span className="badge">Batch</span>
        </div>
        <FilePicker label="Source images" value={batchInputs} onPick={setBatchInputs} multiple accept={[".png", ".jpg", ".jpeg", ".webp", ".tiff"]} />
        <FilePicker label="Output folder" value={batchOutputDir} onPick={setBatchOutputDir} directory helper="Each file keeps its name with the new extension." />
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-slate-400">Format</label>
            <select className="select" value={batchFormat} onChange={(e) => setBatchFormat(e.target.value)}>
              {IMAGE_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Quality</label>
            <input
              className="input"
              type="range"
              min={50}
              max={100}
              value={batchQuality}
              onChange={(e) => setBatchQuality(Number(e.target.value))}
            />
            <div className="text-xs text-slate-500">{batchQuality}</div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={batchGrayscale} onChange={(e) => setBatchGrayscale(e.target.checked)} />
            Grayscale
          </label>
        </div>
        <button className="btn-primary" onClick={handleBatch}>
          Add Jobs
        </button>
      </div>

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title text-lg">Resize Image</h2>
          <span className="badge">Aspect Ratio</span>
        </div>
        <FilePicker label="Source image" value={resizeInput} onPick={setResizeInput} accept={[".png", ".jpg", ".jpeg", ".webp", ".tiff"]} />
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="text-xs text-slate-400">Width</label>
            <input className="input" value={resizeWidth} onChange={(e) => setResizeWidth(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Height</label>
            <input className="input" value={resizeHeight} onChange={(e) => setResizeHeight(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Format</label>
            <select className="select" value={resizeFormat} onChange={(e) => setResizeFormat(e.target.value)}>
              {IMAGE_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Quality</label>
            <input
              className="input"
              type="range"
              min={50}
              max={100}
              value={resizeQuality}
              onChange={(e) => setResizeQuality(Number(e.target.value))}
            />
            <div className="text-xs text-slate-500">{resizeQuality}</div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={resizeGrayscale} onChange={(e) => setResizeGrayscale(e.target.checked)} />
          Grayscale
        </label>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input className="input" placeholder="Output path" value={resizeOutput} onChange={(e) => setResizeOutput(e.target.value)} />
          <button className="btn-secondary" onClick={async () => setResizeOutput((await buildOutputPath(`resized.${resizeFormat}`)) || "")}>Choose output</button>
        </div>
        <button className="btn-primary" onClick={handleResize}>
          Add Job
        </button>
      </div>
    </div>
  );
}
