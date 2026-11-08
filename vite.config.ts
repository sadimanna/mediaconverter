import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM ? "es2021" : "modules",
    minify: "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG
  }
}));
