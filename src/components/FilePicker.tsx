import React, { useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";

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

  const dropZoneRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Tauri v2 intercepts OS file drops and delivers real filesystem paths through
  // the webview's drag-drop event. Several pickers can be on screen at once, so
  // each one only accepts drops that land inside its own drop zone.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    let webview: ReturnType<typeof getCurrentWebview>;
    try {
      webview = getCurrentWebview();
    } catch {
      return; // Not running inside Tauri (e.g. plain `vite` in a browser): no native drops.
    }

    webview
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const zone = dropZoneRef.current;
        if (!zone || event.payload.paths.length === 0) return;
        const scale = window.devicePixelRatio || 1;
        const x = event.payload.position.x / scale;
        const y = event.payload.position.y / scale;
        const rect = zone.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          onPickRef.current(event.payload.paths);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-2">{label}</span>
        <button type="button" className="btn-secondary" onClick={handleBrowse}>
          Browse
        </button>
      </div>
      <div
        ref={dropZoneRef}
        className="dropzone"
      >
        {value.length === 0 ? (
          <div>Drag and drop files here.</div>
        ) : (
          <ul className="space-y-1">
            {value.map((item) => (
              <li key={item} className="truncate text-ink-2">
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
      {helper ? <p className="text-xs text-muted">{helper}</p> : null}
    </div>
  );
}
