import React from "react";
import { open } from "@tauri-apps/api/dialog";

type FilePickerProps = {
  label: string;
  value: string[];
  onPick: (paths: string[]) => void;
  multiple?: boolean;
  directory?: boolean;
  accept?: string[];
  helper?: string;
};

const normalizePaths = (input: string | string[] | null): string[] => {
  if (!input) return [];
  return Array.isArray(input) ? input : [input];
};

export default function FilePicker({
  label,
  value,
  onPick,
  multiple,
  directory,
  accept,
  helper
}: FilePickerProps) {
  const handleBrowse = async () => {
    const selection = await open({
      multiple: !!multiple,
      directory: !!directory,
      filters: accept
        ? [
            {
              name: "Files",
              extensions: accept.map((ext) => ext.replace(".", ""))
            }
          ]
        : undefined
    });

    onPick(normalizePaths(selection));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    const paths = files.map((file) => (file as unknown as { path?: string }).path).filter(Boolean) as string[];
    if (paths.length > 0) onPick(paths);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-200">{label}</span>
        <button type="button" className="btn-secondary" onClick={handleBrowse}>
          Browse
        </button>
      </div>
      <div
        className="rounded-lg border border-dashed border-slate-700/60 bg-ink/40 px-3 py-3 text-xs text-slate-400"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        {value.length === 0 ? (
          <div>Drag and drop files here.</div>
        ) : (
          <ul className="space-y-1">
            {value.map((item) => (
              <li key={item} className="truncate text-slate-200">
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}
