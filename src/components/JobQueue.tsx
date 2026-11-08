import React from "react";
import { DatasetRequest, StandardizeRequest } from "../api/ffmpeg";

type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

type JobKind = "ffmpeg" | "image-sequence" | "dataset" | "standardize";

export type JobItem = {
  clientId: string;
  backendId?: string;
  name: string;
  kind: JobKind;
  args: string[];
  inputs?: string[];
  frameRate?: number;
  dataset?: DatasetRequest;
  standardize?: StandardizeRequest;
  globalManifestCsv?: string;
  datasetTotalVideos?: number;
  datasetCompletedVideos?: number;
  datasetCurrentVideo?: string;
  datasetPerVideoProgress?: number;
  datasetOverallProgress?: number;
  summaryPath?: string;
  status: JobStatus;
  progress: number;
  command: string;
  logs: string[];
  output?: string;
};

type JobQueueProps = {
  jobs: JobItem[];
  onCancel: (job: JobItem) => void;
  onClearFinished: () => void;
  onSaveManifest: (job: JobItem) => void;
  onSaveSummary: (job: JobItem) => void;
};

const statusLabel = (status: JobStatus) => {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "done":
      return "Complete";
    case "error":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
};

export default function JobQueue({ jobs, onCancel, onClearFinished, onSaveManifest, onSaveSummary }: JobQueueProps) {
  const hasJobs = jobs.length > 0;
  const finishedCount = jobs.filter((job) => job.status === "done" || job.status === "error" || job.status === "cancelled").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>Job Queue</h1>
          <p className="text-sm text-muted mt-2">Background tasks run sequentially and stream progress in real time.</p>
        </div>
        {finishedCount > 0 ? (
          <button className="btn-secondary" onClick={onClearFinished}>
            Clear Finished ({finishedCount})
          </button>
        ) : null}
      </div>

      {!hasJobs ? (
        <div className="empty text-sm text-muted">
          No jobs yet. Add tasks from the Video, Image, Dataset, or Standardization tools.
        </div>
      ) : (
        <div className="jobs">
          {jobs.map((job) => (
            <div key={job.clientId} className="job space-y-3" data-status={job.status}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="job-name">{job.name}</h3>
                  <div className="job-status text-sm">
                    {statusLabel(job.status)}
                    {job.status === "running" ? <span className="num"> {Math.round(Math.min(100, Math.max(0, job.progress * 100)))}%</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {job.output ? <span className="tag job-output" title={job.output}>{job.output}</span> : null}
                  {(job.status === "running" || job.status === "queued") ? (
                    <button className="btn-secondary" onClick={() => onCancel(job)}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${Math.min(100, Math.max(0, job.progress * 100))}%` }} />
              </div>

              {job.kind === "dataset" ? (
                <div className="space-y-2 text-xs text-muted">
                  <div>Total videos: {job.datasetTotalVideos ?? "-"}</div>
                  <div>Completed videos: {job.datasetCompletedVideos ?? "-"}</div>
                  <div>Current video: {job.datasetCurrentVideo || "-"}</div>
                  <div className="space-y-1">
                    <div>Per-video progress</div>
                    <div className="progress-track">
                      <div
                        className="progress-bar"
                        style={{ width: `${Math.min(100, Math.max(0, job.datasetPerVideoProgress ?? 0))}%` }}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div>Overall progress</div>
                    <div className="progress-track">
                      <div
                        className="progress-bar"
                        style={{ width: `${Math.min(100, Math.max(0, job.datasetOverallProgress ?? 0))}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="text-xs text-muted">Command Preview</div>
                <div className="code-block">{job.command}</div>
              </div>

              {job.globalManifestCsv ? (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => onSaveManifest(job)}>
                    Save global_manifest.csv
                  </button>
                </div>
              ) : null}

              {job.summaryPath ? (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => onSaveSummary(job)}>
                    Save dataset_summary.json
                  </button>
                </div>
              ) : null}

              <details className="text-xs text-muted">
                <summary className="cursor-pointer text-sm">FFmpeg Logs</summary>
                <div className="code-block mt-2 max-h-48 overflow-auto">
                  {job.logs.length === 0 ? "No output yet." : job.logs.join("\n")}
                </div>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
