import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// One Vite build serves the web deployment and the Tauri shell (spec §43.3).
export default defineConfig({
  plugins: [svelte()],
  // Relative asset paths so the build works from any static host path and
  // from Tauri's custom protocol.
  base: "./",
  server: { port: 5173, strictPort: true },
  build: { target: "es2022", sourcemap: true },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.1.0"),
  },
});
