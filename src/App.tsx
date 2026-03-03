import React, { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/api/dialog";
import VideoTools from "./components/VideoTools";
import ImageTools from "./components/ImageTools";
import DatasetTools from "./components/DatasetTools";
import StandardizeTools from "./components/StandardizeTools";
import InspectorTools from "./components/InspectorTools";
import JobQueue, { JobItem } from "./components/JobQueue";
import {
  cancelJob,
  checkFfmpeg,
  copyFile,
  DatasetCompleteEvent,
  DatasetRequest,
  DatasetProgressEvent,
  FfmpegCheck,
  FfmpegExitEvent,
  FfmpegLogEvent,
  FfmpegProgressEvent,
  StandardizationCompleteEvent,
  StandardizeRequest,
  runDatasetExtraction,
  runFfmpegImageSequence,
  runFfmpegWithProgress,
  runStandardizationBatch
} from "./api/ffmpeg";

const buildCommand = (args: string[]) => {
  const escapeArg = (arg: string) => (/\s|"/.test(arg) ? `"${arg.replace(/"/g, "\\\"")}"` : arg);
  return ["ffmpeg", ...args].map(escapeArg).join(" ");
};

const buildSequenceCommand = (inputs: string[], frameRate: number, args: string[], output?: string) => {
  const preview = inputs.slice(0, 3).map((input) => input.split(/[/\\]/).pop()).join(", ");
  const suffix = inputs.length > 3 ? ` +${inputs.length - 3} more` : "";
  const base = `ffmpeg -f concat -safe 0 -i <${inputs.length} images: ${preview}${suffix}> -r ${frameRate}`;
  const rest = [...args, output ?? ""].filter(Boolean).join(" ");
  return `${base} ${rest}`.trim();
};

const buildDatasetCommand = (dataset?: DatasetRequest) => {
  if (!dataset) return "dataset extraction";
  if (dataset.input_dir) {
    return `dataset folder: ${dataset.mode}`;
  }
  if (dataset.mode === "fps") {
    return `dataset: fps=${dataset.fps ?? 1}`;
  }
  if (dataset.mode === "nth") {
    return `dataset: every ${dataset.nth ?? 10} frames`;
  }
  return `dataset: random k=${dataset.k ?? 10}, seed=${dataset.seed ?? 42}`;
};

const buildStandardizeCommand = (standardize?: StandardizeRequest) => {
  if (!standardize) return "standardize";
  if (standardize.mode === "audio") {
    return `standardize audio: ${standardize.audio_rate ?? 16000}Hz, ${standardize.audio_channels ?? 1}ch, ${standardize.audio_format ?? "wav"}`;
  }
  const fps = standardize.fps ?? 30;
  const codec = standardize.video_codec ?? "libx264";
  const container = standardize.video_container ?? "mp4";
  const interpolate = standardize.interpolate ? " + interpolate" : "";
  return `standardize video: ${fps}fps ${codec}.${container}${interpolate}`;
};

const defaultFfmpeg: FfmpegCheck = { available: true };
const createId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export default function App() {
  const [activeTab, setActiveTab] = useState<
    "video" | "image" | "dataset" | "standardize" | "inspector" | "queue" | "settings"
  >("video");
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [ffmpegInfo, setFfmpegInfo] = useState<FfmpegCheck>(defaultFfmpeg);
  const pendingProgress = useRef<Map<string, FfmpegProgressEvent>>(new Map());
  const pendingDatasetProgress = useRef<Map<string, DatasetProgressEvent>>(new Map());
  const jobsRef = useRef<JobItem[]>([]);

  const queuedJob = useMemo(() => jobs.find((job) => job.status === "queued"), [jobs]);

  const updateJob = (predicate: (job: JobItem) => boolean, updater: (job: JobItem) => JobItem) => {
    setJobs((prev) => prev.map((job) => (predicate(job) ? updater(job) : job)));
  };

  const addJob = (input: {
    name: string;
    args?: string[];
    output?: string;
    kind?: JobItem["kind"];
    inputs?: string[];
    frameRate?: number;
    dataset?: DatasetRequest;
    standardize?: StandardizeRequest;
  }) => {
    const clientId = createId();
    const kind = input.kind ?? "ffmpeg";
    const args = input.args ?? [];
    const command =
      kind === "image-sequence"
        ? buildSequenceCommand(input.inputs ?? [], input.frameRate ?? 30, args, input.output)
        : kind === "dataset"
          ? buildDatasetCommand(input.dataset)
          : kind === "standardize"
            ? buildStandardizeCommand(input.standardize)
            : buildCommand(args);

    setJobs((prev) => [
      ...prev,
      {
        clientId,
        name: input.name,
        kind,
        args,
        inputs: input.inputs,
        frameRate: input.frameRate,
        dataset: input.dataset,
        standardize: input.standardize,
        output: input.output,
        status: "queued",
        progress: 0,
        command,
        logs: []
      }
    ]);
    setActiveTab("queue");
  };

  const startJob = async (job: JobItem) => {
    updateJob((item) => item.clientId === job.clientId, (item) => ({ ...item, status: "running" }));
    try {
      let backendId: string;
      if (job.kind === "image-sequence") {
        if (!job.inputs || job.inputs.length === 0 || !job.output) {
          throw new Error("Missing image sequence inputs or output path.");
        }
        backendId = await runFfmpegImageSequence(job.inputs, job.frameRate ?? 30, job.args, job.output);
      } else if (job.kind === "dataset") {
        if (!job.dataset) {
          throw new Error("Missing dataset configuration.");
        }
        backendId = await runDatasetExtraction(job.dataset);
      } else if (job.kind === "standardize") {
        if (!job.standardize) {
          throw new Error("Missing standardization configuration.");
        }
        backendId = await runStandardizationBatch(job.standardize);
      } else {
        backendId = await runFfmpegWithProgress(job.args);
      }

      setRunningJobId(backendId);
      updateJob((item) => item.clientId === job.clientId, (item) => ({ ...item, backendId }));

      const pending = pendingProgress.current.get(backendId);
      if (pending) {
        pendingProgress.current.delete(backendId);
        applyProgress(pending);
      }

      const pendingDataset = pendingDatasetProgress.current.get(backendId);
      if (pendingDataset) {
        pendingDatasetProgress.current.delete(backendId);
        applyDatasetProgress(pendingDataset);
      }
    } catch (error) {
      updateJob((item) => item.clientId === job.clientId, (item) => ({
        ...item,
        status: "error",
        logs: [...item.logs, `Failed to start: ${String(error)}`]
      }));
      setRunningJobId(null);
    }
  };

  const applyProgress = (event: FfmpegProgressEvent) => {
    updateJob(
      (item) => item.backendId === event.job_id,
      (item) => ({
        ...item,
        progress: event.percent !== undefined && event.percent >= 0 ? event.percent : item.progress
      })
    );
  };

  const applyLog = (event: FfmpegLogEvent) => {
    updateJob(
      (item) => item.backendId === event.job_id,
      (item) => {
        const logs = [...item.logs, event.line];
        if (logs.length > 500) logs.splice(0, logs.length - 500);
        return { ...item, logs };
      }
    );
  };

  const applyDatasetProgress = (event: DatasetProgressEvent) => {
    updateJob(
      (item) => item.backendId === event.job_id,
      (item) => ({
        ...item,
        datasetTotalVideos: event.total_videos,
        datasetCompletedVideos: event.completed_videos,
        datasetCurrentVideo: event.current_video,
        datasetPerVideoProgress: event.per_video_progress,
        datasetOverallProgress: event.overall_progress,
        progress: event.overall_progress / 100.0
      })
    );
  };

  const applyExit = (event: FfmpegExitEvent) => {
    setRunningJobId(null);
    updateJob(
      (item) => item.backendId === event.job_id,
      (item) => ({
        ...item,
        status: item.status === "cancelled" ? "cancelled" : event.success ? "done" : "error",
        progress: 1
      })
    );
  };

  const handleCancel = async (job: JobItem) => {
    if (job.status === "queued") {
      updateJob((item) => item.clientId === job.clientId, (item) => ({ ...item, status: "cancelled" }));
      return;
    }
    if (job.backendId) {
      updateJob((item) => item.clientId === job.clientId, (item) => ({ ...item, status: "cancelled" }));
      await cancelJob(job.backendId);
    }
  };

  const handleSaveManifest = async (job: JobItem) => {
    const source = job.globalManifestCsv;
    if (!source) return;
    const destination = await save({
      defaultPath: "global_manifest.csv"
    });
    if (!destination) return;
    await copyFile(source, destination);
  };

  const handleSaveSummary = async (job: JobItem) => {
    if (!job.summaryPath) return;
    const destination = await save({
      defaultPath: "dataset_summary.json"
    });
    if (!destination) return;
    await copyFile(job.summaryPath, destination);
  };

  const clearFinished = () => {
    setJobs((prev) => prev.filter((job) => job.status === "running" || job.status === "queued"));
  };

  useEffect(() => {
    if (!runningJobId && queuedJob) {
      void startJob(queuedJob);
    }
  }, [queuedJob, runningJobId]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    void checkFfmpeg().then(setFfmpegInfo).catch((error) => {
      setFfmpegInfo({ available: false, error: String(error) });
    });

    const unlisteners: Array<() => void> = [];

    const setupListeners = async () => {
      unlisteners.push(
        await listen<FfmpegProgressEvent>("ffmpeg-progress", (event) => {
          if (!jobsRef.current.find((job) => job.backendId === event.payload.job_id)) {
            pendingProgress.current.set(event.payload.job_id, event.payload);
            return;
          }
          applyProgress(event.payload);
        })
      );

      unlisteners.push(
        await listen<FfmpegLogEvent>("ffmpeg-log", (event) => {
          applyLog(event.payload);
        })
      );

      unlisteners.push(
        await listen<FfmpegExitEvent>("ffmpeg-exit", (event) => {
          applyExit(event.payload);
        })
      );

      unlisteners.push(
        await listen<DatasetCompleteEvent>("dataset-complete", (event) => {
          updateJob(
            (item) => item.backendId === event.payload.job_id,
            (item) => ({
              ...item,
              globalManifestCsv: event.payload.global_manifest_csv,
              logs: [
                ...item.logs,
                `Global manifest created (${event.payload.frame_count} frames across ${event.payload.video_count} videos).`
              ]
            })
          );
        })
      );

      unlisteners.push(
        await listen<DatasetProgressEvent>("dataset-progress", (event) => {
          if (!jobsRef.current.find((job) => job.backendId === event.payload.job_id)) {
            pendingDatasetProgress.current.set(event.payload.job_id, event.payload);
            return;
          }
          applyDatasetProgress(event.payload);
        })
      );

      unlisteners.push(
        await listen<StandardizationCompleteEvent>("standardization-complete", (event) => {
          updateJob(
            (item) => item.backendId === event.payload.job_id,
            (item) => ({
              ...item,
              summaryPath: event.payload.summary_path,
              logs: [...item.logs, `dataset_summary.json created (${event.payload.item_count} items).`]
            })
          );
        })
      );

      unlisteners.push(
        await listen<FfmpegCheck>("ffmpeg-check", (event) => {
          setFfmpegInfo(event.payload);
        })
      );
    };

    void setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  return (
    <div className="min-h-screen p-6">
      <div className="app-shell mx-auto max-w-6xl p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">FFmpeg Studio</h1>
            <p className="text-sm text-slate-400">Tauri-powered media conversion suite</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ffmpegInfo.available ? (
              <span className="badge">FFmpeg ready {ffmpegInfo.version ? `(${ffmpegInfo.version})` : ""}</span>
            ) : (
              <span className="badge text-coral border-coral/40">FFmpeg missing</span>
            )}
          </div>
        </header>

        {!ffmpegInfo.available ? (
          <div className="mt-4 rounded-xl border border-coral/40 bg-coral/10 p-4 text-sm text-coral">
            FFmpeg is not available on this system. Install FFmpeg and restart the app. {ffmpegInfo.error}
          </div>
        ) : null}

        <nav className="mt-6 flex flex-wrap gap-2">
          {([
            { id: "video", label: "Video" },
            { id: "image", label: "Image" },
            { id: "dataset", label: "Dataset Extraction" },
            { id: "standardize", label: "Standardization" },
            { id: "inspector", label: "Inspector" },
            { id: "queue", label: "Queue" },
            { id: "settings", label: "Settings" }
          ] as const).map((tab) => (
            <button
              key={tab.id}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.id ? "bg-mint text-ink" : "bg-slate-800/60 text-slate-200 hover:text-mint"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="mt-6">
          {activeTab === "video" ? <VideoTools onAddJob={addJob} /> : null}
          {activeTab === "image" ? <ImageTools onAddJob={addJob} /> : null}
          {activeTab === "dataset" ? <DatasetTools onAddJob={addJob} /> : null}
          {activeTab === "standardize" ? <StandardizeTools onAddJob={addJob} /> : null}
          {activeTab === "inspector" ? <InspectorTools /> : null}
          {activeTab === "queue" ? (
            <JobQueue
              jobs={jobs}
              onCancel={handleCancel}
              onClearFinished={clearFinished}
              onSaveManifest={handleSaveManifest}
              onSaveSummary={handleSaveSummary}
            />
          ) : null}
          {activeTab === "settings" ? (
            <div className="glass-card p-6 space-y-4">
              <h2 className="section-title text-lg">Settings</h2>
              <div className="text-sm text-slate-300">
                <p>FFmpeg status: {ffmpegInfo.available ? "Available" : "Missing"}</p>
                {ffmpegInfo.version ? <p>Version: {ffmpegInfo.version}</p> : null}
                <p className="text-xs text-slate-500 mt-2">Tip: enable hardware acceleration by adding NVENC, VideoToolbox, or QSV flags to presets.</p>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
