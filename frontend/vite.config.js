import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    // Running Vite inside Docker with the source bind-mounted from macOS
    // means inotify events arrive ahead of the bytes — the watcher catches
    // partial files and surfaces "eof-in-tag" overlays. Polling avoids the
    // race by reading at a steady interval after the write settles.
    watch: { usePolling: true, interval: 200 },
  },
});
