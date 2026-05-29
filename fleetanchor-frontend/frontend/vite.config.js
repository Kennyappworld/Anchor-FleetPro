import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    // Deduplicate React — prevent multiple instances
    dedupe: ["react", "react-dom", "react-router-dom"],
  },
  server: {
    port: 3000,
    proxy: { "/api": { target: "http://localhost:5000", changeOrigin: true } },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    minify: "esbuild",
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React MUST stay together in one chunk — never split it
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-router-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "react-core";
          }
          // Charts — only on analytics pages
          if (id.includes("recharts") || id.includes("d3-")) {
            return "charts";
          }
          // PDF — only on invoice pages
          if (id.includes("jspdf") || id.includes("jspdf-autotable")) {
            return "pdf";
          }
          // Excel — only on vehicle import
          if (id.includes("xlsx") || id.includes("papaparse")) {
            return "spreadsheet";
          }
          // Everything else from node_modules goes in vendor
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  optimizeDeps: {
    include: [
      "react", "react-dom", "react-router-dom",
      "axios", "zustand", "react-hot-toast", "lucide-react",
    ],
  },
});


