# FFmpeg Studio (Tauri + React)

FFmpeg Studio is a cross‑platform desktop app built with Tauri (Rust) and React that wraps FFmpeg into a clean, modern GUI. It’s designed for real production work: video conversion, image processing, dataset extraction, and media inspection — all with job queues, progress tracking, and deterministic outputs.

A production-ready desktop template that wraps FFmpeg with a modern GUI. Built with Tauri (Rust) and React (Vite) for cross-platform distribution.

## Screenshots

![Video Tools](assets/demo_video.png)
![Image Tools](assets/demo_image.png)
![Dataset Extraction](assets/demo_dataext.png)
![Standardization](assets/demo_std.png)
![Inspector](assets/demo_insp.png)

## Features

- Video: convert formats, remux, trim, extract audio, merge external audio
- GIF to video conversion
- Image sequences to video
- Image: convert formats, batch conversion, resize with aspect ratio preserved, quality control, grayscale
- Dataset Extraction: deterministic video-to-frames pipeline with per-video and global manifests
- Multimodal Standardization: batch-normalize video FPS or audio sampling rate with dataset summary output
- Media Inspector: ffprobe-based per-file metadata and dataset-level stats
- Job queue with per-task progress, cancellation, and logs
- Real-time FFmpeg progress via `-progress pipe:1`

## Download

Prebuilt installers for macOS, Windows and Linux are attached to each [GitHub Release](https://github.com/sadimanna/mediaconverter/releases/latest). They are built by GitHub Actions from the tagged commit.

You still need FFmpeg installed (see [Install FFmpeg](#install-ffmpeg)); the app does not bundle it.

## Build Requirements

Tested versions, as pinned in `package-lock.json` and `src-tauri/Cargo.lock`:

| Component | Version | Notes |
| --- | --- | --- |
| Node.js | 20 LTS or newer (CI uses 20; also tested on 22) | npm 10+ |
| Rust | 1.93.1, pinned in `src-tauri/rust-toolchain.toml` | `rustup` installs it automatically on first build |
| Tauri | 1.8 (Rust crate), CLI 1.6.3, API 1.6.0 | Tauri v1, not v2 |
| React | 18.3 | |
| Vite | 5.4 | |
| TypeScript | 5.9 | |
| Tailwind CSS | 3.4 | |
| FFmpeg | any recent build with `ffmpeg` and `ffprobe` (tested on 8.0) | needed at runtime |

`npm ci` and Cargo install exactly the locked versions, and rustup picks the pinned Rust, so a local build matches the release build. Newer Rust releases fail to compile the Tauri v1 Linux backend (`wry` 0.24), which is why Rust is pinned.

Supported desktop systems: macOS 10.13+, Windows 10/11, and Linux with WebKitGTK 4.0 (Ubuntu 22.04 is what CI uses).

## Install Build Tools

### macOS

```bash
xcode-select --install
brew install node
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Windows (PowerShell)

Install the [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload. WebView2 ships with Windows 10 and 11.

```powershell
winget install OpenJS.NodeJS.LTS
winget install Rustlang.Rustup
```

### Linux (Debian / Ubuntu)

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl wget file libssl-dev \
  libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 20
```

`libwebkit2gtk-4.0-dev` is not available on Ubuntu 24.04 and newer; build there in an Ubuntu 22.04 container or VM.

Check the toolchain:

```bash
node -v
rustc --version
```

## Install FFmpeg

`ffmpeg` and `ffprobe` must be installed. The app looks on your PATH first, then in `/opt/homebrew/bin`, `/usr/local/bin`, `/opt/local/bin`, `/usr/bin` and `/snap/bin`.

```bash
brew install ffmpeg              # macOS
sudo apt-get install -y ffmpeg   # Debian / Ubuntu
```

```powershell
winget install Gyan.FFmpeg       # Windows
```

## Build and Run

From the project folder:

```bash
npm ci
```

Run in dev mode (Vite dev server plus the Tauri window, with live reload):

```bash
npx tauri dev
```

Build native installers into `src-tauri/target/release/bundle/`:

```bash
npx tauri build
```

The window colour (dark, blue, pink, green, chrome yellow or white) is chosen in the app under Settings.

## Releasing

Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, commit, then push a matching tag. The workflow builds all three platforms and publishes the release.

```bash
git tag v1.0.3
git push origin v1.0.3
```

## Project Structure

```
MediaConverter/
├─ src/                     # React frontend
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ components/
│  │  ├─ VideoTools.tsx
│  │  ├─ ImageTools.tsx
│  │  ├─ DatasetTools.tsx
│  │  ├─ StandardizeTools.tsx
│  │  ├─ InspectorTools.tsx
│  │  ├─ JobQueue.tsx
│  │  └─ FilePicker.tsx
│  ├─ api/
│  │  └─ ffmpeg.ts
│  ├─ theme.ts             # window colour themes
│  └─ styles/
│     ├─ index.css
│     ├─ tokens.css         # design tokens (colours, type, spacing)
│     ├─ base.css
│     └─ themes.css         # pastel and dark theme overrides
├─ src-tauri/               # Tauri Rust backend
│  ├─ src/
│  │  ├─ main.rs
│  │  ├─ ffmpeg.rs
│  │  └─ progress.rs
│  ├─ tauri.conf.json
│  └─ Cargo.toml
├─ presets.json
├─ package.json
└─ README.md
```

## FFmpeg Command Examples

Video convert (Fast MP4):

```
ffmpeg -i input.mkv -c:v libx264 -preset ultrafast -crf 28 -c:a aac -b:a 128k output.mp4
```

Audio extraction (MP3):

```
ffmpeg -i input.mp4 -vn -c:a libmp3lame -q:a 2 audio.mp3
```

Merge external audio with video:

```
ffmpeg -i input.mp4 -i audio.wav -c:v copy -c:a aac -b:a 192k -shortest merged.mp4
```

GIF to MP4:

```
ffmpeg -i animation.gif -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p animation.mp4
```

Image sequence to video (30 fps):

```
ffmpeg -f concat -safe 0 -i images.txt -r 30 -c:v libx264 -preset medium -crf 20 sequence.mp4
```

Dataset extraction (FPS sampling):

```
ffmpeg -i input.mp4 -vf "fps=5,showinfo" -vsync 0 -c:v png frame_%06d.png
```

Standardize video (30 fps H.264):

```
ffmpeg -i input.mov -r 30 -c:v libx264 -pix_fmt yuv420p -c:a copy input_std.mp4
```

Standardize audio (16kHz mono WAV):

```
ffmpeg -i input.mp4 -vn -ar 16000 -ac 1 -c:a pcm_s16le input_std.wav
```

Image conversion (JPEG -> WebP):

```
ffmpeg -i image.jpg -quality 85 image.webp
```

## Dataset Extraction

- Select a folder of videos (top-level only) or a single file
- Frames are saved in `output/<video_id>/` with names like `videoID_000001.png`
- Each video gets `manifest.csv`, plus a `global_manifest.csv` at the root
- Failures are appended to `errors.log` and processing continues

## Multimodal Standardization

- Batch normalization for video FPS or audio sample rate/channel layout
- Presets for Speech ML (16kHz mono) and Video ML (30fps H.264)
- Outputs include `dataset_summary.json` with per-file metadata and checksums

## Presets

Edit `presets.json` to add or tune conversion presets. Each preset is mapped directly into FFmpeg arguments.

## Troubleshooting

- **FFmpeg missing**: Ensure `ffmpeg` and `ffprobe` are available in your PATH.
- **No progress**: Some formats do not report duration. Progress will show indeterminate behavior until FFmpeg ends.
- **Permission errors**: Verify the output path is writable.

## Packaging Notes

This template does **not** statically link FFmpeg. Your target system must have FFmpeg installed.

To customize icons for installers, add icons and update `src-tauri/tauri.conf.json` `bundle.icon`.

## Release Disclaimer

macOS and Windows release binaries are built **without code-signing or notarization** by default. Some systems may block or warn when launching these installers. You can still run the app locally in dev mode from the terminal using `npx tauri dev`.

## Security Notes

- Tauri allowlist is limited to `dialog` APIs in `src-tauri/tauri.conf.json`.
- FFmpeg is launched directly by the Rust backend; only validated user inputs should be passed.
- If you extend file system access (e.g., Tauri FS API), update the allowlist accordingly.

## Extension Points

- GPU acceleration (NVENC, VideoToolbox, QSV): add flags in `presets.json` or new UI presets.
- Multi-pass or advanced filters: add new job builders in `src/components/VideoTools.tsx` and `src/components/ImageTools.tsx`.
- Dataset sampling modes: extend `run_dataset_extraction` in `src-tauri/src/ffmpeg.rs`.
