import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base: the same build works at a domain root and under /<repo>/ on GitHub Pages.
  base: "./",
  plugins: [react()],
  server: { port: 5173, open: false },
});
